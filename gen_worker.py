#!/usr/bin/env python3
"""AI redraw worker (SDXL + tattoo LoRA + canny ControlNet, AMD GPU). JSON lines on stdin/stdout like worker.py.
Loaded lazily on the first request; the server stops this process after it has been idle for a while to free the GPU."""
import sys, os, json, time, traceback
proto = sys.stdout
sys.stdout = sys.stderr
os.environ.setdefault('HSA_OVERRIDE_GFX_VERSION', '10.3.0')
os.environ.setdefault('PYTORCH_HIP_ALLOC_CONF', 'expandable_segments:True')
import numpy as np, cv2
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
M = os.path.join(ROOT, 'models', 'gen')

BASES = {'sdxl': os.path.join(M, 'sdxl'), 'juggernaut': os.path.join(M, 'juggernaut-xl')}
LORAS = {
    'tattoo': {'file': os.path.join(M, 'tattoo-lora', 'SDXL-tattoo-Lora.safetensors'), 'trigger': 'tattoo'},
    'design': {'file': os.path.join(M, 'loras', 'Tattoo_gen.safetensors'), 'trigger': 'Tattoo_gen'},
}

_pipe = None
_pipe_key = None

def pipe(base='sdxl', lora='tattoo', lora_weight=0.65):
    global _pipe, _pipe_key
    base = base if base in BASES and os.path.isdir(BASES[base]) else 'sdxl'
    lora = lora if lora in LORAS and os.path.exists(LORAS[lora]['file']) else None
    key = (base, lora, round(float(lora_weight), 2))
    if _pipe is not None and _pipe_key == key:
        return _pipe
    import torch
    from diffusers import StableDiffusionXLControlNetPipeline, ControlNetModel, UniPCMultistepScheduler
    if _pipe is not None:                                              # free the GPU before loading the next combination
        del _pipe; _pipe = None; torch.cuda.empty_cache()
    t = time.time()
    cn = ControlNetModel.from_pretrained(os.path.join(M, 'controlnet-canny'), torch_dtype=torch.float16, variant='fp16', use_safetensors=True)
    p = StableDiffusionXLControlNetPipeline.from_pretrained(BASES[base], controlnet=cn, torch_dtype=torch.float16, variant='fp16', use_safetensors=True)
    if lora:
        from safetensors.torch import load_file
        sd = {k: v for k, v in load_file(LORAS[lora]['file']).items() if k.startswith('lora_unet_')}   # UNet part only (kohya format)
        p.load_lora_weights(sd, adapter_name=lora)
        p.set_adapters([lora], adapter_weights=[float(lora_weight)])
    p.scheduler = UniPCMultistepScheduler.from_config(p.scheduler.config)
    p.to('cuda')
    p.vae.enable_tiling()
    p.enable_attention_slicing('auto')        # the 16 GB card runs out of memory on full attention at ~1000 px
    _pipe, _pipe_key = p, key
    print(f'[gen] pipeline ({base}, {lora}) ready in {time.time() - t:.1f}s', flush=True)
    return _pipe

