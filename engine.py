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
MAX_SRC  = 2400     # cap for the prepared photo
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

def ink_subject(d, src, mask, ver):
    """Line drawing of the subject alone, run on a tight crop so it gets the model's full resolution."""
    box = padded_box(mask)
    p = P(d, f'ink_s{ver}.npy')
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
    ink = line_art(comp)
    np.save(p, ink.astype(np.float16))
    return ink, box

def ink_full(d, src):
    p = P(d, 'ink_full.npy')
    if os.path.exists(p):
        return np.load(p).astype(np.float32)
    ink = line_art(src)
    np.save(p, ink.astype(np.float16))
    return ink


# ───────────────────────────── render ─────────────────────────────
def cmd_render(dir, outbase, detail=50, weightMm=0.4, cleanup=35, background=0, sizeIn=5.0, mirror=False):
    T0 = time.time(); tm = {}
    detail, cleanup, background = [float(np.clip(v, 0, 100)) for v in (detail, cleanup, background)]
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
    ink_s, (cy0, cy1, cx0, cx1) = ink_subject(dir, src, mask, ver)
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
        ink_f = ink_full(dir, src)
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
    fill_r = 3.0 * up
    core = (dist > fill_r).astype(np.uint8)
    if core.any():
        lines &= 1 - cv2.dilate(core, disk(2 * fill_r - 2))
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

    # one uniform pen width, in real millimetres
    w = max(3, int(round(weightMm / 25.4 * dpi / f)))
    stroke = cv2.dilate(skel * 255, disk(w)).astype(np.float32)
    stroke = cv2.GaussianBlur(stroke, (0, 0), max(0.6, w * 0.3))
    if f > 1.01:
        stroke = cv2.resize(stroke, (round(Wo * f), round(Ho * f)), interpolation=cv2.INTER_LINEAR)
    ink = stroke > 127
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
