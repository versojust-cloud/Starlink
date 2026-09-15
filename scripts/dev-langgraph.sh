#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PIDS=()

start_process() {
  local name=$1
  shift
  echo "→ ${name}"
  "$@" &
  PIDS+=("$!")
}

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT INT TERM

if [[ -n "${COMFYUI_DIR:-}" ]]; then
  if [[ -f "${COMFYUI_DIR}/main.py" ]]; then
    COMFYUI_CMD=${COMFYUI_CMD:-python main.py}
    echo "→ ComfyUI (${COMFYUI_DIR})"
    (cd "${COMFYUI_DIR}" && ${COMFYUI_CMD}) &
    PIDS+=("$!")
  else
    echo "! COMFYUI_DIR 未找到 main.py，已跳过 ComfyUI"
  fi
else
  echo "! COMFYUI_DIR 未设置，已跳过 ComfyUI"
fi

cd "${ROOT_DIR}"
start_process "GraphQL Server" pnpm dev:server
start_process "Web Frontend" pnpm dev:web

echo "All services running. Press Ctrl+C to stop."
wait
