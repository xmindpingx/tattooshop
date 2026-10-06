# TattooShop — New Chat Handoff Summary

_Paste this into a new Claude Code chat to resume. Last updated: 2026-10-05_

---

## What This App Is

Self-hosted AI tattoo-stencil generator at `/home/dad/www/tattooshop` on a home Linux server.
- **Stack**: Node/Express (`server.js`) + Python CPU worker (`worker.py`/`engine.py`) + GPU worker (`gen_worker.py` in `venv-gen`)
- **GPU**: AMD RX 6800, ROCm, env vars: `HSA_OVERRIDE_GFX_VERSION=10.3.0`, `PYTORCH_HIP_ALLOC_CONF=expandable_segments:True`
- **Process manager**: pm2 → `pm2 restart tattooshop` — serves on port 3030
- **Git remote**: `github.com/xmindpingx/tattooshop`
- **GitHub PAT**: `grep -o "github_pat_[A-Za-z0-9_]*" /home/dad/Documents/secrets.txt | head -1`
- **Push format**: `https://x-token:${T}@github.com/xmindpingx/tattooshop`

---

## ⚠️ CRITICAL: Remote Tool Rule

All file reads/writes/shell commands MUST use:
`mcp__remote-devices__plugin_8d52a3a6-3a2d-4a54-8d1d-e08585a97642_desktop-commander__*`

Local `Read`/`Write`/`Edit`/`Bash` tools work ONLY on the Claude container — NOT the user's server.
To view generated images: stage with `mcp__remote-devices__device_stage_files` → view with `Read`.

---

## Current App State (as of 2026-10-05)

### What's Built and Working
- Photo upload → crop/adjust → trace-photo stencil pipeline with full slider set
- AI redraw via SDXL + ControlNet (canny) — **txt2img guided by edge trace, NOT true img2img**
- Two base models: `sdxl` and `juggernaut` (Juggernaut XL v9 fp16, ~6.6 GB, at `models/gen/juggernaut-xl`)
- Two LoRAs: `tattoo` (Norod78, at `models/gen/tattoo-lora`) and `design` (Tattoo Design XL, at `models/gen/loras/Tattoo_gen.safetensors`)
- Editable prompt + negative prompt textareas; auto-populated from server templates; LoRA trigger words auto-prepended
- AI Settings panel: base model, LoRA, LoRA weight, CFG, ControlNet scale, steps, candidate count (1–4)
- Multi-candidate preview grid (batch generation, different seeds); click to select one → send to export
- `destubble()`: removes beard/stubble while protecting tattoo ink + piercings via `PROTECT=25`
- `relight()`: LAB-space lighting equalization; `light` slider (0–50) wired end-to-end
- Locally-normalized darkness fills (shadow half no longer becomes solid black)
- All slider ranges empirically swept and clamped both client-side and server-side
- Default prompts: "comic ink / thermal stencil," pitch black background, razor-sharp textures, no ambient light
- PDF/PNG export at 300 DPI, auto-fit to US letter; size toast shows printed dimensions
- Thermal Printer No-List panel: per-term checkboxes, explanatory text, extra-terms box, ON/OFF toggle; terms sent as `nolist` to `/api/gen/start`
- Aider AI coding assistant configured: architect gemma4:12b + editor qwen2.5-coder:7b, context presets in `tools/aider/`, one-shot task runner `tools/aider/task.sh`

### What's NOT Built Yet
Full details in TODO.md, BUGS.md, FEATURES.md in the repo. Short version:

**Next to build (P3 — 6-tab layout now that thermal no-list is done):**
- 6-tab layout restructure (Tab 1 text, Tab 2 existing photo pipeline, Tab 3 img2img, Tab 4 previews-shared, Tab 5 selection-shared, Tab 6 settings)
- Shared size control in global header (currently only in Photo tab)
- Thermal no-list panel explanation text (panel built; prose explanation inside it still needed)

