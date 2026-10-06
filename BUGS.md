# TattooShop — Known Bugs & Issues

_Last updated: 2026-10-06_

## 🐛 Open Bugs

### AI Generation
- [ ] **Juggernaut model not visually reviewed**: Downloaded and mechanically tested but no quality comparison vs `sdxl` base at matching params (28 steps, scale 0.85, guidance 7.5). Needs side-by-side review.
- [ ] **Design LoRA (Tattoo_gen) not visually reviewed**: Wired in and mechanically confirmed but no quality comparison vs `tattoo` LoRA on a real face photo.

### Trace / Stencil Pipeline
- [ ] **Shadow side artifacts at extreme stubble near piercings**: PROTECT lowered to 25 (from 30), dilation halo widened (0.009 ref), drop_small tightened (0.003 → 0.004 ref). Improved but not eliminated at stubble=65 with strong directional light. Workaround: stubble ≤ 60 avoids it in practice. If still seen: try `PROTECT=20` but watch for tattoo ink getting smoothed.

---

## ✅ Fixed This Session

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
