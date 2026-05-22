#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORDS_PORT="${ORDS_PORT:-8181}"
APEX_URL="${APEX_URL:-http://127.0.0.1:${ORDS_PORT}/ords/r/apex/workspace-sign-in/oracle-apex-sign-in}"

"$ROOT_DIR/scripts/local-apex-start.sh" >/tmp/local-apex-start.log 2>&1

for _ in {1..30}; do
  if curl --silent --fail --max-time 3 "http://127.0.0.1:${ORDS_PORT}/i/apex_version.txt" >/dev/null; then
    break
  fi
  sleep 2
done

if [ -d "/Applications/Google Chrome.app" ]; then
  open -na "Google Chrome" --args --app="$APEX_URL"
else
  open "$APEX_URL"
fi

echo "Opened local Oracle APEX: $APEX_URL"
