const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const readline = require('readline');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const axios    = require('axios');
const sharp    = require('sharp');

const app  = express();
const PORT = process.env.PORT || 3030;
const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:12b';

const JOBS_DIR   = path.join(__dirname, 'jobs');
const OUTPUT_DIR = path.join(__dirname, 'output');
[JOBS_DIR, OUTPUT_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const jobDir  = id => path.join(JOBS_DIR, id);

// ─── persistent Python worker (keeps the neural nets loaded) ────────────────
class PyWorker {
  constructor() { this.pending = new Map(); this.seq = 0; this.start(); }
  start() {
    this.proc = spawn(path.join(__dirname, 'venv/bin/python'), ['-u', path.join(__dirname, 'worker.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
    readline.createInterface({ input: this.proc.stdout }).on('line', line => {
      let m; try { m = JSON.parse(line); } catch { return; }
      const p = this.pending.get(m.id); if (!p) return;
      this.pending.delete(m.id);
      m.ok ? p.resolve(m.result) : p.reject(new Error(m.error || 'worker error'));
    });
    this.proc.stderr.on('data', d => { const t = String(d); if (!/UserWarning|onnxruntime/i.test(t)) process.stderr.write('[py] ' + t); });
    this.proc.on('exit', code => {
      console.warn('[worker] exited', code);
      for (const [, p] of this.pending) p.reject(new Error('Worker restarted, please try again'));
      this.pending.clear();
      setTimeout(() => this.start(), 500);
    });
  }
  call(cmd, args, timeoutMs = 150000) {
    if (this.pending.size >= 12) return Promise.reject(Object.assign(new Error('Server is busy, try again in a moment'), { status: 503 }));
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error('Timed out')); this.proc.kill('SIGKILL'); }, timeoutMs);
      this.pending.set(id, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } });
      this.proc.stdin.write(JSON.stringify({ id, cmd, args }) + '\n');
    });
  }
}
const worker = new PyWorker();
process.on('exit', () => worker.proc && worker.proc.kill());

