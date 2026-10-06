# TattooShop — Known Bugs & Issues

_Last updated: 2026-10-01_

## 🐛 Open Bugs

### AI Generation
- [ ] **Shadow side artifacts**: At high `stubble` values with strong directional lighting, shadow-side noise lines near lip rings can still appear. `PROTECT=30` threshold helps but doesn't fully eliminate at extreme values. Workaround: stubble ≤ 65 (enforced by clamp).
- [ ] **Juggernaut model not visually reviewed**: Downloaded and mechanically tested but no quality comparison vs `sdxl` base at matching params (28 steps, scale 0.85, guidance 7.5). Needs side-by-side review.
- [ ] **Design LoRA (Tattoo_gen) not visually reviewed**: Wired in and mechanically confirmed but no quality comparison vs `tattoo` LoRA on a real face photo.

### Trace / Stencil Pipeline
- [x] **Fills can over-darken at shadows > 10 + high detail**: Tightened fills percentile (1.0+7x), lowered large-region cutoff (0.18 ref), and tightened shadows percentile (10+23x). Fixed 2026-10-02.
- [x] **`light`/relight slider not wired to frontend**: Added `sl-light` slider (0–50), `S.light` state, wired to all three render calls (doRender, doDestubble, doRelight) and server.js. Fixed 2026-10-02.

### Export
- [x] **PDF export size not shown to user**: doRender() now shows a toast with actual printed dimensions from d.inches[]. Fixed 2026-10-02.

### Thermal No-List
- [x] **Thermal no-list**: per-term checkboxes (all pre-checked), explanatory text, extra-terms box, ON/OFF toggle; checked terms go to `/api/gen/start` as `nolist`. Done 2026-10-05.

---

## ✅ Fixed This Session

- [x] `cmd_render() unexpected keyword argument 'thermal'` — stray param from abandoned feature, removed
- [x] "One big smudged image" at moderate smooth/skin — halved `prefilter()` kernel coefficients
- [x] Sliders resetting to zero on new upload — fixed `loadFile()` reset
- [x] Blotchy mustache/stubble — `destubble()` with `PROTECT` threshold
- [x] Shadow half → solid black blob — locally-normalized darkness fills
- [x] `/api/gen/image/:id/:gid` regex too strict for batch files — updated pattern
- [x] `s.replace()` assertion failures in patch scripts — switched to index-based splicing
