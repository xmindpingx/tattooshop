# TattooShop — Features Roadmap

_Last updated: 2026-10-01_

## 🗺️ Planned Features (Priority Order)

### P1 — Tab 1: Text-to-Stencil (Next to build)
User types words/phrases, picks a font, gets stencil-ready line art.
- **Mode A — Font outlines**: clean vector-style outlines from font file; no AI; instant; reliable stencil lines.
- **Mode B — AI-stylized lettering**: SDXL generates decorative/calligraphic/gothic tattoo lettering from text prompt.
- **Fonts**: curated Google Fonts subset (~12 fonts), cached locally: gothic/blackletter, flowing script, bold block, fine-line serif, ornamental.
- **Export**: reuse existing PDF/PNG 300 DPI pipeline.
- **Chip banks below apply to all tabs.**

---

#### 🎨 Tattoo Style Chips (Tab 1 + all tabs)
Clickable chips — add to positive prompt to steer the AI toward a specific tattoo tradition.
Each style has its own aesthetic rules that also affect what makes a clean stencil.

**Traditional / Old School**
- `traditional american tattoo style` — bold black outlines, limited flat colors, classic flash imagery
- `old school tattoo` — thick outlines, minimal shading, nautical/panther/eagle motifs
- `neo traditional tattoo` — thicker outlines than new school, illustrative shading, ornate details

**Japanese**
- `japanese tattoo style` — irezumi, dynamic flow lines, wind bars, waves, koi, oni, dragons
- `tebori tattoo style` — hand-poked Japanese technique, slightly softer line quality
- `japanese water and wave motifs` — flowing negative-space water, traditional fill patterns

**Fine Line / Realism**
- `fine line tattoo` — single-needle thin lines, delicate detail, minimal fill
- `blackwork fine line` — pure black ink, no color, ultra-fine linework
- `photorealistic tattoo` — high detail grayscale shading (NOTE: harder to stencil thermally)
- `black and grey realism` — smooth gradient shading in monochrome (NOTE: thermal-unfriendly, use with caution)

**Geometric / Dotwork**
- `geometric tattoo` — precise shapes, sacred geometry, mandalas, symmetrical patterns
- `dotwork tattoo` — stipple shading with dots instead of lines, textured fill
- `blackwork geometric` — bold solid black shapes, negative space patterns
- `mandala tattoo` — circular sacred geometry, radial symmetry

**Illustrative / Decorative**
- `neo traditional illustrative tattoo` — storybook illustration quality, bold outlines, rich detail
- `ornamental tattoo` — jewelry-inspired, symmetrical, decorative filigree
- `botanical tattoo` — plants, flowers, leaves, natural linework
- `flash sheet tattoo` — small standalone designs, traditional flash-art format

**Dark / Gothic**
- `blackwork tattoo` — heavy solid black fills, bold graphic silhouettes
- `dark art tattoo` — gothic imagery, skulls, ravens, dark botanical
- `trash polka tattoo` — chaotic collage of realism + abstract black marks (NOTE: complex stencil)

**Tribal / Cultural**
- `polynesian tattoo style` — traditional Polynesian geometric patterns, tribal fills
- `maori tattoo style` — ta moko, curvilinear koru patterns
- `tribal tattoo` — bold solid black, angular or curved cultural patterns
- `aztec tattoo style` — geometric pre-Columbian symbolism, sun stones, serpent motifs

**Script / Lettering**
- `chicano lettering tattoo` — Old English / gothic script, fine shading behind letters
- `gothic blackletter tattoo` — heavy medieval-style lettering
- `script tattoo` — flowing cursive lettering, single-needle or brush-pen style

---

#### 🖨️ Thermal Printer Positive Prompt Chips (Tab 1 + all tabs)
Clickable chip bank — add to positive prompt for thermal-safe output.

**Edge & Line Quality**
- `bold black outlines` — thick, printable ink edges
- `crisp hard edges` — no feathering in ink lines
- `razor-sharp line art` — maximum edge definition
- `clean vector lines` — machine-precise strokes
- `thick ink strokes` — lines wide enough to survive thermal transfer
- `ink bleed resistant lines` — edges won't spread when heat-pressed

