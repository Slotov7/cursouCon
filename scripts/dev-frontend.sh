#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/home/slotov/.nvm/versions/node/v24.21.0/bin:$ROOT_DIR/node_modules/.bin:$PATH"
cd "$ROOT_DIR"
exec npm run dev
