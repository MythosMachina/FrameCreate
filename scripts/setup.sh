#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"
SYSTEMD_DIR="/etc/systemd/system"
SUDO=""

if [ "${EUID}" -ne 0 ]; then
  SUDO="sudo"
fi

log() {
  printf "\n==> %s\n" "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf "Missing dependency: %s\n" "$1" >&2
    exit 1
  fi
}

get_env_value() {
  local key="$1"
  if [ -f "$ENV_FILE" ]; then
    grep -E "^${key}=" "$ENV_FILE" | tail -n1 | cut -d= -f2-
  fi
}

require_cmd node
require_cmd npm
require_cmd python3

log "Creating storage folders"
mkdir -p "${ROOT_DIR}/storage/models" \
  "${ROOT_DIR}/storage/loras" \
  "${ROOT_DIR}/storage/embeddings" \
  "${ROOT_DIR}/storage/outputs" \
  "${ROOT_DIR}/storage/thumbnails" \
  "${ROOT_DIR}/storage/wildcards"

log "Preparing .env"
DB_URL="${FRAMECREATE_DATABASE_URL:-$(get_env_value FRAMECREATE_DATABASE_URL)}"
if [ -z "${DB_URL}" ]; then
  DB_URL="postgres://${USER}@127.0.0.1:5432/framecreate"
fi

API_PORT="${FRAMECREATE_PORT:-$(get_env_value FRAMECREATE_PORT)}"
WORKER_PORT="${FRAMECREATE_WORKER_PORT:-$(get_env_value FRAMECREATE_WORKER_PORT)}"
INDEXER_PORT="${FRAMECREATE_INDEXER_PORT:-$(get_env_value FRAMECREATE_INDEXER_PORT)}"
UI_PORT="${FRAMECREATE_UI_PORT:-$(get_env_value FRAMECREATE_UI_PORT)}"
CONCURRENCY="${FRAMECREATE_CONCURRENCY:-$(get_env_value FRAMECREATE_CONCURRENCY)}"
RUNTIME="${FRAMECREATE_RUNTIME:-$(get_env_value FRAMECREATE_RUNTIME)}"
PYTHON_MODE="${FRAMECREATE_PYTHON_MODE:-$(get_env_value FRAMECREATE_PYTHON_MODE)}"
PYTHON_BIN="${FRAMECREATE_PYTHON_BIN:-$(get_env_value FRAMECREATE_PYTHON_BIN)}"

API_PORT="${API_PORT:-4100}"
WORKER_PORT="${WORKER_PORT:-4200}"
INDEXER_PORT="${INDEXER_PORT:-4300}"
UI_PORT="${UI_PORT:-5174}"
CONCURRENCY="${CONCURRENCY:-1}"
RUNTIME="${RUNTIME:-python}"
PYTHON_MODE="${PYTHON_MODE:-server}"
PYTHON_BIN="${PYTHON_BIN:-services/worker/runtime/.venv/bin/python}"

cat > "$ENV_FILE" <<EOF
FRAMECREATE_DATABASE_URL=${DB_URL}
FRAMECREATE_ROOT=.
FRAMECREATE_PORT=${API_PORT}
FRAMECREATE_WORKER_PORT=${WORKER_PORT}
FRAMECREATE_INDEXER_PORT=${INDEXER_PORT}
FRAMECREATE_UI_PORT=${UI_PORT}
FRAMECREATE_WORKER_URL=http://127.0.0.1:${WORKER_PORT}
FRAMECREATE_INDEXER_URL=http://127.0.0.1:${INDEXER_PORT}
FRAMECREATE_CONCURRENCY=${CONCURRENCY}
FRAMECREATE_RUNTIME=${RUNTIME}
FRAMECREATE_PYTHON_MODE=${PYTHON_MODE}
FRAMECREATE_PYTHON_BIN=${PYTHON_BIN}
EOF

log "Installing npm dependencies"
cd "$ROOT_DIR"
npm install

log "Setting up Python runtime"
if command -v nvidia-smi >/dev/null 2>&1; then
  bash "${ROOT_DIR}/services/worker/runtime/setup_venv_cuda.sh"
else
  bash "${ROOT_DIR}/services/worker/runtime/setup_venv.sh"
fi

log "Creating database (best-effort)"
if command -v psql >/dev/null 2>&1; then
  read -r DB_NAME ADMIN_DB_URL < <(python3 - <<'PY' "${DB_URL}"
import sys
from urllib.parse import urlparse

db_url = sys.argv[1]
parsed = urlparse(db_url)
dbname = parsed.path.lstrip("/") or "framecreate"
admin_db = parsed._replace(path="/postgres").geturl()
print(f"{dbname} {admin_db}")
PY
  )
  if [ -n "${ADMIN_DB_URL:-}" ]; then
    psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "create database ${DB_NAME}" >/dev/null 2>&1 || true
  fi
fi

log "Running migrations"
set -a
source "$ENV_FILE"
set +a
npm run migrate -w @framecreate/api

log "Building services"
npm run build

log "Installing systemd units"
${SUDO} tee "${SYSTEMD_DIR}/framecreate-api.service" >/dev/null <<EOF
[Unit]
Description=FrameCreate API
After=network.target

[Service]
Type=simple
WorkingDirectory=${ROOT_DIR}
Environment=NODE_ENV=production
EnvironmentFile=${ROOT_DIR}/.env
ExecStart=/usr/bin/env npm run -w @framecreate/api start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

${SUDO} tee "${SYSTEMD_DIR}/framecreate-worker.service" >/dev/null <<EOF
[Unit]
Description=FrameCreate Worker
After=network.target

[Service]
Type=simple
WorkingDirectory=${ROOT_DIR}
Environment=NODE_ENV=production
EnvironmentFile=${ROOT_DIR}/.env
ExecStart=/usr/bin/env npm run -w @framecreate/worker start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

${SUDO} tee "${SYSTEMD_DIR}/framecreate-indexer.service" >/dev/null <<EOF
[Unit]
Description=FrameCreate Indexer
After=network.target

[Service]
Type=simple
WorkingDirectory=${ROOT_DIR}
Environment=NODE_ENV=production
EnvironmentFile=${ROOT_DIR}/.env
ExecStart=/usr/bin/env npm run -w @framecreate/indexer start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

${SUDO} tee "${SYSTEMD_DIR}/framecreate-ui.service" >/dev/null <<EOF
[Unit]
Description=FrameCreate UI
After=network.target

[Service]
Type=simple
WorkingDirectory=${ROOT_DIR}
Environment=NODE_ENV=production
EnvironmentFile=${ROOT_DIR}/.env
ExecStart=/usr/bin/env npm run -w @framecreate/ui preview -- --host 0.0.0.0 --port ${UI_PORT}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

${SUDO} tee "${SYSTEMD_DIR}/framecreate.target" >/dev/null <<EOF
[Unit]
Description=FrameCreate stack
Requires=framecreate-api.service framecreate-worker.service framecreate-indexer.service framecreate-ui.service
After=framecreate-api.service framecreate-worker.service framecreate-indexer.service framecreate-ui.service

[Install]
WantedBy=multi-user.target
EOF

log "Enabling services"
${SUDO} systemctl daemon-reload
${SUDO} systemctl enable --now framecreate.target

log "Setup complete"
