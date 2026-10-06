# Engine bug fix template — use with ctx-engine.load + --no-architect

engine.py is ~12k tokens. The editor model (7B) cannot fit it. Always use --no-architect:

  aider --no-architect engine.py
  # then paste this prompt (fill in all fields, keep it under 200 words total)

```
BUG: <what the user sees or what goes wrong. Quote any error text exactly.>
WHERE: <function name(s) in engine.py — e.g. cmd_render(), destubble(), relight()>
EXPECTED: <what should happen instead — include the edge case (zero input, extreme slider, no mask)>
CONSTRAINTS: smallest change, only engine.py, keep the existing numpy/cv2 style, never change cmd_* signatures.
DONE WHEN: python -c "import engine" prints no errors AND <what to observe: specific slider value, printed output, etc>
```

Useful functions to name in WHERE so the model doesn't invent helpers:
- cmd_render(dir, outbase, detail, cleanup, smooth, texture, skin, fills, shadows, stubble, light, ...)
- destubble(rgb, amount) — removes beard/stubble noise; PROTECT constant gates strong edges
- relight(rgb, amount) — evens uneven directional lighting
- drop_small(mask, min_area) — removes small connected components from a binary mask
- prefilter(rgb, smooth, texture, skin) — pre-processing blur/texture/skin smoothing

Notes:
- PROTECT = 25 (constant near top of file): local contrast above this is never smoothed — protects tattoo ink and piercing edges
- cmd_render returns: {png, pdf, inches:[wi,hi], orientation, inkCoverage, fitScale, subjectInches, timing}
- After an engine.py edit: pm2 restart tattooshop
