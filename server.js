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
    }, { timeout: 120000 });
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

const aiJobs = new Map();
app.get('/api/ai/:id', (req, res) => res.json(aiJobs.get(req.params.id) || { status: 'none', ai: null }));

// 1) the (already cropped / adjusted) photo -> job, auto subject, AI suggestions
app.post('/api/prepare', upload.single('photo'), wrap(async (req, res) => {
  if (!req.file) throw Object.assign(new Error('No photo uploaded'), { status: 400 });
  const id = req.jobId, t0 = Date.now();
  const buf = fs.readFileSync(req.file.path);
  aiJobs.set(id, { status: 'pending', ai: null });
  analyze(buf).then(ai => { aiJobs.set(id, { status: 'done', ai }); console.log(`[job ${id}] ai=${ai ? ai.subject : 'n/a'} ${Date.now() - t0}ms`); });   // runs in the background
  const prep = await worker.call('prepare', { dir: jobDir(id) });
  console.log(`[job ${id}] prepared ${prep.width}x${prep.height} subject=${prep.coverage} ${Date.now() - t0}ms`);
  res.json({ jobId: id, ...prep, overlay: `/api/overlay/${id}?v=${prep.ver}`, ai: null });
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
  const rng = (v, d, lo, hi) => Math.min(hi, Math.max(lo, num(v, d)));   // ranges from the per-slider sweeps
  const base = `${id}-${n}`;
  const r = await worker.call('render', {
    dir: jobDir(id), outbase: path.join(OUTPUT_DIR, base),
    detail: rng(b.detail, 65, 20, 90), weightMm: rng(b.weightMm, 0.4, 0.35, 0.7), cleanup: rng(b.cleanup, 30, 15, 70),
    background: num(b.background, 0), sizeIn: num(b.sizeIn, 5), mirror: !!b.mirror,
    smooth: rng(b.smooth, 10, 10, 35), texture: rng(b.texture, 0, 0, 10), skin: rng(b.skin, 0, 0, 15),
    fills: rng(b.fills, 40, 0, 50), shadows: rng(b.shadows, 0, 0, 15), varw: rng(b.varw, 60, 0, 100), stubble: rng(b.stubble, 50, 0, 65), light: rng(b.light, 0, 0, 50)
  });
  fs.readdir(OUTPUT_DIR, (_e, files) => (files || []).filter(f => f.startsWith(id + '-') && !f.startsWith(base) && Date.now() - fs.statSync(path.join(OUTPUT_DIR, f)).mtimeMs > 60000)
    .forEach(f => fs.unlink(path.join(OUTPUT_DIR, f), () => {})));
  res.json({ success: true, jobId: id, files: { png: `/output/${base}.png`, pdf: `/output/${base}.pdf` }, ...r, png: undefined, pdf: undefined });
}));

// save the pre-processed photo (crop/rotate/levels from the browser + the smoothing filters)
app.post('/api/filtered', wrap(async (req, res) => {
  const id = need(req), b = req.body, num = (v, d) => Number.isFinite(+v) ? Math.min(100, Math.max(0, +v)) : d;
  const out = path.join(jobDir(id), 'filtered.jpg');
  await worker.call('filtered', { dir: jobDir(id), out, smooth: num(b.smooth, 0), texture: num(b.texture, 0), skin: num(b.skin, 0), stubble: num(b.stubble, 0) });
  res.download(out, 'tattoo-photo-prepared.jpg');
}));


// ─── AI redraw (SDXL + tattoo LoRA + ControlNet, AMD GPU) ───────────────────
class GenWorker {
  constructor() { this.proc = null; this.pending = new Map(); this.seq = 0; this.idle = null; this.busy = false; }
  available() { return fs.existsSync(path.join(__dirname, 'models/gen/tattoo-lora/SDXL-tattoo-Lora.safetensors')) && fs.existsSync(path.join(__dirname, 'models/gen/sdxl/unet/diffusion_pytorch_model.fp16.safetensors')) && fs.existsSync(path.join(__dirname, 'venv-gen/bin/python')); }
  ensure() {
    if (this.proc) return;
    this.proc = spawn(path.join(__dirname, 'venv-gen/bin/python'), ['-u', path.join(__dirname, 'gen_worker.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
    readline.createInterface({ input: this.proc.stdout }).on('line', line => {
      let m; try { m = JSON.parse(line); } catch { return; }
      const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id);
      m.ok ? p.resolve(m.result) : p.reject(new Error(m.error || 'generator error'));
    });
    this.proc.stderr.on('data', d => { const t = String(d); if (!/Warning|warn/i.test(t)) process.stderr.write('[gen] ' + t); });
    this.proc.on('exit', code => {
      console.warn('[gen] exited', code); this.proc = null; this.busy = false;
      for (const [, p] of this.pending) p.reject(new Error('The image generator stopped, please try again'));
      this.pending.clear();
    });
  }
  stop() { if (this.proc) { this.proc.kill('SIGKILL'); this.proc = null; } }
  call(cmd, args, timeoutMs = 420000) {
    if (this.busy) return Promise.reject(Object.assign(new Error('The AI generator is busy with another job, try again in a minute'), { status: 503 }));
    this.busy = true; clearTimeout(this.idle); this.ensure();
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const done = () => { this.busy = false; clearTimeout(t); this.idle = setTimeout(() => this.stop(), 8 * 60e3); };   // free the GPU when idle
      const t = setTimeout(() => { this.pending.delete(id); this.stop(); this.busy = false; reject(new Error('The AI generator timed out')); }, timeoutMs);
      this.pending.set(id, { resolve: v => { done(); resolve(v); }, reject: e => { done(); reject(e); } });
      this.proc.stdin.write(JSON.stringify({ id, cmd, args }) + '\n');
    });
  }
}
const gen = new GenWorker();
process.on('exit', () => gen.stop());
const genJobs = new Map();

