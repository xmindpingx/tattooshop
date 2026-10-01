#!/bin/bash
# Downloads the neural nets (~270 MB) into ./models and creates the Python venv.
set -e
cd "$(dirname "$0")"
python3 -m venv venv && venv/bin/pip install -q -r requirements.txt
mkdir -p models && cd models
get() { [ -s "$2" ] || curl -sSL -o "$2" "$1"; }
get https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx isnet-general-use.onnx
get https://huggingface.co/x-Liola-x/informative-drawings-onnx/resolve/main/informative-drawings_contour_1024x1024.onnx contour-1024.onnx
get https://huggingface.co/Acly/MobileSAM/resolve/main/mobile_sam_image_encoder.onnx mobile_sam_image_encoder.onnx
get https://huggingface.co/Acly/MobileSAM/resolve/main/sam_mask_decoder_single.onnx sam_mask_decoder_single.onnx
ls -la
