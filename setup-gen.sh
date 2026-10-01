#!/usr/bin/env bash
# Optional AI-redraw engine: SDXL + tattoo LoRA + canny ControlNet on an AMD GPU (ROCm). ~15 GB total.
set -e
cd "$(dirname "$0")"
python3 -m venv venv-gen
venv-gen/bin/pip install -q --upgrade pip
venv-gen/bin/pip install -q torch==2.9.1 torchvision --index-url https://download.pytorch.org/whl/rocm6.4
venv-gen/bin/pip install -q diffusers transformers accelerate safetensors peft huggingface_hub opencv-python-headless pillow numpy sentencepiece protobuf
venv-gen/bin/python - <<'PY'
from huggingface_hub import snapshot_download
D = 'models/gen'
snapshot_download('stabilityai/stable-diffusion-xl-base-1.0', local_dir=D + '/sdxl', allow_patterns=[
    'model_index.json', 'scheduler/*', 'tokenizer/*', 'tokenizer_2/*', 'text_encoder/config.json', 'text_encoder_2/config.json',
    'text_encoder/model.fp16.safetensors', 'text_encoder_2/model.fp16.safetensors',
    'unet/config.json', 'unet/diffusion_pytorch_model.fp16.safetensors', 'vae/config.json', 'vae/diffusion_pytorch_model.fp16.safetensors'])
snapshot_download('diffusers/controlnet-canny-sdxl-1.0', local_dir=D + '/controlnet-canny', allow_patterns=['config.json', 'diffusion_pytorch_model.fp16.safetensors'])
snapshot_download('Norod78/yet-another-sdxl-tattoo-lora', local_dir=D + '/tattoo-lora')
print('MODELS DONE')
PY