def control_image(d, long_edge=1024):
    """Canny edges of the de-speckled subject, plus its silhouette, on black. Returns (PIL image, size)."""
    # Use pre-filtered image if available (engine.py already ran skin/stubble smoothing on it)
    filtered_path = os.path.join(d, 'filtered.jpg')
    src_path = os.path.join(d, 'src.jpg')
    src = np.array(Image.open(filtered_path if os.path.exists(filtered_path) else src_path).convert('RGB'))
    mask = (np.array(Image.open(os.path.join(d, 'mask.png')).convert('L')) > 127).astype(np.uint8)
    H, W = mask.shape
    ys, xs = np.where(mask > 0)
    if len(ys) < 50:
        y0, y1, x0, x1 = 0, H, 0, W
    else:
        pad = int(0.05 * max(ys.max() - ys.min(), xs.max() - xs.min()))
        y0, y1, x0, x1 = max(0, ys.min() - pad), min(H, ys.max() + pad), max(0, xs.min() - pad), min(W, xs.max() + pad)
    img, m = src[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    h, w = m.shape
    k = long_edge / max(h, w)
    tw, th = max(64, round(w * k / 64) * 64), max(64, round(h * k / 64) * 64)
    img = cv2.resize(img, (tw, th), interpolation=cv2.INTER_AREA); m = cv2.resize(m, (tw, th), interpolation=cv2.INTER_NEAREST)
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    # ── Stubble suppression ──────────────────────────────────────────
    # Large morph-close merges individual beard/mustache hairs into solid dark regions
    # before Canny sees them — prevents hair-strand edges from becoming blotchy lines.
    close_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))
    g_closed = cv2.morphologyEx(g, cv2.MORPH_CLOSE, close_k)
    # Blend: apply closed image in dark regions (beard/shadow), keep original in bright regions (highlights)
    alpha = np.clip((255 - g.astype(np.float32)) / 180.0, 0, 1)   # weight = 1 where dark, 0 where bright
    g = (g_closed * alpha + g * (1 - alpha)).astype(np.uint8)
    # Strong bilateral chain to smooth skin while preserving tattoo/feature edges
    g = cv2.medianBlur(g, 7)
    for _ in range(4):
        g = cv2.bilateralFilter(g, 0, 55, 11)
    e = cv2.Canny(g, 20, 70)
    e = cv2.morphologyEx(e, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(e, connectivity=8)           # drop specks (stubble / pores)
    keep = np.zeros(n, bool); keep[1:] = st[1:, cv2.CC_STAT_AREA] >= 0.00015 * tw * th   # slightly higher threshold = fewer hair strands
    e = (keep[lab] * 255).astype(np.uint8)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(e, cs, -1, 255, 3)
    e = cv2.dilate(e, np.ones((2, 2), np.uint8))
    e[m == 0] = np.where(e[m == 0] > 0, 255, 0)                                   # background edges stay only where they were drawn
    return Image.fromarray(np.stack([e] * 3, -1)), (tw, th)

def whiten_bg(img):
    """Flood-fill the background to pure white, seeding from the four corners."""
    arr = np.array(img.convert('RGB'))
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    h_, w_ = arr.shape[:2]
    mask_ = np.zeros((h_ + 2, w_ + 2), np.uint8)
    flood = gray.copy()
    for x_, y_ in [(0, 0), (w_ - 1, 0), (0, h_ - 1), (w_ - 1, h_ - 1)]:
        if flood[y_, x_] > 80:
            cv2.floodFill(flood, mask_, (x_, y_), 255, loDiff=50, upDiff=50, flags=cv2.FLOODFILL_FIXED_RANGE)
    bg = (mask_[1:-1, 1:-1] > 0)
    arr[bg] = (255, 255, 255)
    return Image.fromarray(arr)

def cmd_generate(dir, out, prompt, negative, scale=0.75, steps=28, guidance=6.0, seed=None, control_out=None,
                  long_edge=768, base='sdxl', lora='tattoo', loraWeight=0.65, whiten=True):
    import torch
    t0 = time.time()
    ctl, (tw, th) = control_image(dir, long_edge)
    if control_out:
        ctl.save(control_out)
    p = pipe(base, lora, loraWeight)
    gen = torch.Generator('cuda').manual_seed(int(seed) if seed is not None else int(time.time()) % 2**31)
    img = p(prompt=prompt, negative_prompt=negative, image=ctl, width=tw, height=th, num_inference_steps=int(steps),
            guidance_scale=float(guidance), controlnet_conditioning_scale=float(scale), control_guidance_end=0.9, generator=gen).images[0]
    if whiten:
        img = whiten_bg(img)
    img.save(out)
    torch.cuda.empty_cache()
    return {'out': out, 'width': tw, 'height': th, 'seconds': round(time.time() - t0, 1)}

def cmd_generate_batch(dir, outs, prompt, negative, scale=0.75, steps=28, guidance=6.0, seeds=None, long_edge=768,
                        base='sdxl', lora='tattoo', loraWeight=0.65, whiten=True):
    """Several candidates from the same control image/prompt, one per seed, for a preview grid."""
    import torch
    t0 = time.time()
    ctl, (tw, th) = control_image(dir, long_edge)
    p = pipe(base, lora, loraWeight)
    seeds = seeds or [int(time.time()) % 2**31 + i for i in range(len(outs))]
    results = []
    for out, sd in zip(outs, seeds):
        torch.cuda.empty_cache()                                           # free fragments before each candidate to avoid OOM
        gen = torch.Generator('cuda').manual_seed(int(sd))
        img = p(prompt=prompt, negative_prompt=negative, image=ctl, width=tw, height=th, num_inference_steps=int(steps),
                guidance_scale=float(guidance), controlnet_conditioning_scale=float(scale), control_guidance_end=0.9, generator=gen).images[0]
        if whiten:
            img = whiten_bg(img)
        img.save(out)
        results.append({'out': out, 'seed': int(sd)})
    torch.cuda.empty_cache()
    return {'images': results, 'width': tw, 'height': th, 'seconds': round(time.time() - t0, 1)}

def cmd_models(**_):
    return {
        'bases': [k for k, v in BASES.items() if os.path.isdir(v)],
        'loras': [k for k, v in LORAS.items() if os.path.exists(v['file'])],
    }

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    rid = None
    try:
        req = json.loads(line); rid = req.get('id')
        reply = {'id': rid, 'ok': True, 'result': globals()['cmd_' + req['cmd']](**(req.get('args') or {}))}
    except Exception as e:
        traceback.print_exc()
        reply = {'id': rid, 'ok': False, 'error': str(e)}
    proto.write(json.dumps(reply) + '\n'); proto.flush()