// ─── Ollama vision: describes the photo and suggests starting settings ──────
const WEIGHT = { thin: 0.25, medium: 0.4, bold: 0.6 };
const DETAIL = { minimal: 25, moderate: 50, heavy: 75 };
const CLEAN  = { simple: 60, medium: 35, complex: 15 };
async function analyze(buf) {
  try {
    const small = await sharp(buf).resize(896, 896, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
    const r = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: OLLAMA_MODEL, stream: false, think: false, format: 'json', keep_alive: '30m',
      options: { temperature: 0.1 },
      images: [small.toString('base64')],
      prompt: 'You are a tattoo stencil artist. Look at this photo and plan a clean line-art stencil of its main subject only (outlines, no fills, background removed). ' +
        'Reply with JSON only: {"subject":"main subject in at most 6 words","category":"portrait|animal|floral|object|vehicle|text|scene|other",' +
        '"lineWeight":"thin|medium|bold","lineComplexity":"simple|medium|complex","shadingDensity":"minimal|moderate|heavy","notes":"one short tip for the tattoo artist"}'
    }, { timeout: 45000 });
    const j = JSON.parse((r.data.response || '').match(/\{[\s\S]*\}/)[0]);
    return {
      subject: String(j.subject || '').slice(0, 60), category: j.category, notes: String(j.notes || '').slice(0, 200),
      suggest: { weightMm: WEIGHT[j.lineWeight] || 0.4, detail: DETAIL[j.shadingDensity] || 50, cleanup: CLEAN[j.lineComplexity] || 35 },
      raw: { lineWeight: j.lineWeight, lineComplexity: j.lineComplexity, shadingDensity: j.shadingDensity }
    };
  } catch (e) {
    console.warn('[ollama] analysis skipped:', e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0, 200)}` : e.message);
    return null;
  }
}

// ─── upload handling ────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => { req.jobId = uuidv4(); const d = jobDir(req.jobId); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (_r, file, cb) => cb(null, 'upload' + (path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg'))
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_r, file, cb) => cb(/^image\//.test(file.mimetype) ? null : new Error('Only image files are accepted'), /^image\//.test(file.mimetype))
});

app.use(express.json({ limit: '100kb' }));
app.use('/api', (_q, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(OUTPUT_DIR, { maxAge: 0 }));
app.get('/api/health', (_q, res) => res.json({ status: 'ok', version: '3.0.0' }));

const wrap = fn => (req, res) => fn(req, res).catch(e => {
  console.error(`[${req.path}]`, e.message);
  res.status(e.status || 500).json({ error: e.message });
});
const need = (req) => { const id = req.body && req.body.jobId; if (!UUID_RE.test(id || '') || !fs.existsSync(jobDir(id))) throw Object.assign(new Error('Session expired. Please re-upload the photo.'), { status: 404 }); return id; };

// 1) the (already cropped / adjusted) photo -> job, auto subject, AI suggestions
app.post('/api/prepare', upload.single('photo'), wrap(async (req, res) => {
  if (!req.file) throw Object.assign(new Error('No photo uploaded'), { status: 400 });
  const id = req.jobId, t0 = Date.now();
  const [prep, ai] = await Promise.all([
    worker.call('prepare', { dir: jobDir(id) }),
    analyze(fs.readFileSync(req.file.path))
  ]);
  console.log(`[job ${id}] prepared ${prep.width}x${prep.height} subject=${prep.coverage} ai=${ai ? ai.subject : 'n/a'} ${Date.now() - t0}ms`);
  res.json({ jobId: id, ...prep, overlay: `/api/overlay/${id}?v=${prep.ver}`, ai });
}));

app.get('/api/overlay/:id', (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.sendStatus(404);
  res.sendFile(path.join(jobDir(req.params.id), 'overlay.png'), e => e && !res.headersSent && res.sendStatus(404));
});

// 2) choose the subject: clicks (+/-) or reset to auto; {warm:true} pre-computes the click model
app.post('/api/subject', wrap(async (req, res) => {
  const id = need(req);
  const clean = (req.body.points || []).slice(0, 24).map(p => ({ x: Math.min(1, Math.max(0, +p.x)), y: Math.min(1, Math.max(0, +p.y)), l: p.l ? 1 : 0 }));
  const r = await worker.call('segment', { dir: jobDir(id), points: clean, warm: !!req.body.warm });
  res.json(req.body.warm ? { ok: true } : { ...r, overlay: `/api/overlay/${id}?v=${r.ver}` });
}));

// 3) render the stencil (fast after the first call: line drawings are cached per job)
let renderN = 0;
app.post('/api/render', wrap(async (req, res) => {
  const id = need(req), b = req.body, n = ++renderN;
  const num = (v, d) => Number.isFinite(+v) ? +v : d;
  const base = `${id}-${n}`;
  const r = await worker.call('render', {
    dir: jobDir(id), outbase: path.join(OUTPUT_DIR, base),
    detail: num(b.detail, 50), weightMm: num(b.weightMm, 0.4), cleanup: num(b.cleanup, 35),
    background: num(b.background, 0), sizeIn: num(b.sizeIn, 5), mirror: !!b.mirror
  });
  fs.readdir(OUTPUT_DIR, (_e, files) => (files || []).filter(f => f.startsWith(id + '-') && !f.startsWith(base) && Date.now() - fs.statSync(path.join(OUTPUT_DIR, f)).mtimeMs > 60000)
    .forEach(f => fs.unlink(path.join(OUTPUT_DIR, f), () => {})));
  res.json({ success: true, jobId: id, files: { png: `/output/${base}.png`, pdf: `/output/${base}.pdf` }, ...r, png: undefined, pdf: undefined });
}));

app.use((err, _q, res, _n) => res.status(err.status || 400).json({ error: err.message }));

// ─── housekeeping ───────────────────────────────────────────────────────────
function cleanup() {
  const now = Date.now();
  for (const [dir, age] of [[JOBS_DIR, 3 * 3600e3], [OUTPUT_DIR, 3 * 3600e3]]) {
    fs.readdir(dir, (_e, items) => (items || []).forEach(f => {
      const fp = path.join(dir, f);
      fs.stat(fp, (_e2, st) => { if (st && now - st.mtimeMs > age) fs.rm(fp, { recursive: true, force: true }, () => {}); });
    }));
  }
}
setInterval(cleanup, 20 * 60 * 1000); cleanup();

app.listen(PORT, '0.0.0.0', () => console.log(`TattooShop v3 on http://0.0.0.0:${PORT}`));