const PROMPTS = {
  stencil: {
    scale: 0.85, guidance: 7.5, steps: 28,
    positive: s => `A graphic vector tattoo flash art portrait of ${s}, inspired by bold traditional comic ink style, high-contrast lighting creating stark solid black shadow shapes, crisp white highlights, razor-sharp textures, rim lighting tracing the contours, deep black ink outlines, clean solid white background, 2D illustration style, stencil-ready`,
    negative: 'gradients, soft shading, ambient light, global illumination, photorealism, gray midtones, blurry textures, photograph, photorealistic, 3d render, 3d shading, gradient shading, grey background, grey fill, airbrushed, realistic skin texture, noise, grain, blur, color, colorful, background color, dark background, wrinkles, pores, stubble texture, ambient occlusion, watermark, signature, border, frame, extra decorations, cropped, sketch lines, pencil lines'
  },
  concept: {
    scale: 0.5, guidance: 6.5, steps: 28,
    positive: s => `concept art illustration of ${s}, tattoos and piercings clearly visible, detailed face, dramatic lighting, high quality digital painting, sharp focus, plain studio background`,
    negative: 'blurry, lowres, deformed, bad anatomy, extra limbs, text, watermark, signature'
  }
};
const LORA_TRIGGER = { tattoo: 'tattoo', design: 'Tattoo_gen' };
const clip = (v, n) => String(v || '').replace(/[^\w\s,.'-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const numIn = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : d));

let genModelsCache = null;
app.get('/api/gen/info', wrap(async (_q, res) => {
  if (!gen.available()) return res.json({ available: false });
  if (!genModelsCache) genModelsCache = await gen.call('models', {}).catch(() => ({ bases: ['sdxl'], loras: ['tattoo'] }));
  res.json({
    available: true, models: genModelsCache,
    templates: { stencil: PROMPTS.stencil.positive('{subject}'), concept: PROMPTS.concept.positive('{subject}') },
    negatives: { stencil: PROMPTS.stencil.negative, concept: PROMPTS.concept.negative },
    defaults: { scale: PROMPTS.stencil.scale, guidance: PROMPTS.stencil.guidance, steps: PROMPTS.stencil.steps, loraWeight: 0.65 }
  });
}));

app.post('/api/gen/start', wrap(async (req, res) => {
  if (!gen.available()) throw Object.assign(new Error('The AI redraw models are not installed on this server'), { status: 501 });
  const id = need(req), b = req.body;
  const mode = b.mode === 'concept' ? 'concept' : 'stencil', T = PROMPTS[mode];
  const ai = (aiJobs.get(id) || {}).ai;
  const subj = clip(b.subject, 80) || clip(ai && ai.subject, 80) || 'a person face';
  const extra = clip(b.extra, 200);
  const base = ['sdxl', 'juggernaut'].includes(b.base) ? b.base : 'sdxl';
  const lora = ['tattoo', 'design', 'none'].includes(b.lora) ? b.lora : 'tattoo';
  const loraWeight = numIn(b.loraWeight, 0.65, 0.1, 1.2);
  const scale = numIn(b.scale, T.scale, 0.3, 1.0);          // ControlNet weight
  const guidance = numIn(b.guidance, T.guidance, 1, 15);     // CFG
  const steps = Math.round(numIn(b.steps, T.steps, 10, 50));
  const count = Math.round(numIn(b.count, 1, 1, 4));         // preview candidates
  const trigger = lora !== 'none' ? LORA_TRIGGER[lora] : null;
  let prompt = clip(b.prompt, 900) || (T.positive(subj) + (extra ? ', ' + extra : ''));
  if (trigger && !new RegExp(trigger, 'i').test(prompt)) prompt = trigger + ', ' + prompt;
  const nolist = clip(b.nolist, 600);
  const negative = (clip(b.negative, 900) || T.negative) + (nolist ? ', ' + nolist : '');
  const gid = uuidv4().slice(0, 8);
  const genArgs = { dir: jobDir(id), prompt, negative, scale, guidance, steps, base, lora, loraWeight };
  genJobs.set(gid, { status: 'running', mode, job: id, started: Date.now(), prompt, count });
  const ready = axios.post(`${OLLAMA_URL}/api/generate`, { model: OLLAMA_MODEL, keep_alive: 0 }, { timeout: 15000 }).catch(() => {})     // free VRAM from the vision model
    .then(() => new Promise(r => setTimeout(r, 1500)));
  if (count > 1) {
    const outs = Array.from({ length: count }, (_, i) => path.join(jobDir(id), `gen_${gid}_${i}.png`));
    ready.then(() => gen.call('generate_batch', { ...genArgs, outs }, 420000 + count * 90000))
      .then(r => {
        const images = r.images.map((im, i) => ({ index: i, seed: im.seed, url: `/api/gen/image/${id}/${gid}_${i}` }));
        genJobs.set(gid, { status: 'done', mode, job: id, images, seconds: r.seconds, prompt });
        console.log(`[gen ${gid}] ${mode} x${count} done in ${r.seconds}s`);
      })
      .catch(e => { console.error('[gen]', e.message); genJobs.set(gid, { status: 'error', mode, job: id, error: e.message }); });
  } else {
    const out = path.join(jobDir(id), `gen_${gid}.png`);
    ready.then(() => gen.call('generate', { ...genArgs, out, seed: Number.isFinite(+b.seed) ? +b.seed : null }))
      .then(r => { genJobs.set(gid, { status: 'done', mode, job: id, image: `/api/gen/image/${id}/${gid}`, seconds: r.seconds, prompt }); console.log(`[gen ${gid}] ${mode} done in ${r.seconds}s`); })
      .catch(e => { console.error('[gen]', e.message); genJobs.set(gid, { status: 'error', mode, job: id, error: e.message }); });
  }
  res.json({ genId: gid, mode, prompt, count });
}));

app.get('/api/gen/status/:gid', (req, res) => res.json(genJobs.get(req.params.gid) || { status: 'none' }));

app.get('/api/gen/image/:id/:gid', (req, res) => {
  if (!UUID_RE.test(req.params.id) || !/^[0-9a-f]{8}(_[0-9]+)?$/.test(req.params.gid)) return res.sendStatus(404);
  res.sendFile(path.join(jobDir(req.params.id), `gen_${req.params.gid}.png`), e => e && !res.headersSent && res.sendStatus(404));
});

// turn an AI flash drawing into the print-ready 1-bit stencil
app.post('/api/flash', wrap(async (req, res) => {
  const id = need(req), b = req.body, n = ++renderN, num = (v, d) => Number.isFinite(+v) ? +v : d;
  if (!/^[0-9a-f]{8}(_[0-9]+)?$/.test(b.genId || '')) throw Object.assign(new Error('No AI drawing selected'), { status: 400 });
  const base = `${id}-f${n}`;
  const r = await worker.call('flash', {
    gen: path.join(jobDir(id), `gen_${b.genId}.png`), outbase: path.join(OUTPUT_DIR, base),
    sizeIn: num(b.sizeIn, 5), black: num(b.black, 90), speck: num(b.speck, 35), shade: ['dots', 'lines'].includes(b.shade) ? b.shade : 'none', mirror: !!b.mirror
  });
  res.json({ success: true, jobId: id, files: { png: `/output/${base}.png`, pdf: `/output/${base}.pdf` }, ...r, png: undefined, pdf: undefined });
}));

// ─── text-to-stencil ────────────────────────────────────────────────────────
app.post('/api/text-stencil', wrap(async (req, res) => {
  const { text, font, sizeIn, chips } = req.body || {};
  if (!text || !text.trim()) throw Object.assign(new Error('text required'), { status: 400 });
  const n = ++renderN;
  const base = `ts-${Date.now()}-${n}`;
  const outPng = path.join(OUTPUT_DIR, base + '.png');
  const r = await worker.call('text_stencil', {
    text: String(text).slice(0, 200),
    font: String(font || 'Arial'),
    sizeIn: Math.min(14, Math.max(0.5, Number(sizeIn) || 5)),
    chips: String(chips || ''),
    outPng,
  });
  res.sendFile(outPng, e => e && !res.headersSent && res.sendStatus(500));
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
