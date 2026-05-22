#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

node -e "require('node:sqlite'); console.log('Node local API prerequisites OK')"

if [[ ! -d node_modules ]]; then
  npm install
fi

echo "Local API uses the existing Node workspace dependencies; no Python packages are required."
