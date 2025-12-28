#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_DIR="${ROOT_DIR}/services/worker/runtime/.venv"

python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install diffusers transformers accelerate safetensors peft

printf "\nPython runtime ready in %s\n" "$VENV_DIR"
