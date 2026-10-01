const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const { exec, spawn } = require('child_process');
const { v4: uuidv4 }  = require('uuid');
const axios   = require('axios');

const app  = express();
const PORT = 3030;

// ─── directories ────────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'output');
[UPLOAD_DIR, OUTPUT_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ─── multer setup ───────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename:    (_, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif|bmp|tiff)$/.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are accepted'), ok);
  }
});

// ─── static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(OUTPUT_DIR));
app.use(express.json());

// ─── health check ────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', version: '1.0.0' }));

// ─── Ollama vision analysis ──────────────────────────────────────────────────
async function analyzeWithOllama(imagePath) {
  try {
    const imgData = fs.readFileSync(imagePath).toString('base64');
    const resp = await axios.post('http://127.0.0.1:11434/api/generate', {
      model: 'qwen3-vl:8b',
      prompt: `Analyze this image for tattoo stencil conversion. Describe:
1. Subject type (portrait/face, animal, floral, geometric, abstract, landscape, text)
2. Dominant line complexity (simple/medium/complex)
3. Shading density (minimal/moderate/heavy)
4. Fine details to preserve (eyes, hair strands, small features, etc.)
5. Recommended line weight (thin/medium/bold)
Respond in JSON format only: {"subject":"...","lineComplexity":"simple|medium|complex","shadingDensity":"minimal|moderate|heavy","preserveDetails":["..."],"lineWeight":"thin|medium|bold"}`,
      images: [imgData],
      stream: false,
      options: { temperature: 0.1 }
    }, { timeout: 60000 });

    const raw = resp.data.response || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    console.warn('[ollama] vision analysis skipped:', e.message);
  }
  return null;
}

// ─── Python stencil processor ────────────────────────────────────────────────
function runStencilPy(inputPath, outputBase, params) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'stencil.py');
    const args = [
      scriptPath,
      '--input',  inputPath,
      '--output', outputBase,
      '--line-weight',      params.lineWeight      || 'medium',
      '--shading-density',  params.shadingDensity  || 'moderate',
      '--line-complexity',  params.lineComplexity  || 'medium',
      '--subject',          params.subject         || 'general'
    ];
    const py = spawn('python3', args, { timeout: 120000 });

    let stdout = '', stderr = '';
    py.stdout.on('data', d => { stdout += d; });
    py.stderr.on('data', d => { stderr += d; });

    py.on('close', code => {
      if (code === 0) {
        try { resolve(JSON.parse(stdout.trim())); }
        catch(e) { resolve({ png: `${outputBase}.png`, pdf: `${outputBase}.pdf` }); }
      } else {
        reject(new Error(`stencil.py exited ${code}: ${stderr.slice(0,500)}`));
      }
    });

    py.on('error', reject);
  });
}

// ─── main generate endpoint ──────────────────────────────────────────────────
app.post('/api/generate', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

  const jobId     = uuidv4();
  const inputPath = req.file.path;
  const outputBase = path.join(OUTPUT_DIR, jobId);

  console.log(`[job ${jobId}] uploaded: ${req.file.originalname}`);

  try {
    console.log(`[job ${jobId}] running ollama vision analysis...`);
    const aiParams = await analyzeWithOllama(inputPath);
    console.log(`[job ${jobId}] ai params:`, aiParams);

    const params = {
      lineWeight:     aiParams?.lineWeight     || req.body.lineWeight     || 'medium',
      shadingDensity: aiParams?.shadingDensity || req.body.shadingDensity || 'moderate',
      lineComplexity: aiParams?.lineComplexity || req.body.lineComplexity || 'medium',
      subject:        aiParams?.subject        || req.body.subject        || 'general'
    };

    console.log(`[job ${jobId}] generating stencil with params:`, params);
    const result = await runStencilPy(inputPath, outputBase, params);

    const pngFile = path.basename(result.png || `${outputBase}.png`);
    const pdfFile = path.basename(result.pdf || `${outputBase}.pdf`);

    res.json({
      success: true,
      jobId,
      aiAnalysis: aiParams,
      params,
      files: {
        png: `/output/${pngFile}`,
        pdf: `/output/${pdfFile}`
      }
    });

  } catch (err) {
    console.error(`[job ${jobId}] error:`, err.message);
    res.status(500).json({ error: err.message });
  } finally {
    setTimeout(() => fs.unlink(inputPath, () => {}), 5 * 60 * 1000);
  }
});

// ─── cleanup old files (> 2 hours) ──────────────────────────────────────────
function cleanupOldFiles() {
  const maxAge = 2 * 60 * 60 * 1000;
  const now    = Date.now();
  [OUTPUT_DIR, UPLOAD_DIR].forEach(dir => {
    fs.readdir(dir, (_, files) => {
      (files || []).forEach(f => {
        const fp = path.join(dir, f);
        fs.stat(fp, (_, st) => {
          if (st && now - st.mtimeMs > maxAge) fs.unlink(fp, () => {});
        });
      });
    });
  });
}
setInterval(cleanupOldFiles, 30 * 60 * 1000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TattooShop running on http://0.0.0.0:${PORT}`);
});