**Contrast & Fill**
- `pure black on white background` — guaranteed 2-tone output
- `pitch black ink` — no gray substitutes for black
- `solid black fills` — flat fill zones, no gradient interior
- `stark high contrast` — nothing in the mid-tone range
- `no gray values` — forces binary black/white only
- `flat color areas` — solid zones with zero internal shading

**Style Direction**
- `comic ink style` — flat fill + bold outline, classic stencil-friendly
- `woodcut print style` — high-contrast block shapes, strong silhouettes
- `linocut print style` — hand-carved look, strong positive/negative contrast
- `flash tattoo style` — traditional bold-outline flat-fill format
- `thermal stencil ready` — explicit signal to AI for stencil output format
- `2-tone black and white illustration` — binary palette only

**Structure**
- `silhouette-dominant composition` — subject readable from outline alone
- `clear foreground separation` — subject hard-edges against background
- `rim lighting tracing the contours` — light follows edges, crispens outlines
- `defined shadow boundaries` — shadows cut hard, no soft falloff

---

### P2 — Thermal Printer No-List (shared across all tabs)
Collapsible panel in Tab 1, applied globally.
- Default: **ON** — all terms active.
- User can uncheck individual items.
- Active terms auto-appended to negative prompt on every generation call.
- Server: `/api/gen/start` accepts `thermalNeg[]` array, merges into negative prompt.

**Full no-list:**
`ambient light, global illumination, soft shading, smooth gradients, diffuse lighting, subsurface scattering, rim glow, bokeh, depth of field, lens flare, fog, haze, noise, grain, halftone, stippling, crosshatching, watercolor wash, airbrush, soft focus, blurry, painterly, photorealistic skin texture, pores, freckles, wrinkles, color, grey tones, mid-tones, feathered edges, shadows without hard edges`

---

### P3 — 6-Tab Layout Restructure
1. Text-to-Stencil (new, P1)
2. Photo Stencil (existing app, moved)
3. img2img / IP-Adapter (new pipeline)
4. Previews Room (shared — populates from whichever tab last generated)
5. Selection / Results (shared — pick winner from any tab, send to export)
6. Settings (existing AI settings panel, promoted to tab)

### P4 — Tab 3: img2img + IP-Adapter
- True denoising-strength img2img on actual photo (not ControlNet txt2img)
- Optional IP-Adapter style-transfer (weight 0.60–0.70)
- Downloads needed: CLIP image encoder (~2.4–3.5 GB) + IP-Adapter weights (~670 MB)
- Params: denoising 0.55–0.65, CFG 7.0–8.5, steps 25–30, ControlNet Canny weight 0.85/end 0.80

### P5 — Realistic Tattoo-on-Body Preview
- Upload body-part photo, AI renders it wearing the designed tattoo
- Requires inpainting or IP-Adapter (depends on P4)

### P6 — 3D Interactive Changing Room
- Rotatable WebGL avatar, UV-mapped tattoo placement
- Large scope (multiple sessions): mesh sourcing, rigging, WebGL viewer (Three.js/Babylon.js)
- Generic avatar first; custom mesh = separate project

### P7 — Missing LoRAs
- TattooZ LoRA (Civitai, ~218 MB) — need Civitai API key
- Cybergothic LoRA (Civitai, ~218 MB) — same

### P8 — UX Polish
- PDF export: show user final printed size
- Juggernaut vs sdxl quality side-by-side comparison
- Design LoRA (Tattoo_gen) quality review on real face photo

---

## ✅ Shipped This Session
- Multi-model base selection (sdxl / juggernaut)
- Multi-LoRA selection (tattoo / design) with trigger-word auto-prepend
- Editable prompt + negative prompt with server-side templates
- AI Settings panel (CFG, steps, ControlNet scale, LoRA weight, count) with tooltips
- Multi-candidate batch generation (1–4) with clickable selection grid
- "Comic ink / thermal stencil" default prompts
- `destubble()` — stubble suppression preserving ink and piercings
- `relight()` — LAB-space lighting equalization
- Locally-normalized darkness fills detection
- Empirically-swept safe slider ranges, clamped client+server
- GPU pipeline cache by (base, lora, weight)
