#!/usr/bin/env python3
"""
TattooShop stencil engine.

A job lives in a folder:  upload.*  src.jpg  mask.png  auto.png  soft.npy  emb.npy  ink_*.npy  meta.json
  cmd_prepare   load + auto-detect the subject (ISNet)
  cmd_segment   click-to-select the subject (MobileSAM), or reset to the auto subject
  cmd_render    turn the subject (and, optionally, the background) into clean uniform-width line work

The expensive neural-net passes are cached per job, so re-rendering with new slider values takes well under a second.
"""
import glob, json, os, time
import numpy as np
import cv2
import onnxruntime as ort
from PIL import Image, ImageOps

HERE   = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, 'models')
DPI      = 300
MAX_SRC  = 1500     # cap for the prepared photo (5x5" at 300 DPI, appropriate for small stencils)
MAX_WORK = 4096     # long edge used while cleaning up lines
MAX_OUT  = 7000     # longest edge of the delivered PNG
MARGIN_IN = 0.12    # white border around the trimmed stencil


# ───────────────────────────── helpers ─────────────────────────────
_sess = {}
def session(name):
    if name not in _sess:
        so = ort.SessionOptions()
        so.intra_op_num_threads = max(1, min(6, (os.cpu_count() or 4) - 2))
        so.log_severity_level = 3
        _sess[name] = ort.InferenceSession(os.path.join(MODELS, name), so, providers=['CPUExecutionProvider'])
    return _sess[name]

def disk(d):
    d = max(1, int(round(d)))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (d, d))

def drop_small(b, min_area):
    n, lab, st, _ = cv2.connectedComponentsWithStats(b, connectivity=8)
    if n <= 1:
        return b
    keep = np.zeros(n, bool)
    keep[1:] = st[1:, cv2.CC_STAT_AREA] >= min_area
    return keep[lab].astype(np.uint8)

def drop_fragments(skel, min_len, min_ext):
    n, lab, st, _ = cv2.connectedComponentsWithStats(skel, connectivity=8)
    if n <= 1:
        return skel
    ext = np.maximum(st[1:, cv2.CC_STAT_WIDTH], st[1:, cv2.CC_STAT_HEIGHT])
    keep = np.zeros(n, bool)
    keep[1:] = (st[1:, cv2.CC_STAT_AREA] >= min_len) & (ext >= min_ext)
    return keep[lab].astype(np.uint8)

