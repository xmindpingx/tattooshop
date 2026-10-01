#!/usr/bin/env python3
"""
TattooShop Stencil Processor
Converts any photo into a print-ready tattoo stencil at 300 DPI.

Pipeline:
  1. Load + resize (maintain aspect, cap 3500 px long edge)
  2. Grayscale + CLAHE contrast enhancement
  3. Denoise
  4. Multi-pass edge detection (Canny + Sobel + Laplacian if cv2 available)
  5. Line weight / shading density tuning
  6. Morphological cleanup
  7. Invert -> black-on-white
  8. Export PNG (300 DPI) + PDF (letter-sized, centred)
"""

import sys, os, json, argparse, math
from pathlib import Path
from PIL import Image, ImageFilter, ImageEnhance, ImageOps, ImageDraw

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--input',  required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--line-weight',     default='medium',   choices=['thin','medium','bold'])
    p.add_argument('--shading-density', default='moderate', choices=['minimal','moderate','heavy'])
    p.add_argument('--line-complexity', default='medium',   choices=['simple','medium','complex'])
    p.add_argument('--subject',         default='general')
    return p.parse_args()


# (canny_low, canny_high, dilate_iter, blur_radius, threshold_offset)
PRESETS = {
    ('thin',   'minimal',  'simple'):  (60, 180, 0, 1, 20),
    ('thin',   'minimal',  'medium'):  (50, 160, 0, 1, 15),
    ('thin',   'minimal',  'complex'): (40, 140, 0, 1, 10),
    ('thin',   'moderate', 'simple'):  (50, 150, 1, 1, 15),
    ('thin',   'moderate', 'medium'):  (40, 130, 1, 1, 10),
    ('thin',   'moderate', 'complex'): (30, 110, 1, 1,  5),
    ('thin',   'heavy',    'simple'):  (40, 130, 1, 2, 10),
    ('thin',   'heavy',    'medium'):  (30, 110, 1, 2,  5),
    ('thin',   'heavy',    'complex'): (20,  90, 1, 2,  0),
    ('medium', 'minimal',  'simple'):  (60, 180, 1, 1, 20),
    ('medium', 'minimal',  'medium'):  (50, 160, 1, 1, 15),
    ('medium', 'minimal',  'complex'): (40, 140, 1, 1, 10),
    ('medium', 'moderate', 'simple'):  (50, 150, 2, 2, 15),
    ('medium', 'moderate', 'medium'):  (40, 130, 2, 2, 10),
    ('medium', 'moderate', 'complex'): (30, 110, 2, 2,  5),
    ('medium', 'heavy',    'simple'):  (40, 130, 2, 2, 10),
    ('medium', 'heavy',    'medium'):  (30, 110, 2, 2,  5),
    ('medium', 'heavy',    'complex'): (20,  90, 2, 2,  0),
    ('bold',   'minimal',  'simple'):  (50, 150, 2, 1, 15),
    ('bold',   'minimal',  'medium'):  (40, 130, 2, 1, 10),
    ('bold',   'minimal',  'complex'): (30, 110, 2, 1,  5),
    ('bold',   'moderate', 'simple'):  (40, 130, 3, 2, 10),
    ('bold',   'moderate', 'medium'):  (30, 110, 3, 2,  5),
    ('bold',   'moderate', 'complex'): (20,  90, 3, 2,  0),
    ('bold',   'heavy',    'simple'):  (35, 120, 3, 2,  5),
    ('bold',   'heavy',    'medium'):  (25, 100, 3, 2,  0),
    ('bold',   'heavy',    'complex'): (15,  80, 3, 3, -5),
}

def get_preset(lw, sd, lc):
    return PRESETS.get((lw, sd, lc), PRESETS[('medium','moderate','medium')])


def pil_stencil(img_pil, canny_low, canny_high, dilate_iter, blur_radius, threshold_offset):
    gray = img_pil.convert('L')
    gray = ImageOps.autocontrast(gray, cutoff=2)
    if blur_radius > 0:
        gray = gray.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    edges = gray.filter(ImageFilter.FIND_EDGES)
    edges = ImageEnhance.Contrast(edges).enhance(3.0)
    edges = ImageEnhance.Brightness(edges).enhance(1.5)
    threshold = max(20, min(200, 80 + threshold_offset))
    binary = edges.point(lambda x: 255 if x > threshold else 0)
    if dilate_iter > 0:
        for _ in range(dilate_iter):
            binary = binary.filter(ImageFilter.MaxFilter(3))
    enhanced = ImageEnhance.Contrast(gray).enhance(2.5)
    fine = enhanced.point(lambda x: 0 if x < 128 else 255)
    w, h = binary.size
    bp = list(binary.getdata())
    fp = list(fine.getdata())
    combined_pixels = []
    for b, f in zip(bp, fp):
        val = max(b, 255 - f) if f < 60 else b
        combined_pixels.append(min(255, val))
    combined = Image.new('L', (w, h))
    combined.putdata(combined_pixels)
    stencil = ImageOps.invert(combined)
    stencil = stencil.point(lambda x: 0 if x < 200 else 255)
    return stencil


