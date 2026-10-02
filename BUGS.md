# TattooShop — Known Bugs & Issues

_Last updated: 2026-10-01_

## 🐛 Open Bugs

### AI Generation
- [ ] **Shadow side artifacts**: At high `stubble` values with strong directional lighting, shadow-side noise lines near lip rings can still appear. `PROTECT=30` threshold helps but doesn't fully eliminate at extreme values. Workaround: stubble ≤ 65 (enforced by clamp).
- [ ] **Juggernaut model not visually reviewed**: Downloaded and mechanically tested but no quality comparison vs `sdxl` base at matching params (28 steps, scale 0.85, guidance 7.5). Needs side-by-side review.
- [ ] **Design LoRA (Tattoo_gen) not visually reviewed**: Wired in and mechanically confirmed but no quality comparison vs `tattoo` LoRA on a real face photo.

### Trace / Stencil Pipeline
- [ ] **Fills can over-darken at shadows > 10 + high detail**: Locally-normalized fills detection is better but can still punch shadows as large solid fills near the top of the safe range (shadows ≤ 15).
- [ ] **`light`/relight slider may not be wired to frontend**: `cmd_render()` accepts `light` param and `relight()` is implemented in engine.py, but verify that a frontend slider labeled "light" or "relight" actually exists and posts to `/api/render`. No such slider was confirmed visible in the final UI scan.

### Export
- [ ] **PDF export size not shown to user**: `_export_bw()` auto-fits design to US letter but the UI never tells the user what final printed size their design became (e.g. "5.2\" × 5.2\" on letter").

### Thermal No-List (Not Yet Built)
- [ ] **Thermal no-list not yet implemented**: Planned feature (see TODO.md). Current negative prompts manually include some thermal-safe terms but there's no UI toggle or per-term checklist yet.

---

## ✅ Fixed This Session

- [x] `cmd_render() unexpected keyword argument 'thermal'` — stray param from abandoned feature, removed
- [x] "One big smudged image" at moderate smooth/skin — halved `prefilter()` kernel coefficients
- [x] Sliders resetting to zero on new upload — fixed `loadFile()` reset
- [x] Blotchy mustache/stubble — `destubble()` with `PROTECT` threshold
- [x] Shadow half → solid black blob — locally-normalized darkness fills
- [x] `/api/gen/image/:id/:gid` regex too strict for batch files — updated pattern
- [x] `s.replace()` assertion failures in patch scripts — switched to index-based splicing
