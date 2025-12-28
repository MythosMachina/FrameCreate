#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="${ROOT_DIR}/services/worker/runtime/.venv"

if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

pip install --upgrade pip
pip install --upgrade torch --index-url https://download.pytorch.org/whl/cu121
pip install diffusers transformers accelerate safetensors peft

printf "\nPython CUDA runtime ready in %s\n" "$VENV_DIR"