def cv2_stencil(img_pil, canny_low, canny_high, dilate_iter, blur_radius, threshold_offset, subject):
    import cv2
    import numpy as np
    img = np.array(img_pil.convert('RGB'))
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    if subject in ('portrait', 'face', 'animal'):
        gray = cv2.bilateralFilter(gray, 9, 75, 75)
    else:
        if blur_radius > 0:
            ksize = blur_radius * 2 + 1
            gray = cv2.GaussianBlur(gray, (ksize, ksize), 0)
    canny = cv2.Canny(gray, canny_low, canny_high)
    sx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sy = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    sobel = np.uint8(np.clip(np.sqrt(sx**2 + sy**2), 0, 255))
    _, sobel_bin = cv2.threshold(sobel, canny_low + 20, 255, cv2.THRESH_BINARY)
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    lap = np.uint8(np.clip(np.abs(lap) * 2, 0, 255))
    _, lap_bin = cv2.threshold(lap, 15, 255, cv2.THRESH_BINARY)
    edges = cv2.bitwise_or(canny, sobel_bin)
    edges = cv2.bitwise_or(edges, lap_bin)
    adaptive = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=25,
        C=max(0, 8 - threshold_offset // 5)
    )
    combined = cv2.bitwise_or(edges, adaptive)
    kernel_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel_small)
    if dilate_iter > 0:
        kernel_dilate = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        combined = cv2.dilate(combined, kernel_dilate, iterations=dilate_iter)
    stencil = cv2.bitwise_not(combined)
    _, stencil = cv2.threshold(stencil, 200, 255, cv2.THRESH_BINARY)
    return Image.fromarray(stencil)


def main():
    args = parse_args()
    img = Image.open(args.input)
    if img.mode in ('RGBA', 'P', 'LA'):
        bg = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode in ('RGBA', 'LA'):
            bg.paste(img, mask=img.split()[-1])
        else:
            bg.paste(img)
        img = bg
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    max_px = 3500
    w, h = img.size
    if max(w, h) > max_px:
        scale = max_px / max(w, h)
        img = img.resize((int(w*scale), int(h*scale)), Image.LANCZOS)
    canny_low, canny_high, dilate_iter, blur_radius, threshold_offset = \
        get_preset(args.line_weight, args.shading_density, args.line_complexity)
    if HAS_CV2 and HAS_NUMPY:
        stencil = cv2_stencil(img, canny_low, canny_high, dilate_iter, blur_radius, threshold_offset, args.subject)
    else:
        stencil = pil_stencil(img, canny_low, canny_high, dilate_iter, blur_radius, threshold_offset)
    png_path = f"{args.output}.png"
    stencil.save(png_path, 'PNG', dpi=(300, 300))
    pdf_path = f"{args.output}.pdf"
    letter_w, letter_h = 2550, 3300
    sw, sh = stencil.size
    margin = 150
    max_sw = letter_w - margin * 2
    max_sh = letter_h - margin * 2
    scale = min(max_sw / sw, max_sh / sh, 1.0)
    new_sw = int(sw * scale)
    new_sh = int(sh * scale)
    scaled = stencil.resize((new_sw, new_sh), Image.LANCZOS)
    page = Image.new('RGB', (letter_w, letter_h), (255, 255, 255))
    ox = (letter_w - new_sw) // 2
    oy = (letter_h - new_sh) // 2
    page.paste(scaled.convert('RGB'), (ox, oy))
    try:
        from PIL import ImageFont
        font_size = 28
        try:
            font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', font_size)
        except Exception:
            font = ImageFont.load_default()
        draw = ImageDraw.Draw(page)
        footer = "tat.signaturediversified.com"
        draw.text((margin, letter_h - margin - font_size - 10), footer, fill=(180, 180, 180), font=font)
    except Exception:
        pass
    page.save(pdf_path, 'PDF', resolution=300)
    result = {
        'png': png_path,
        'pdf': pdf_path,
        'size': list(stencil.size),
        'engine': 'cv2' if HAS_CV2 else 'pil',
        'params': {
            'lineWeight': args.line_weight,
            'shadingDensity': args.shading_density,
            'lineComplexity': args.line_complexity,
            'subject': args.subject
        }
    }
    print(json.dumps(result))

if __name__ == '__main__':
    main()
