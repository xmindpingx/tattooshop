# TattooShop — TODO List

_Last updated: 2026-10-01_

## 🏗️ In Progress / Next Up

### Tab Restructure — status checked against the code 2026-10-05
Built: tab bar with Text, Photo, AI Redraw, Candidates, Changing Room, Settings. Text tab has outline/AI modes, font grid and style chips.
Not built: true img2img / IP-Adapter pipeline (no references in `gen_worker.py` or `server.js`); a separate Selection tab (selection happens in Candidates).
Original plan below, kept for reference; unchecked items were not individually re-verified.

- [ ] **Tab 1 — Text-to-Stencil**: New landing tab. User types text, picks from curated Google Fonts subset (gothic, script, bold block, fineline), renders as clean outline OR AI-stylized lettering (both modes, user picks per design). Includes **Thermal Printer No-List panel** (see below). Export via existing PDF/PNG 300 DPI pipeline.
- [ ] **Tab 2 — Photo Stencil**: Move existing full photo-upload workflow here (crop/adjust, trace-photo vs AI-redraw, all sliders, prompt editor, multi-candidate previews).
- [ ] **Tab 3 — img2img / IP-Adapter**: True img2img pipeline (denoising-strength on actual photo, not ControlNet txt2img). Optional IP-Adapter style-transfer unit (~2.4–3.5 GB CLIP encoder + ~670 MB adapter weights — NOT yet downloaded).
- [ ] **Tab 4 — Previews Room**: Shared multi-candidate preview gallery, populated from whichever of Tabs 1–3 generated results last.
- [ ] **Tab 5 — Selection / Results**: Unified pick-your-winner tab. Populates from any of Tabs 1–4. User selects one candidate to send to export/flash.
- [ ] **Tab 6 — Settings**: Promote existing AI settings collapsible (base model, LoRA, weights, CFG, steps, ControlNet scale, candidate count) into a dedicated persistent tab.

### Thermal Printer No-List (shared across all tabs)
- [x] Add a **"Thermal Printer Adherence"** collapsible panel or toggle — visible in Tab 1 and applied globally to every generation tab.
- [ ] Panel explains why these terms hurt thermal printing: *"Thermal printers burn a single pass of black dots — they can't reproduce gradients, smooth tones, or mid-grays. These prompt terms create exactly that."*
- [ ] Default state: **ON** (thermal-safe terms always active unless user unchecks).
- [ ] The NO-LIST to enforce (pre-checked, user can uncheck individual items):
  - `ambient light` — smooth diffuse fill across skin, no hard edges
  - `global illumination` — baked lighting gradients incompatible with 2-tone output
  - `soft shading` — muddy gray zones between light and dark
  - `smooth gradients` — pure thermal-death: gradual tone ramps
  - `diffuse lighting` — washes out hard ink edges
  - `subsurface scattering` — gives skin a translucent glow, kills line crispness
  - `rim glow` — soft halo around subject bleeds into white areas
  - `bokeh` / `depth of field` — blurs background into gray noise
  - `fog` / `haze` — mid-tone fill across background
  - `noise` / `grain` — random dots that print as speckle bleed
  - `halftone` / `stippling` / `crosshatching` — dot-pattern fills that thermally bleed together
  - `watercolor wash` / `airbrush` — painterly soft-fill styles
  - `soft focus` / `blurry` / `painterly` — destroys edge crispness
  - `photorealistic skin texture` / `pores` / `freckles` / `wrinkles` — micro-texture fills that read as gray
  - `color` / `grey tones` / `mid-tones` — anything not pure black or pure white
  - `feathered edges` — anti-aliased soft transitions = gray band = thermal bleed
- [ ] Active no-list terms auto-appended to the negative prompt for all generation calls.
- [ ] Wire into `/api/gen/start` — server accepts and passes the `thermalNeg` list into the negative prompt.

### Realistic Tattoo-on-Body Preview
- [ ] Separate tab: upload body-part photo, AI redraws it wearing the designed tattoo. Requires inpainting or IP-Adapter (depends on Tab 3).

### 3D Interactive Changing Room
- [ ] Full WebGL avatar tab with rotatable mesh, UV-mapped tattoo placement. **Large scope — multiple sessions.** Generic avatar first; custom mesh requires separate rigging work.

### Missing LoRAs
- [ ] TattooZ LoRA (Civitai, ~218 MB) — need user's Civitai API key
- [ ] Cybergothic LoRA (Civitai, ~218 MB) — same

---

## ✅ Completed This Session

- [x] Stubble/beard suppression (`destubble()`) with tattoo/piercing protection (`PROTECT=30`)
- [x] Shadow-half black-blob fix (locally-normalized darkness fills detection)
- [x] Slider defaults persist on new photo upload
- [x] Smoothing sliders no longer smear whole face
- [x] Empirical parameter sweep + safe slider ranges clamped client+server
- [x] Flash-art reference tuning → `smooth:10, cleanup:30, detail:65` defaults
- [x] "Comic ink / thermal stencil" default prompts (pitch black bg, razor-sharp, no ambient light)
- [x] Editable prompt + negative prompt textareas
- [x] LoRA trigger-word auto-prepend
- [x] Multi-model support: sdxl + juggernaut bases; tattoo + design LoRAs
- [x] Juggernaut XL v9 downloaded (~6.6 GB fp16)
- [x] Tattoo Design XL LoRA downloaded (~456 MB)
- [x] GPU pipeline caching by (base, lora, weight)
- [x] AI Settings panel with tooltips
- [x] Multi-candidate batch preview (1–4 candidates, clickable grid)
- [x] Selected preview → flash/print export

### Shared Size Control (all tabs)
- [ ] The existing size control (`sizeIn`, 0.5–14 inches, with cm display and quick-pick chips) currently lives only in Tab 2 (photo stencil). It must be promoted to a **global/shared component** visible and active across all tabs:
  - Tab 1 (text-to-stencil): sets output size of the text art stencil
  - Tab 2 (photo stencil): already wired — keep as-is
  - Tab 3 (img2img): sets resolution target for AI generation
  - Tab 4 (previews): display-only (shows what size the previews were generated at)
  - Tab 5 (selection): passes `sizeIn` to export/flash call
  - Tab 6 (settings): show current size as a reminder
- [ ] Options: place size control in a persistent header/footer bar, OR duplicate the widget in each tab's form (simpler but less DRY).
