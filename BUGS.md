# TattooShop — Known Bugs & Issues

_Last updated: 2026-10-06 (session 2)_

## 🐛 Open Bugs

### AI Generation
- [ ] **Juggernaut model not visually reviewed**: Downloaded and mechanically tested but no quality comparison vs `sdxl` base at matching params (28 steps, scale 0.85, guidance 7.5). Needs side-by-side review.
- [ ] **Design LoRA (Tattoo_gen) not visually reviewed**: Wired in and mechanically confirmed but no quality comparison vs `tattoo` LoRA on a real face photo.

### Trace / Stencil Pipeline
- [ ] **Shadow side artifacts at extreme stubble near piercings**: PROTECT lowered to 25 (from 30), dilation halo widened (0.009 ref), drop_small tightened (0.003 → 0.004 ref). Improved but not eliminated at stubble=65 with strong directional light. Workaround: stubble ≤ 60 avoids it in practice. If still seen: try `PROTECT=20` but watch for tattoo ink getting smoothed.

---

## ✅ Fixed Session 2 (2026-10-06)

- [x] **`cv2.polylines` drawing strokes as closed loops**: `isClosed=True` was connecting the last point of every curve back to its start — eyebrows, eyelids, lips all got a spurious closing line drawn across the face. Changed to `False`. Fixed in `engine.py`.
- [x] **Flash Stencil button was a stub**: `doFlash()` always showed a toast saying "run AI Redraw first" regardless of what was displayed. Now properly extracts `genId` from the current AI image URL and calls `/api/flash`. Fixed in `public/js/03-generate.js`.
- [x] **`cmd_flash` diagonal shade lines had float modulo**: `sp * 1.4` is float, causing fractional modulo (`%`) to produce jagged/noisy diagonal lines instead of clean parallel stripes. Now `round(sp * 1.4)`. Fixed in `engine.py`.
- [x] **Dead legacy state props removed**: `S.job`, `S.cnScale`, `S.cfg`, `S.steps`, `S.loraW`, `S.candidates` were defined but never read. Removed. `S.job` was renamed to `S.jobId` (matches actual usage). `S.lastServerPng`, `S.lastServerPdf`, `S._rendering` now explicitly initialized. Fixed in `public/js/01-state.js`.

---

## ✅ Fixed Session 1 (2026-10-06)

- [x] **PDF export guard race condition**: `doRender()` set `S.lastServerPdf` before calling `showStencil()`, then `showStencil()`'s new logic cleared it. Reordered: `lastServerPdf` is now set after `showStencil()` in all three render handlers. Fixed in `public/js/03-generate.js`.
- [x] **PDF export guard used fragile path reconstruction**: Old guard did `.replace(/\.pdf$/, '.png')` on the stored PDF path to reconstruct the PNG path, then compared to `currentBlob`. Now uses `S.currentBlob !== S.lastServerPng` state comparison directly. Fixed in `public/js/03-generate.js`.
- [x] **AI gen stale PDF allowed**: After AI Redraw, `showStencil(genUrl)` set `lastServerPng = genUrl`, making the old PDF guard pass (gen URL appeared to be the "server PNG"). Now `showStencil()` clears `lastServerPdf` whenever a new `/output/` URL differs from `lastServerPng`. Fixed in `public/js/03-generate.js`.
- [x] **S AI defaults mismatched server PROMPTS**: `S.aiSteps:30` vs server `28`, `S.aiCfg:7` vs server `7.5`, `S.aiCnScale:0.75` vs server `0.85`, `S.aiLoraW:0.8` vs server `0.65`. Aligned all. Fixed in `public/js/01-state.js`.
- [x] **Settings tab number inputs not synced**: `cfg-steps`, `cfg-cfgval`, `cfg-cn`, `cfg-loraw` had no `data-ai` attributes so `syncAiUi()` never touched them. Added explicit ID mapping. Fixed in `public/js/02-builders.js`.
- [x] **`syncAiUi()` not called on init**: Settings tab always showed HTML defaults instead of S defaults. Added call in `init()`. Fixed in `public/js/07-app.js`.

---

## ✅ Fixed Earlier Sessions

- [x] **`S.hasTextJob` never cleared**: After text AI generation, flag stayed true forever. Now cleared in `setTextMode('outline')` and in `handlePhotoFile()` on upload success. Fixed 2026-10-06.
- [x] **`selectCandidate()` switching to wrong tab**: Was switching to `text` tab after selecting a candidate from Candidates. Fixed to switch to `ai` tab (where user can re-run or export). Fixed 2026-10-06.
- [x] **Model/LoRA selects out of sync between AI tab and Settings tab**: Changing model in Settings tab didn't update AI tab dropdown (and vice versa). Added `setAiModel()` and updated `onLoraChange()` and `syncAiUi()` to keep both tabs in sync. Fixed 2026-10-06.

---

## ✅ Fixed Earlier Sessions

- [x] **`light`/relight slider not wired to frontend**: Added `sl-light` slider (0–50), `S.light` state, wired to all three render calls (doRender, doDestubble, doRelight) and server.js. Fixed 2026-10-02.
- [x] **Fills can over-darken at shadows > 10 + high detail**: Tightened fills percentile (1.0+7x), lowered large-region cutoff (0.18 ref), tightened shadows percentile (10+23x). Fixed 2026-10-02.
- [x] **PDF export size not shown to user**: doRender() now shows a toast with actual printed dimensions from d.inches[]. Fixed 2026-10-02.
- [x] **Thermal no-list**: per-term checkboxes (all pre-checked), explanatory text, extra-terms box, ON/OFF toggle; checked terms go to `/api/gen/start` as `nolist`. Done 2026-10-05.
- [x] **Piercing shadow artifacts (partial)**: PROTECT=25, wider dilation halo, tighter drop_small. Reduced severity. Fixed 2026-10-02.
- [x] **AI settings panel missing from Text tab**: Text tab had `setTextMode()` hook for `#text-ai-extra` but element didn't exist. Added full panel (goal toggle, pos/neg prompt textareas, variation buttons). Done 2026-10-05.
- [x] **`cmd_render() unexpected keyword argument 'thermal'`** — stray param from abandoned feature, removed
- [x] "One big smudged image" at moderate smooth/skin — halved `prefilter()` kernel coefficients
- [x] Sliders resetting to zero on new upload — fixed `loadFile()` reset
- [x] Blotchy mustache/stubble — `destubble()` with `PROTECT` threshold
- [x] Shadow half → solid black blob — locally-normalized darkness fills
- [x] `/api/gen/image/:id/:gid` regex too strict for batch files — updated pattern
- [x] `s.replace()` assertion failures in patch scripts — switched to index-based splicing