def clean_mask(b, keep_rel=0.12, hole_rel=0.01):
    """Keep the main blobs, fill pin-holes (but keep real gaps)."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(b, connectivity=8)
    if n <= 1:
        return b
    areas = st[1:, cv2.CC_STAT_AREA]
    keep = np.zeros(n, bool)
    keep[1:] = areas >= keep_rel * areas.max()
    b = keep[lab].astype(np.uint8)
    cnts, hier = cv2.findContours(b, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    total = float(b.sum())
    if hier is not None:
        for c, hh in zip(cnts, hier[0]):
            if hh[3] >= 0 and cv2.contourArea(c) < hole_rel * total:
                cv2.drawContours(b, [c], -1, 1, thickness=cv2.FILLED)
    return b

def tight_bbox(mask):
    ys, xs = np.where(mask > 0)
    return ys.min(), ys.max() + 1, xs.min(), xs.max() + 1

def padded_box(mask, pad=0.03):
    h, w = mask.shape
    y0, y1, x0, x1 = tight_bbox(mask)
    p = int(round(pad * max(y1 - y0, x1 - x0)))
    return max(0, y0 - p), min(h, y1 + p), max(0, x0 - p), min(w, x1 + p)

def load_rgb(path, cap=MAX_SRC):
    im = ImageOps.exif_transpose(Image.open(path))
    if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
        im = im.convert('RGBA')
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        im = bg
    rgb = np.ascontiguousarray(np.array(im.convert('RGB')))
    h, w = rgb.shape[:2]
    if max(h, w) > cap:
        k = cap / max(h, w)
        rgb = cv2.resize(rgb, (round(w * k), round(h * k)), interpolation=cv2.INTER_AREA)
    return rgb

P = lambda d, n: os.path.join(d, n)
def load_meta(d):  return json.load(open(P(d, 'meta.json')))
def save_meta(d, m): json.dump(m, open(P(d, 'meta.json'), 'w'))
def load_src(d):   return np.array(Image.open(P(d, 'src.jpg')).convert('RGB'))
def load_mask(d):  return (np.array(Image.open(P(d, 'mask.png')).convert('L')) > 127).astype(np.uint8)


# ───────────────────────────── subject ─────────────────────────────
def auto_subject(rgb):
    """ISNet salient-object mask. Returns (soft map, binary mask or None)."""
    s = session('isnet-general-use.onnx')
    x = cv2.resize(rgb, (1024, 1024), interpolation=cv2.INTER_AREA).astype(np.float32)
    x = x / max(float(x.max()), 1e-6) - np.array([0.485, 0.456, 0.406], np.float32)
    y = s.run(None, {s.get_inputs()[0].name: x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0, 0]
    y = (y - y.min()) / max(float(y.max() - y.min()), 1e-6)
    soft = cv2.resize(y, (rgb.shape[1], rgb.shape[0]), interpolation=cv2.INTER_LINEAR)
    b = (soft > 0.5).astype(np.uint8)
    if not b.any():
        return soft, None
    b = clean_mask(b)
    frac = float(b.mean())
    return soft, (None if frac < 0.02 or frac > 0.97 else b)

def write_overlay(d, mask):
    H, W = mask.shape
    k = min(1.0, 900 / max(H, W))
    h, w = max(1, round(H * k)), max(1, round(W * k))
    m = cv2.resize(mask, (w, h), interpolation=cv2.INTER_NEAREST)
    ov = np.zeros((h, w, 4), np.uint8)
    ov[m == 0] = (6, 6, 10, 165)
    ov[cv2.morphologyEx(m, cv2.MORPH_GRADIENT, disk(3)) > 0] = (232, 200, 74, 255)
    Image.fromarray(ov, 'RGBA').save(P(d, 'overlay.png'))

def _store_mask(d, mask, meta, auto):
    Image.fromarray(mask * 255).save(P(d, 'mask.png'))
    meta['ver'] = meta.get('ver', 0) + 1
    meta['auto'] = auto
    save_meta(d, meta)
    write_overlay(d, mask)
    return {'coverage': round(float(mask.mean()), 3), 'isolated': bool(mask.mean() < 0.97), 'ver': meta['ver']}

def cmd_prepare(dir):
    up = sorted(glob.glob(P(dir, 'upload.*')))[0]
    rgb = load_rgb(up)
    H, W = rgb.shape[:2]
    Image.fromarray(rgb).save(P(dir, 'src.jpg'), quality=95)
    soft, mask = auto_subject(rgb)
    np.save(P(dir, 'soft.npy'), soft.astype(np.float16))
    if mask is None:
        mask = np.ones((H, W), np.uint8)               # no clear subject: whole frame
    Image.fromarray(mask * 255).save(P(dir, 'auto.png'))
    meta = {'w': W, 'h': H, 'ver': 0}
    out = _store_mask(dir, mask, meta, True)
    out.update({'width': W, 'height': H})
    try:                                                # how much of the subject is skin-toned (portraits, body parts)
        small = cv2.resize(rgb, (W // 4 or 1, H // 4 or 1), interpolation=cv2.INTER_AREA)
        ms = cv2.resize(mask, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_NEAREST) > 0
        sk = cv2.inRange(cv2.cvtColor(small, cv2.COLOR_RGB2YCrCb), (50, 135, 77), (255, 175, 127)) > 0
        out['skinShare'] = round(float((sk & ms).sum() / max(1, ms.sum())), 3)
    except Exception:
        out['skinShare'] = 0
    return out

def _embed(d, src):
    p = P(d, 'emb.npy')
    if os.path.exists(p):
        return np.load(p)
    H, W = src.shape[:2]
    k = 1024.0 / max(H, W)                     # the encoder pads (never resizes), so hand it the 1024-frame image
    small = cv2.resize(src, (max(1, round(W * k)), max(1, round(H * k))), interpolation=cv2.INTER_AREA).astype(np.float32)
    small = (small - np.array([123.675, 116.28, 103.53], np.float32)) / np.array([58.395, 57.12, 57.375], np.float32)
    emb = session('mobile_sam_image_encoder.onnx').run(None, {'input_image': small})[0]
    np.save(p, emb)
    return emb

def cmd_segment(dir, points=None, warm=False):
    meta = load_meta(dir)
    src = load_src(dir)
    H, W = src.shape[:2]
    emb = _embed(dir, src)
    if warm:
        return {'warm': True}
    if not points:
        mask = (np.array(Image.open(P(dir, 'auto.png')).convert('L')) > 127).astype(np.uint8)
        return _store_mask(dir, mask, meta, True)
    k = 1024.0 / max(H, W)
    pc = np.array([[p['x'] * W * k, p['y'] * H * k] for p in points] + [[0.0, 0.0]], np.float32)[None]
    pl = np.array([float(p['l']) for p in points] + [-1.0], np.float32)[None]
    hp, wp = max(1, round(H * k)), max(1, round(W * k))
    outs = session('sam_mask_decoder_single.onnx').run(None, {
        'image_embeddings': emb, 'point_coords': pc, 'point_labels': pl,
        'mask_input': np.zeros((1, 1, 256, 256), np.float32), 'has_mask_input': np.zeros(1, np.float32),
        'orig_im_size': np.array([hp, wp], np.float32)})
    logits = cv2.resize(outs[0][0, 0].astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
    m = (logits > 0).astype(np.uint8)
    m = clean_mask(m, keep_rel=0.05)
    if m.mean() < 0.002:
        raise ValueError('Nothing selectable there. Click the middle of the object you want.')
    return _store_mask(dir, m, meta, False)


# ───────────────────────────── line art ─────────────────────────────
def relight(rgb, amount=0):
    """Even out uneven lighting so a shadowed half of the face is not traced as edges (0..100)."""
    a = float(amount) / 100.0
    if a <= 0:
        return rgb
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    L = lab[..., 0]
    base = cv2.GaussianBlur(L, (0, 0), max(rgb.shape[:2]) * 0.06) + 1.0
    flat = L / base * float(base.mean())
    lab[..., 0] = np.clip(L * (1 - a) + flat * a, 0, 255)
    return cv2.cvtColor(lab.astype(np.uint8), cv2.COLOR_LAB2RGB)

PROTECT = 30     # local contrast above this (tattoo ink, metal jewellery) is never smoothed as stubble
def destubble(rgb, amount=0):
    """Smooth only patches of dense fine hair texture (stubble, beard), leaving eyes, tattoos and jewellery sharp (0..100)."""
    a = float(amount) / 100.0
    if a <= 0:
        return rgb
    H, W = rgb.shape[:2]; L = max(H, W)
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    k = 2 * max(1, round(L * 0.004)) + 1
    hp = np.abs(g.astype(np.float32) - cv2.medianBlur(g, k).astype(np.float32))
    hp[hp > 60] = 60                                                     # strong single edges (tattoo lines, rings) count less
    energy = cv2.GaussianBlur(hp, (0, 0), L * 0.012)
    lo, hi = np.percentile(energy, 60), np.percentile(energy, 92)
    m = np.clip((energy - lo) / max(1e-3, hi - lo), 0, 1)
    m = cv2.GaussianBlur(m, (0, 0), L * 0.008)
    hp_raw = np.abs(g.astype(np.float32) - cv2.medianBlur(g, k).astype(np.float32))
    strong = (hp_raw > PROTECT).astype(np.uint8)                          # tattoo ink / metal jewellery: far more contrast than hair
    strong = drop_small(strong, max(4, (L * 0.004) ** 2))
    strong = cv2.GaussianBlur(cv2.dilate(strong, disk(L * 0.006)).astype(np.float32), (0, 0), L * 0.003)
    m = (m * (1 - np.clip(strong, 0, 1)))[..., None] * min(1.0, a * 1.4)
    r = max(1, round(L * (0.002 + 0.005 * a)))
    sm = cv2.morphologyEx(rgb, cv2.MORPH_CLOSE, disk(r))
    sm = cv2.medianBlur(sm, 2 * max(1, round(L * (0.002 + 0.004 * a))) + 1)
    for _ in range(2):
        sm = cv2.bilateralFilter(sm, 0, 30 + 30 * a, max(3.0, L * 0.008))
    return (sm * m + rgb * (1 - m)).astype(np.uint8)

def prefilter(rgb, smooth=0, texture=0, skin=0):
    """Simplify the photo before the line model sees it, so skin pores, stubble and fur don't become scribbles.
    smooth  0..100: removes small dark specks (stubble, pores) then softens skin while keeping real edges.
    texture 0..100: flattens areas into patches of similar colour (less shading detail, bolder shapes)."""
    smooth, texture, skin = float(smooth), float(texture), float(skin)
    if smooth <= 0 and texture <= 0 and skin <= 0:
        return rgb
    H, W = rgb.shape[:2]
    k = 1024.0 / max(H, W)
    img = cv2.resize(rgb, (max(8, round(W * k)), max(8, round(H * k))), interpolation=cv2.INTER_AREA) if k < 1 else rgb.copy()
    L = max(img.shape[:2])
    if skin > 0:                                                         # wrinkles + blemishes, skin tones only
        a = skin / 100.0
        ycc = cv2.cvtColor(img, cv2.COLOR_RGB2YCrCb)
        m = cv2.inRange(ycc, (50, 130, 72), (255, 180, 130)).astype(np.float32) / 255.0
        m = cv2.GaussianBlur(cv2.morphologyEx(m, cv2.MORPH_OPEN, disk(max(1, L // 300))), (0, 0), L * 0.004)[..., None]
        r = max(1, round(L * (0.002 + 0.006 * a)))
        sm = cv2.morphologyEx(cv2.morphologyEx(img, cv2.MORPH_CLOSE, disk(r)), cv2.MORPH_OPEN, disk(r))   # blemishes / spots
        sm = cv2.medianBlur(sm, 2 * max(1, round(L * (0.003 + 0.006 * a))) + 1)
        hh, ww = sm.shape[:2]
        sm = cv2.resize(sm, (max(8, ww // 2), max(8, hh // 2)), interpolation=cv2.INTER_AREA)   # half-res = 4x faster
        for _ in range(1 + int(a * 2)):                                  # flatten wrinkles but keep real edges
            sm = cv2.bilateralFilter(sm, 0, 18 + 30 * a, max(3.0, L * (0.004 + 0.008 * a)))  # was 25+45, 0.005+0.0125
        sm = cv2.resize(sm, (ww, hh), interpolation=cv2.INTER_LINEAR)
        img = (sm * m + img * (1 - m)).astype(np.uint8)
    if smooth > 0:
        a = smooth / 100.0
        # speck/stubble removal: keep kernel small so tattoo lines and edges survive
        # at smooth=45: r=2px disk, 3px median — fills hair-pore specks without smearing features
        r = max(1, round(L * (0.0010 + 0.0030 * a)))                    # was 0.0015+0.0075 — halved
        closed = cv2.morphologyEx(img, cv2.MORPH_CLOSE, disk(r))        # fills dark specks smaller than the disk
        m = (2 * round(L * (0.0005 + 0.0025 * a))) + 1                  # was 0.001+0.005 — halved
        img = cv2.medianBlur(closed, max(3, m))
        for _ in range(1 + int(a * 2)):                                  # was a*3 — fewer passes at high values
            img = cv2.bilateralFilter(img, 0, 12 + 28 * a, max(3.0, L * (0.003 + 0.008 * a)))  # was 18+40, 0.004+0.012
    if texture > 0:
        a = texture / 100.0
        img = cv2.pyrMeanShiftFiltering(img, sp=max(3, round(L * (0.005 + 0.014 * a))), sr=12 + 28 * a)
    return img

def line_art(rgb, model='contour-1024.onnx'):
    """Informative-Drawings contour model. Returns ink strength 0..1 (1 = line) over the image area."""
    s = session(model)
    inp = s.get_inputs()[0]
    S = int(inp.shape[2])
    H, W = rgb.shape[:2]
    k = S / max(H, W)
    h, w = max(8, round(H * k)), max(8, round(W * k))
    y0, x0 = (S - h) // 2, (S - w) // 2
    canvas = cv2.copyMakeBorder(cv2.resize(rgb, (w, h), interpolation=cv2.INTER_AREA),
                                y0, S - h - y0, x0, S - w - x0, cv2.BORDER_REPLICATE)
    out = s.run(None, {inp.name: (canvas.astype(np.float32) / 255.0).transpose(2, 0, 1)[None]})[0][0, 0]
    return 1.0 - np.clip(out[y0:y0 + h, x0:x0 + w], 0.0, 1.0)

def ink_subject(d, src, mask, ver, smooth=0, texture=0, skin=0, light=0, stubble=0):
    """Line drawing of the subject alone, run on a tight crop so it gets the model's full resolution."""
    box = padded_box(mask)
    p = P(d, f'ink_s{ver}_{int(smooth)}_{int(texture)}_{int(skin)}_{int(light)}_{int(stubble)}_c1.npy')
    if os.path.exists(p):
        return np.load(p).astype(np.float32), box
    y0, y1, x0, x1 = box
    rgb_c, m_c = src[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    if mask.mean() < 0.97:
        if ver == 1 and load_meta(d).get('auto') and os.path.exists(P(d, 'soft.npy')):
            soft = np.load(P(d, 'soft.npy'))[y0:y1, x0:x1].astype(np.float32)
            alpha = np.clip((soft - 0.3) / 0.4, 0, 1) * cv2.dilate(m_c, disk(9)).astype(np.float32)
        else:
            alpha = cv2.dilate(m_c, disk(9)).astype(np.float32)
        alpha = cv2.GaussianBlur(alpha, (0, 0), 1.5)[..., None]
        comp = (rgb_c * alpha + 255 * (1 - alpha)).astype(np.uint8)
    else:
        comp = rgb_c
    prefilt = prefilter(destubble(relight(comp, light), stubble), smooth, texture, skin)
    ink = line_art(prefilt)
    # Canny supplement: catches subtle lip/skin-tone edges and thin metallic rings the ONNX model misses.
    gray = cv2.cvtColor(prefilt, cv2.COLOR_RGB2GRAY)
    lo, hi = max(10, int(np.percentile(gray, 20))), min(200, int(np.percentile(gray, 80)))
    canny = cv2.Canny(gray, lo * 0.3, hi * 0.55)        # wide dynamic range to pick up both dark lines & bright metal
    canny_f = cv2.GaussianBlur(canny.astype(np.float32) / 255.0, (0, 0), 0.6)
    canny_r = cv2.resize(canny_f, (ink.shape[1], ink.shape[0]), interpolation=cv2.INTER_AREA)
    ink = np.clip(ink + canny_r * 0.45, 0.0, 1.0)       # add 45% of Canny to ONNX; enough to lift lips above threshold
    np.save(p, ink.astype(np.float16))
    return ink, box

def tone_subject(d, src, mask, ver, smooth=0, texture=0, skin=0):
    """Smoothed grayscale (0 dark .. 1 light) of the subject crop; used for solid fills and shadow shapes."""
    box = padded_box(mask)
    p = P(d, f'tone_{ver}_{int(smooth)}_{int(texture)}_{int(skin)}.npy')
    if os.path.exists(p):
        return np.load(p).astype(np.float32), box
    y0, y1, x0, x1 = box
    img = prefilter(src[y0:y1, x0:x1], max(smooth, 35), texture, skin)           # always de-speckle: stubble must not read as shadow
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32) / 255.0
    g = cv2.GaussianBlur(g, (0, 0), max(1.0, max(g.shape) * 0.004))
    np.save(p, g.astype(np.float16))
    return g, box

