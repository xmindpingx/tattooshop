# TattooShop architecture (verified against the code)

AI tattoo-stencil generator. Live on port 3030 as PM2 app `tattooshop` (cwd /home/dad/www/tattooshop). Static files in `public/` are served straight from this working tree.

## Processes
- `server.js` (Node/Express): serves `public/`, JSON API under `/api`, results under `/output/`.
- `worker.py` (CPU, `venv/bin/python`): server.js writes one JSON line `{id,cmd,args}`; worker.py calls `engine.cmd_<cmd>(**args)` and replies `{id,ok,result|error}`. Commands: prepare, segment, render, filtered, flash, text_stencil.
- `gen_worker.py` (GPU, `venv-gen/bin/python`): SDXL + canny ControlNet + tattoo LoRA on the RX 6800 (16 GB). Started on the first AI request, killed after 8 min idle, one job at a time (busy -> HTTP 503). Commands: generate, generate_batch, models.
- Ollama (127.0.0.1:11434): `analyze()` in server.js asks `gemma4:12b` to describe each uploaded photo; `/api/gen/start` unloads that model (keep_alive 0) before a GPU job.

## Data (git-ignored, auto-deleted after 3 h)
`jobs/<uuid>/` per upload (src.jpg, mask.png, overlay.png, meta.json, filtered.jpg, gen_<id>*.png); `output/` holds final PNG + PDF.

## API (server.js)
POST /api/prepare (multipart `photo`) -> {jobId, overlay}. POST /api/render {jobId, sizeIn, detail, cleanup, smooth, texture, skin, fills, shadows, stubble, light} -> {files:{png,pdf}, inches}. POST /api/text-stencil {text, font, sizeIn, chips} -> PNG. POST /api/gen/start {jobId, prompt, negative, nolist, base, lora, loraWeight, guidance, scale, steps, count, goal, sizeIn} -> {genId}; GET /api/gen/status/:gid -> {status: running|done|error|cancelled, image | images[]}; POST /api/gen/cancel/:gid (stops the GPU worker); GET /api/gen/image/:id/:gid. Also: /api/health, /api/subject, /api/filtered, /api/flash, /api/gen/info, /api/ai/:id, /api/overlay/:id. Numeric inputs are clamped server-side with `rng`/`numIn` (`/api/flash` does not clamp yet); strings go through `clip`.

## Browser (no build step, no modules)
`public/index.html` is markup only. `public/css/app.css` is all CSS. `public/js/*.js` are classic `<script src>` files loaded in numeric order; they share ONE global scope, and index.html calls their functions from inline `onclick="..."`.
- 01-state.js: state object `S`, FONTS, chips, tab switching. 02-builders.js: UI builders, AI-settings sync, photo sliders and presets.
- 03-generate.js: generate dispatcher, text/photo/AI requests, job polling, showStencil, export, candidates, no-list toggle, size controls.
- 04, 05, 06: Changing Room (canvas avatar preview). 05-avatar-draw.js is ~10k tokens of drawing code: never /add it.
- 07-app.js: photo upload, overlay, toast, cancelGen, init().
- In-flight flags on `S`: genJobId, _rendering, _textRendering, _uploading. Each request function returns early if its flag is set and clears it on success AND error.
