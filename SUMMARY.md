# TattooShop — New Chat Handoff Summary

_Paste this into a new Claude Code chat to resume. Last updated: 2026-10-01_

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

## Current App State (as of 2026-10-01)

### What's Built and Working
- Photo upload → crop/adjust → trace-photo stencil pipeline with full slider set
- AI redraw via SDXL + ControlNet (canny) — **txt2img guided by edge trace, NOT true img2img**
- Two base models: `sdxl` and `juggernaut` (Juggernaut XL v9 fp16, ~6.6 GB, at `models/gen/juggernaut-xl`)
- Two LoRAs: `tattoo` (Norod78, at `models/gen/tattoo-lora`) and `design` (Tattoo Design XL, at `models/gen/loras/Tattoo_gen.safetensors`)
- Editable prompt + negative prompt textareas; auto-populated from server templates; LoRA trigger words auto-prepended
- AI Settings panel: base model, LoRA, LoRA weight, CFG, ControlNet scale, steps, candidate count (1–4)
- Multi-candidate preview grid (batch generation, different seeds); click to select one → send to export
- `destubble()`: removes beard/stubble while protecting tattoo ink + piercings via `PROTECT=30`
- `relight()`: LAB-space lighting equalization
- Locally-normalized darkness fills (shadow half no longer becomes solid black)
- All slider ranges empirically swept and clamped both client-side and server-side
- Default prompts: "comic ink / thermal stencil," pitch black background, razor-sharp textures, no ambient light
- PDF/PNG export at 300 DPI, auto-fit to US letter

### What's NOT Built Yet
Full details in TODO.md, BUGS.md, FEATURES.md in the repo. Short version:

**Next to build (P1):**
Tab 1 — Text-to-Stencil:
- User types text, picks font from Google Fonts subset (gothic, script, bold, fineline)
- Two modes: font-outline (instant, no AI) OR AI-stylized lettering (SDXL)
- **Thermal Printer Positive Prompt Chips**: clickable chip bank (bold black outlines, crisp hard edges, razor-sharp line art, clean vector lines, thick ink strokes, pure black on white, solid black fills, stark high contrast, comic ink style, flash tattoo style, thermal stencil ready, etc.) — user adds/removes from active prompt
- **Thermal Printer No-List panel**: collapsible, default ON, applies to ALL tabs — bans: `ambient light, global illumination, soft shading, smooth gradients, diffuse lighting, subsurface scattering, rim glow, bokeh, depth of field, fog, haze, noise, grain, halftone, stippling, crosshatching, watercolor wash, airbrush, soft focus, blurry, painterly, photorealistic skin texture, pores, freckles, wrinkles, color, grey tones, mid-tones, feathered edges`
- Export reuses existing PDF/PNG 300 DPI pipeline

**Then (P2–P8 in FEATURES.md):**
- 6-tab layout restructure (Tab 1 text, Tab 2 existing photo pipeline, Tab 3 img2img, Tab 4 previews-shared, Tab 5 selection-shared, Tab 6 settings)
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
| `public/index.html` | SPA frontend: sliders, AI settings, preview grid, prompt editor |
| `TODO.md` | Full task list |
| `BUGS.md` | Known bugs |
| `FEATURES.md` | Full feature roadmap with thermal chip lists |
| `SUMMARY.md` | This file |

## Important Constants / Defaults
- `PROTECT = 30` in engine.py — local contrast above this is never smoothed (protects ink/piercings)
- `LORA_TRIGGER = { tattoo: 'tattoo', design: 'Tattoo_gen' }` in server.js
- `DEFAULT_STYLE = { background:0, detail:65, cleanup:30, weightMm:0.4, mirror:false, smooth:10, texture:0, skin:0, stubble:50, varw:60, fills:40, shadows:0 }` in index.html
- Safe slider ranges: detail 20–90, cleanup 15–70, smooth 10–35, texture 0–10, skin 0–15, fills 0–50, shadows 0–15, stubble 0–65

---

## Immediate Next Task

**Build Tab 1 (Text-to-Stencil) basics + begin 6-tab restructure.**

Steps:
1. Download ~12 Google Fonts (gothic, script, bold, fineline) → `public/fonts/`
2. Add `/api/text-stencil` route in `server.js` — renders text to B&W outline via PIL/Pillow
3. Add Tab 1 HTML skeleton to `public/index.html` with:
   - Text input + font picker chips
   - Mode toggle: Outline vs AI-Stylized
   - Tattoo Style chips + Thermal positive prompt chip bank (see FEATURES.md P1 for full lists)
   - Thermal no-list panel (collapsible, default ON, applies to all tabs)
4. Restructure nav to 6-tab shell (Tabs 3–6 can be stubs initially)
5. `pm2 restart tattooshop` and review live