def ink_full(d, src, smooth=0, texture=0, skin=0):
    p = P(d, f'ink_full_{int(smooth)}_{int(texture)}_{int(skin)}.npy')
    if os.path.exists(p):
        return np.load(p).astype(np.float32)
    ink = line_art(prefilter(src, smooth, texture, skin))
    np.save(p, ink.astype(np.float16))
    return ink


# ───────────────────────────── render ─────────────────────────────
def cmd_render(dir, outbase, detail=65, weightMm=0.4, cleanup=30, background=0, sizeIn=5.0, mirror=False, smooth=10, texture=0, skin=0, fills=40, shadows=0, varw=60, light=0, stubble=50):
    T0 = time.time(); tm = {}
    detail, cleanup, background = [float(np.clip(v, 0, 100)) for v in (detail, cleanup, background)]
    fills, shadows, varw = [float(np.clip(v, 0, 100)) for v in (fills, shadows, varw)]
    weightMm = float(np.clip(weightMm, 0.1, 2.0)); sizeIn = float(np.clip(sizeIn, 0.5, 14))
    meta = load_meta(dir); ver = meta.get('ver', 1)
    src = load_src(dir); H, W = src.shape[:2]
    mask = load_mask(dir)
    isolated = 0.01 < mask.mean() < 0.97
    if not isolated:
        mask = np.ones((H, W), np.uint8)
    ty0, ty1, tx0, tx1 = tight_bbox(mask)
    sub_long = max(ty1 - ty0, tx1 - tx0)
    by0, by1, bx0, bx1 = padded_box(mask)

    s = background / 100.0 if isolated else 0.0
    T = 0.65 - 0.40 * detail / 100.0                          # ink strength a stroke needs to be kept
    r = int((s ** 1.5) * 1.1 * max(H, W)) if s > 0 else 0     # how far from the subject background lines may reach (source px)
    ry0, ry1, rx0, rx1 = max(0, by0 - r), min(H, by1 + r), max(0, bx0 - r), min(W, bx1 + r)
    reg_long = max(ry1 - ry0, rx1 - rx0)

    ppsrc = sizeIn * DPI / sub_long                            # delivered pixels per source pixel
    cap = min(1.0, MAX_OUT / (reg_long * ppsrc))
    ppsrc *= cap; dpi = DPI * cap
    k = min(ppsrc, MAX_WORK / reg_long); f = ppsrc / k         # work at k, upscale strokes by f at the end
    Ho, Wo = max(8, round((ry1 - ry0) * k)), max(8, round((rx1 - rx0) * k))
    ref = sub_long * k                                         # subject long edge in work pixels

    # subject silhouette at work resolution (edge-replicated so a subject running off the photo gets no frame line)
    pad = int(ref * 0.02) + 4
    mr = cv2.resize(mask[ry0:ry1, rx0:rx1].astype(np.float32), (Wo, Ho), interpolation=cv2.INTER_LINEAR)
    mp = cv2.copyMakeBorder(mr, pad, pad, pad, pad, cv2.BORDER_REPLICATE)
    mp = (cv2.GaussianBlur(mp, (0, 0), ref * 0.0025) > 0.5).astype(np.uint8)
    m = mp[pad:-pad, pad:-pad]

    # subject lines
    t1 = time.time()
    ink_s, (cy0, cy1, cx0, cx1) = ink_subject(dir, src, mask, ver, smooth, texture, skin, float(np.clip(light, 0, 100)), float(np.clip(stubble, 0, 100)))
    tm['draw_subject'] = time.time() - t1
    hc, wc = cy1 - cy0, cx1 - cx0
    hs, ws = max(1, round(hc * k)), max(1, round(wc * k))
    ink_sr = cv2.resize(ink_s, (ws, hs), interpolation=cv2.INTER_CUBIC)
    oy, ox = round((cy0 - ry0) * k), round((cx0 - rx0) * k)
    canvas = np.zeros((Ho, Wo), np.float32)
    ya, xa, yb, xb = max(0, oy), max(0, ox), min(Ho, oy + hs), min(Wo, ox + ws)
    canvas[ya:yb, xa:xb] = ink_sr[ya - oy:yb - oy, xa - ox:xb - ox]
    zone = cv2.dilate(m, disk(ref * 0.004))
    lines = ((canvas > T) & (zone > 0)).astype(np.uint8)
    up = hs / ink_s.shape[0]

    # background lines, gated by distance from the subject and by stroke strength (strongest, nearest first)
    if s > 0:
        t1 = time.time()
        ink_f = ink_full(dir, src, smooth, texture, skin)
        tm['draw_background'] = time.time() - t1
        hf, wf = ink_f.shape
        sy, sx = hf / H, wf / W
        fy0, fx0 = int(ry0 * sy), int(rx0 * sx)
        fy1, fx1 = max(fy0 + 1, int(np.ceil(ry1 * sy))), max(fx0 + 1, int(np.ceil(rx1 * sx)))
        ink_bg = cv2.resize(ink_f[fy0:fy1, fx0:fx1], (Wo, Ho), interpolation=cv2.INTER_CUBIC)
        dist_out = cv2.distanceTransform((1 - m).astype(np.uint8), cv2.DIST_L2, 3)
        thr_bg = T + (1.0 - s) * (0.97 - T)
        keep_out = cv2.dilate(m, disk(ref * 0.010))
        lines |= ((ink_bg > thr_bg) & (keep_out == 0) & (dist_out <= r * k)).astype(np.uint8)
        up = max(up, Ho / max(1, fy1 - fy0))

    t2 = time.time()
    # dense texture (fur, hatching) -> one outlined patch instead of hundreds of strokes (only at very low detail)
    tex_outline = np.zeros_like(lines)
    if detail < 25:
        win = int(ref * 0.02) | 1
        dens = cv2.blur(lines.astype(np.float32), (win, win))
        tex = cv2.morphologyEx((dens > 0.45).astype(np.uint8), cv2.MORPH_CLOSE, disk(win))
        tex = drop_small(tex, (0.04 * ref) ** 2)
        if tex.any():
            lines[tex > 0] = 0
            cs, _ = cv2.findContours(tex, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            cv2.drawContours(tex_outline, cs, -1, 1, 1)

    dist = cv2.distanceTransform(lines, cv2.DIST_L2, 5)        # hollow anything thicker than a pen stroke
    fill_r = max(3.0 * up, ref * 0.006)                        # at least ~0.6% of subject size so eyebrow-scale blobs always hollow
    core = (dist > fill_r).astype(np.uint8)
    if core.any():
        lines &= 1 - cv2.dilate(core, disk(max(1, 2 * fill_r - 2)))
    lines = drop_small(lines, (0.004 * ref) ** 2)
    skel = (cv2.ximgproc.thinning(lines * 255, thinningType=cv2.ximgproc.THINNING_ZHANGSUEN) > 0).astype(np.uint8)
    skel |= tex_outline
    frag = 0.004 + 0.046 * cleanup / 100.0
    skel = drop_fragments(skel, frag * ref, 0.6 * frag * ref)

    if isolated:                                               # silhouette, only where the drawing left a gap
        op = np.zeros_like(mp)
        cnts, hier = cv2.findContours(mp, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        tot = float(mp.sum())
        if hier is not None:
            for c, hh in zip(cnts, hier[0]):
                if cv2.contourArea(c) >= (0.01 if hh[3] < 0 else 0.004) * tot:
                    cv2.drawContours(op, [c], -1, 1, 1)
        outline = op[pad:-pad, pad:-pad]
        near = cv2.distanceTransform((1 - skel).astype(np.uint8), cv2.DIST_L2, 3)
        outline &= (near > ref * 0.006).astype(np.uint8)
        skel |= drop_fragments(outline, 0.01 * ref, 0.006 * ref)

    # tone: solid black for the darkest features (brows, pupils, nostrils, dark patches) and outlined shadow shapes
    solid = np.zeros_like(skel); thin = np.zeros_like(skel)
    if (fills > 0 or shadows > 0) and isolated:
        g, _b = tone_subject(dir, src, mask, ver, smooth, texture, skin)
        gr = cv2.resize(g, (ws, hs), interpolation=cv2.INTER_AREA)
        gc = np.ones((Ho, Wo), np.float32)
        gc[ya:yb, xa:xb] = gr[ya - oy:yb - oy, xa - ox:xb - ox]
        inner = cv2.erode(m, disk(ref * 0.03))                                     # keep fills off the silhouette edge
        gl = gc / (cv2.GaussianBlur(gc, (0, 0), max(3.0, ref * 0.06)) + 0.04)   # local darkness: ignores lighting gradients
        vals = gc[inner > 0]
        lvals = gl[inner > 0]
        if vals.size > 100:
            if fills > 0:
                t = np.percentile(lvals, 1.5 + 9.0 * fills / 100.0)
                dk = ((gl < t) & (inner > 0)).astype(np.uint8)
                dk = cv2.morphologyEx(dk, cv2.MORPH_OPEN, disk(max(2, ref * 0.006)))
                dk = cv2.morphologyEx(dk, cv2.MORPH_CLOSE, disk(max(2, ref * 0.008)))
                dk = drop_small(dk, (0.012 * ref) ** 2)
                nlab, lab, st, _c = cv2.connectedComponentsWithStats(dk, connectivity=8)
                for i in range(1, nlab):                                           # one huge dark region is a shadow, not a feature
                    if st[i, cv2.CC_STAT_AREA] > (0.22 * ref) ** 2:
                        dk[lab == i] = 0
                solid = dk
            if shadows > 0:
                tsh = np.percentile(vals, 12 + 26 * shadows / 100.0)
                sh = ((gc < tsh) & (inner > 0)).astype(np.uint8)
                sh = cv2.morphologyEx(sh, cv2.MORPH_OPEN, disk(max(2, ref * 0.012)))
                sh = cv2.morphologyEx(sh, cv2.MORPH_CLOSE, disk(max(2, ref * 0.02)))
                sh = drop_small(sh, (0.05 * ref) ** 2)
                edge = (sh - cv2.erode(sh, disk(3))) > 0
                edge = edge.astype(np.uint8)
                near = cv2.distanceTransform((1 - (skel | cv2.dilate(solid, disk(3)))).astype(np.uint8), cv2.DIST_L2, 3)
                edge &= (near > ref * 0.014).astype(np.uint8)                     # skip where a line already is
                edge = (cv2.ximgproc.thinning(cv2.dilate(edge, disk(3)) * 255, thinningType=cv2.ximgproc.THINNING_ZHANGSUEN) > 0).astype(np.uint8)
                edge = drop_fragments(edge, 0.05 * ref, 0.03 * ref)
                thin = edge; skel = skel | edge
        if solid.any():
            skel &= 1 - cv2.dilate(solid, disk(max(3, ref * 0.01)))                # no scribbles inside a solid fill

    # one uniform pen width, in real millimetres: smoothed centre-lines drawn crisp at final resolution
    pen = max(4.0, weightMm / 25.4 * dpi)                      # final px; never thinner than ~0.34 mm @300dpi so nothing vanishes
    Hf, Wf = round(Ho * f), round(Wo * f)
    canvas8 = np.zeros((Hf, Wf), np.uint8)
    vw = varw / 100.0
    din = cv2.distanceTransform(mp, cv2.DIST_L2, 3)[pad:-pad, pad:-pad] if isolated else None   # distance inside the silhouette
    cs, _ = cv2.findContours(skel.astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    SH = 4
    for c in cs:
        pts = c[:, 0, :].astype(np.float32)
        n = len(pts)
        fac = 1.0
        if vw > 0:
            xi, yi = np.clip(pts[:, 0].astype(int), 0, Wo - 1), np.clip(pts[:, 1].astype(int), 0, Ho - 1)
            Lc = n / 2.0
            if din is not None and (din[yi, xi] < ref * 0.025).mean() > 0.5:
                raw = 2.6                                                  # silhouette
            elif thin[yi, xi].mean() > 0.5:
                raw = 0.7                                                  # shadow shapes
            else:
                raw = 0.8 + 0.9 * min(1.0, Lc / (0.30 * ref))              # short = fine, long = medium/bold
            fac = 1.0 + vw * (raw - 1.0)
        th = max(4.0, pen * fac) if vw == 0 else max(4.0, pen * fac)
        if n >= 5:                                                         # circular moving average removes pixel staircase
            win = min(max(7, n // 3) | 1, 25)                             # scale with curve length, odd, up to 25 for smooth ovals
            if win % 2 == 0: win += 1
            ker = np.ones(win, np.float32) / win
            pad_ = win // 2
            ext = np.concatenate([pts[-pad_:], pts, pts[:pad_]])
            pts = np.stack([np.convolve(ext[:, 0], ker, 'valid'), np.convolve(ext[:, 1], ker, 'valid')], 1)
            if n >= 30:                                                    # second pass for long curves (eyes, lips, face oval)
                ext = np.concatenate([pts[-pad_:], pts, pts[:pad_]])
                pts = np.stack([np.convolve(ext[:, 0], ker, 'valid'), np.convolve(ext[:, 1], ker, 'valid')], 1)
        q = np.round((pts + 0.5) * f * (1 << SH)).astype(np.int32).reshape(-1, 1, 2)
        if n == 1:
            cv2.circle(canvas8, tuple(int(v) for v in ((pts[0] + 0.5) * f)), max(1, round(th / 2)), 255, -1, cv2.LINE_AA)
        else:
            cv2.polylines(canvas8, [q], True, 255, max(1, round(th)), cv2.LINE_AA, SH)
    if solid.any():                                                        # solid fills, smooth edges
        sc = cv2.GaussianBlur(cv2.resize(solid.astype(np.float32), (Wf, Hf), interpolation=cv2.INTER_LINEAR), (0, 0), max(1.0, f * 1.2))
        canvas8 = np.maximum(canvas8, ((sc > 0.5) * 255).astype(np.uint8))
    ink = canvas8 > 127
    rows, cols = np.where(ink.any(1))[0], np.where(ink.any(0))[0]
    if len(rows) == 0:
        raise ValueError('No lines came out. Raise "Line detail" or add some background line work.')
    mg = int(MARGIN_IN * dpi)
    ink = np.pad(ink[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1], mg)
    out = np.where(ink, 0, 255).astype(np.uint8)
    if mirror:
        out = np.ascontiguousarray(out[:, ::-1])
    tm['clean'] = time.time() - t2

    # export
    png, pdf = outbase + '.png', outbase + '.pdf'
    img = Image.fromarray(out).convert('1', dither=Image.Dither.NONE)
    img.save(png, 'PNG', dpi=(round(dpi), round(dpi)), optimize=True)
    h_px, w_px = out.shape
    wi, hi = w_px / dpi, h_px / dpi
    fit, pw, ph = max(((min(1.0, (a - 0.5) / wi, (b - 0.5) / hi), a, b) for a, b in ((8.5, 11), (11, 8.5))), key=lambda t: t[0])
    page = Image.new('1', (round(pw * 300), round(ph * 300)), 1)
    sw, sh = max(1, round(w_px * fit * 300 / dpi)), max(1, round(h_px * fit * 300 / dpi))
    sc = Image.fromarray(out).resize((sw, sh), Image.LANCZOS).point(lambda v: 255 if v > 127 else 0).convert('1', dither=Image.Dither.NONE)
    page.paste(sc, ((page.width - sw) // 2, (page.height - sh) // 2))
    page.save(pdf, 'PDF', resolution=300)
    tm['total'] = time.time() - T0
    return {'png': png, 'pdf': pdf, 'inches': [round(wi, 2), round(hi, 2)], 'subjectInches': round(sizeIn, 2),
            'inkCoverage': round(float((out < 128).mean()) * 100, 2), 'fitScale': round(fit, 3),
            'orientation': 'landscape' if pw > ph else 'portrait', 'isolated': bool(isolated),
            'timing': {a: round(b, 2) for a, b in tm.items()}}


def cmd_filtered(dir, out, smooth=0, texture=0, skin=0, stubble=0):
    """Save the photo as the line model sees it (after the pre-filters), full resolution JPEG."""
    src = load_src(dir)
    H, W = src.shape[:2]
    img = prefilter(destubble(src, stubble), smooth, texture, skin)
    if img.shape[:2] != (H, W):
        img = cv2.resize(img, (W, H), interpolation=cv2.INTER_CUBIC)
    Image.fromarray(img).save(out, 'JPEG', quality=95)
    return {'file': out, 'width': W, 'height': H}


def _export_bw(out, dpi, outbase, sizeIn, t0, extra=None):
    png, pdf = outbase + '.png', outbase + '.pdf'
    Image.fromarray(out).convert('1', dither=Image.Dither.NONE).save(png, 'PNG', dpi=(round(dpi), round(dpi)), optimize=True)
    h_px, w_px = out.shape
    wi, hi = w_px / dpi, h_px / dpi
    fit, pw, ph = max(((min(1.0, (a - 0.5) / wi, (b - 0.5) / hi), a, b) for a, b in ((8.5, 11), (11, 8.5))), key=lambda t: t[0])
    page = Image.new('1', (round(pw * 300), round(ph * 300)), 1)
    sw, sh = max(1, round(w_px * fit * 300 / dpi)), max(1, round(h_px * fit * 300 / dpi))
    sc = Image.fromarray(out).resize((sw, sh), Image.LANCZOS).point(lambda v: 255 if v > 127 else 0).convert('1', dither=Image.Dither.NONE)
    page.paste(sc, ((page.width - sw) // 2, (page.height - sh) // 2))
    page.save(pdf, 'PDF', resolution=300)
    r = {'png': png, 'pdf': pdf, 'inches': [round(wi, 2), round(hi, 2)], 'subjectInches': round(sizeIn, 2),
         'inkCoverage': round(float((out < 128).mean()) * 100, 2), 'fitScale': round(fit, 3),
         'orientation': 'landscape' if pw > ph else 'portrait', 'isolated': True, 'timing': {'total': round(time.time() - t0, 2)}}
    r.update(extra or {})
    return r


def cmd_flash(gen, outbase, sizeIn=5.0, black=90, shade='none', mirror=False, speck=35):
    """Turn an AI-drawn flash image (black ink + grey shading on white) into a print-ready 1-bit stencil.
    black 30..200: how dark a pixel must be to become ink. shade: none | dots | lines for the grey tones."""
    t0 = time.time()
    sizeIn = float(np.clip(sizeIn, 0.5, 14)); black = int(np.clip(black, 30, 200)); speck = float(np.clip(speck, 0, 100))
    g = np.array(Image.open(gen).convert('L'))
    H, W = g.shape
    dpi = float(DPI)
    k = sizeIn * dpi / max(H, W)
    if max(H, W) * k > MAX_OUT:
        k = MAX_OUT / max(H, W); dpi = k * max(H, W) / sizeIn
    gs = cv2.resize(g, (round(W * k), round(H * k)), interpolation=cv2.INTER_CUBIC)
    gs = cv2.GaussianBlur(gs, (0, 0), max(1.0, k * 0.6))
    L = max(gs.shape)
    ink = (gs < black).astype(np.uint8)
    ink = drop_small(ink, (L * (0.0015 + 0.004 * speck / 100.0)) ** 2)                       # specks
    inv = drop_small(1 - ink, (L * 0.0012) ** 2)                                              # pin-holes inside solids
    ink = 1 - inv
    pen = max(4, int(round(0.34 / 25.4 * dpi)))                                               # nothing thinner than ~0.34 mm
    opened = cv2.morphologyEx(ink, cv2.MORPH_OPEN, disk(pen + 1))
    thin = ink & (1 - cv2.dilate(opened, disk(pen + 1)))
    if thin.any():
        ink = ink | cv2.dilate(thin, disk(pen + 1))
    if shade in ('dots', 'lines'):
        mid = ((gs >= black) & (gs < 205)).astype(np.uint8)
        mid = cv2.morphologyEx(mid, cv2.MORPH_OPEN, disk(max(3, L * 0.006)))
        mid = drop_small(mid, (L * 0.03) ** 2) & (1 - cv2.dilate(ink, disk(pen)))
        if mid.any():
            sp = max(10, int(round(L * 0.011)))
            layer = np.zeros_like(ink)
            if shade == 'dots':
                for y in range(sp // 2, gs.shape[0], sp):
                    for x in range(sp // 2, gs.shape[1], sp):
                        if mid[y, x]:
                            dark = (205 - gs[y, x]) / (205.0 - black)
                            cv2.circle(layer, (x, y), int(round(pen * (0.45 + 0.55 * min(1.0, dark)))), 1, -1)
            else:
                yy, xx = np.mgrid[0:gs.shape[0], 0:gs.shape[1]]
                layer = (((xx + yy) % (sp * 1.4)) < pen * 0.8).astype(np.uint8)
            ink = ink | (layer & mid)
    ink = cv2.GaussianBlur(ink.astype(np.float32), (0, 0), 0.8) > 0.5                          # smooth stair-steps
    rows, cols = np.where(ink.any(1))[0], np.where(ink.any(0))[0]
    if len(rows) == 0:
        raise ValueError('The AI drawing came out empty. Try again or lower the black level.')
    mg = int(MARGIN_IN * dpi)
    ink = np.pad(ink[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1], mg)
    out = np.where(ink, 0, 255).astype(np.uint8)
    if mirror:
        out = np.ascontiguousarray(out[:, ::-1])
    return _export_bw(out, dpi, outbase, sizeIn, t0)


# ─── Text-to-stencil ──────────────────────────────────────────────────────────
def cmd_text_stencil(text='', font='Arial', sizeIn=5.0, chips='', outPng=''):
    """Render text as a pure black-on-white stencil PNG at 300 DPI."""
    import os, re
    from PIL import Image, ImageDraw, ImageFont
    t0 = time.time()
    DPI = 300
    # Target width in pixels for the given sizeIn (height auto from font metrics)
    target_w = int(round(sizeIn * DPI))
    # Font search: try local public/fonts/, then system
    font_dirs = [
        os.path.join(os.path.dirname(__file__), 'public', 'fonts'),
        '/usr/share/fonts', '/usr/local/share/fonts',
    ]
    font_path = None
    font_slug = re.sub(r'[^a-z0-9]', '', font.lower())
    for d in font_dirs:
        if not os.path.isdir(d):
            continue
        for fn in os.listdir(d):
            if re.sub(r'[^a-z0-9]', '', fn.lower()).startswith(font_slug) and fn.lower().endswith(('.ttf', '.otf')):
                font_path = os.path.join(d, fn)
                break
        if font_path:
            break
    # Iteratively find font size that fills target_w
    fs = 200
    for _ in range(20):
        try:
            pil_font = ImageFont.truetype(font_path, fs) if font_path else ImageFont.load_default()
        except Exception:
            pil_font = ImageFont.load_default()
        dummy = Image.new('L', (1, 1))
        bb = ImageDraw.Draw(dummy).textbbox((0, 0), text, font=pil_font)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        if tw <= 0:
            break
        ratio = target_w / tw
        if abs(ratio - 1.0) < 0.02:
            break
        fs = max(8, int(fs * ratio * 0.95))
    # Render with padding
    pad = max(20, int(DPI * 0.15))
    img = Image.new('L', (tw + pad * 2, th + pad * 2), 255)
    draw = ImageDraw.Draw(img)
    draw.text((pad - bb[0], pad - bb[1]), text, font=pil_font, fill=0)
    # Threshold to pure 1-bit
    arr = np.array(img)
    arr = np.where(arr < 128, 0, 255).astype(np.uint8)
    out_img = Image.fromarray(arr)
    os.makedirs(os.path.dirname(outPng) if os.path.dirname(outPng) else '.', exist_ok=True)
    out_img.save(outPng, dpi=(DPI, DPI))
    return {'png': outPng, 'elapsed': round(time.time() - t0, 2)}