**Then (P4–P8 in FEATURES.md):**
- True img2img + IP-Adapter (needs ~3+ GB downloads, bigger architecture change)
- Realistic tattoo-on-body-part preview tab
- 3D interactive changing room (WebGL avatar, large multi-session scope)
- TattooZ + Cybergothic LoRAs (blocked on Civitai API key)

---

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Express routes, PROMPTS templates, `rng()` clamp, `/api/gen/start`, `/api/flash`, `/api/render` |
| `engine.py` | CPU processing: `prefilter()`, `destubble()`, `relight()`, `ink_subject()`, `cmd_render()` |
| `gen_worker.py` | GPU SDXL: `pipe()` cache, `control_image()`, `cmd_generate()`, `cmd_generate_batch()`, `cmd_models()` |
| `worker.py` | CPU worker wrapper (PyWorker) |
| `public/index.html` | SPA markup (no logic) |
| `public/css/app.css` | All CSS |
| `public/js/01-state.js` | State object `S`, FONTS, chips, tab switching |
| `public/js/02-builders.js` | UI builders, AI-settings sync, photo sliders and presets |
| `public/js/03-generate.js` | Generate dispatcher, text/photo/AI requests, job polling, showStencil, export, candidates, no-list toggle, size controls |
| `public/js/07-app.js` | Photo upload, overlay, toast, cancelGen, init() |
| `tools/aider/README.md` | How to use aider with this project |
| `tools/aider/ctx-*.load` | Context presets for aider (one per feature area) |
| `tools/aider/prompts/` | Prompt templates: bugfix.md, engine-bugfix.md, feature.md, review.md |
| `tools/aider/task.sh` | One-shot non-interactive aider runner |
| `TODO.md` | Full task list |
| `BUGS.md` | Known bugs |
| `FEATURES.md` | Full feature roadmap with thermal chip lists |
| `SUMMARY.md` | This file |

## Important Constants / Defaults
- `PROTECT = 25` in `engine.py` — local contrast above this is never smoothed (protects ink/piercings); was 30
- `LORA_TRIGGER = { tattoo: 'tattoo', design: 'Tattoo_gen' }` in `server.js`
- Safe slider ranges: detail 20–90, cleanup 15–70, smooth 10–35, texture 0–10, skin 0–15, fills 0–50, shadows 0–15, stubble 0–65, light 0–50

## Aider Setup (for coding sessions)
- Start: `./start_aider.sh` or `~/bin/aider-tattooshop`; OR use `tools/aider/task.sh` for one-shot tasks
- Models: architect `gemma4:12b` (24k ctx) + editor `qwen2.5-coder:7b-instruct` (16k ctx)
- `think: false` override for architect (thinking mode consumed the whole budget with no output)
- **engine.py must use `--no-architect`** — too large for the editor model; ctx-engine.load documents this
- Context presets: ctx-markup, ctx-css, ctx-ui-logic, ctx-generate, ctx-changing-room, ctx-server, ctx-gpu, ctx-engine, ctx-docs
- task.sh auto-detects `#/no-architect` in .load file and passes the flag

---

## Immediate Next Task

**Thermal no-list panel explanation text** (one small TODO remaining from the thermal work):

In `public/js/03-generate.js` or wherever the no-list panel renders, the panel is missing its explanatory paragraph:
> "Thermal printers burn a single pass of black dots — they can't reproduce gradients, smooth tones, or mid-grays. These prompt terms create exactly that."

Then: start the **6-tab layout restructure** — begin with the shared size control in the header (it already exists in the photo tab; promote it to a persistent header bar).

---

## Shared Size Control (already built in Tab 2, needs promotion)
The size control already exists in the photo stencil tab:
- `#size-in` input: 0.5–14 inches, step 0.25
- `#size-cm` span: live cm conversion
- `#size-chips`: quick-pick chip buttons (`data-s` attribute = size in inches)
- `S.sizeIn` state variable, passed to `/api/render` and `/api/flash` as `sizeIn`
- In `server.js` it becomes `sizeIn: num(b.sizeIn, 5)` (default 5 inches)

**Task**: promote this to a global component shared by all tabs (persistent header bar recommended).
