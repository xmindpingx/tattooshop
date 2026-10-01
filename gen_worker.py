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
_pipe = None

def pipe():
    global _pipe
    if _pipe is None:
        import torch
        from diffusers import StableDiffusionXLControlNetPipeline, ControlNetModel, UniPCMultistepScheduler
        t = time.time()
        cn = ControlNetModel.from_pretrained(os.path.join(M, 'controlnet-canny'), torch_dtype=torch.float16, variant='fp16', use_safetensors=True)
        p = StableDiffusionXLControlNetPipeline.from_pretrained(os.path.join(M, 'sdxl'), controlnet=cn, torch_dtype=torch.float16, variant='fp16', use_safetensors=True)
        lora = os.path.join(M, 'tattoo-lora')
        from safetensors.torch import load_file
        sd = {k: v for k, v in load_file(os.path.join(lora, 'SDXL-tattoo-Lora.safetensors')).items() if k.startswith('lora_unet_')}   # UNet part only (kohya format)
        p.load_lora_weights(sd, adapter_name='tattoo')
        p.set_adapters(['tattoo'], adapter_weights=[0.65])
        p.scheduler = UniPCMultistepScheduler.from_config(p.scheduler.config)
        p.to('cuda')
        p.vae.enable_tiling()
        p.enable_attention_slicing('auto')        # the 16 GB card runs out of memory on full attention at ~1000 px
        _pipe = p
        print(f'[gen] pipeline ready in {time.time() - t:.1f}s', flush=True)
    return _pipe

def control_image(d, long_edge=1024):
    """Canny edges of the de-speckled subject, plus its silhouette, on black. Returns (PIL image, size)."""
    src = np.array(Image.open(os.path.join(d, 'src.jpg')).convert('RGB'))
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
    g = cv2.medianBlur(g, 7)
    for _ in range(3):
        g = cv2.bilateralFilter(g, 0, 45, 9)
    e = cv2.Canny(g, 20, 70)
    e = cv2.morphologyEx(e, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(e, connectivity=8)           # drop specks (stubble / pores)
    keep = np.zeros(n, bool); keep[1:] = st[1:, cv2.CC_STAT_AREA] >= 0.00012 * tw * th
    e = (keep[lab] * 255).astype(np.uint8)
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(e, cs, -1, 255, 3)
    e = cv2.dilate(e, np.ones((2, 2), np.uint8))
    e[m == 0] = np.where(e[m == 0] > 0, 255, 0)                                   # background edges stay only where they were drawn
    return Image.fromarray(np.stack([e] * 3, -1)), (tw, th)

def cmd_generate(dir, out, prompt, negative, scale=0.75, steps=28, guidance=6.0, seed=None, control_out=None, long_edge=768):
    import torch
    t0 = time.time()
    ctl, (tw, th) = control_image(dir, long_edge)
    if control_out:
        ctl.save(control_out)
    p = pipe()
    gen = torch.Generator('cuda').manual_seed(int(seed) if seed is not None else int(time.time()) % 2**31)
    img = p(prompt=prompt, negative_prompt=negative, image=ctl, width=tw, height=th, num_inference_steps=int(steps),
            guidance_scale=float(guidance), controlnet_conditioning_scale=float(scale), control_guidance_end=0.9, generator=gen).images[0]
    img.save(out)
    # ── post-process: flood-fill background to pure white ────────────
    arr = np.array(img.convert('RGB'))
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    # seed from all four corners to capture the background
    h_, w_ = arr.shape[:2]
    mask_ = np.zeros((h_ + 2, w_ + 2), np.uint8)
    flood = gray.copy()
    for x_, y_ in [(0, 0), (w_ - 1, 0), (0, h_ - 1), (w_ - 1, h_ - 1)]:
        if flood[y_, x_] > 80:   # only flood from light corners
            cv2.floodFill(flood, mask_, (x_, y_), 255, loDiff=50, upDiff=50, flags=cv2.FLOODFILL_FIXED_RANGE)
    # pixels that were seeded become 255; restore anything that was already 255 or was turned 255 by flood
    bg = (mask_[1:-1, 1:-1] > 0)
    arr[bg] = (255, 255, 255)
    Image.fromarray(arr).save(out)
    torch.cuda.empty_cache()
    return {'out': out, 'width': tw, 'height': th, 'seconds': round(time.time() - t0, 1)}

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
