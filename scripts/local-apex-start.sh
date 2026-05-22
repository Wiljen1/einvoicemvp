#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORDS_HOME="${ORDS_HOME:-$HOME/ords}"
ORDS_CONFIG="${ORDS_CONFIG:-$HOME/ords-config}"
APEX_IMAGES="${APEX_IMAGES:-$HOME/Downloads/apex-latest/apex/images}"
ORACLE_CONTAINER="${ORACLE_CONTAINER:-local-oracle-free}"
ORDS_PORT="${ORDS_PORT:-8181}"
CORP_PROXY_URL="${CORP_PROXY_URL:-http://tw-proxy-lhr.oraclecorp.com:80}"

export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"

if command -v colima >/dev/null 2>&1 && ! colima status >/dev/null 2>&1; then
  colima start \
    --cpu 4 \
    --memory 8 \
    --disk 60 \
    --env HTTP_PROXY="$CORP_PROXY_URL" \
    --env HTTPS_PROXY="$CORP_PROXY_URL" \
    --env http_proxy="$CORP_PROXY_URL" \
    --env https_proxy="$CORP_PROXY_URL" \
    --env NO_PROXY=localhost,127.0.0.1,::1,host.docker.internal \
    --env no_proxy=localhost,127.0.0.1,::1,host.docker.internal
fi

if ! docker ps -a --format '{{.Names}}' | grep -qx "$ORACLE_CONTAINER"; then
  echo "Oracle container '$ORACLE_CONTAINER' does not exist yet."
  echo "Run the local APEX install guide first: docs/local-apex-install.md"
  exit 1
fi

docker start "$ORACLE_CONTAINER" >/dev/null

for _ in {1..60}; do
  db_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$ORACLE_CONTAINER")"
  [ "$db_status" = "healthy" ] && break
  sleep 5
done

if curl --silent --fail --max-time 3 "http://127.0.0.1:${ORDS_PORT}/i/apex_version.txt" >/dev/null 2>&1; then
  echo "ORDS is already serving APEX on port ${ORDS_PORT}."
else
  screen -S local-ords -X quit >/dev/null 2>&1 || true
  screen -dmS local-ords zsh -lc "cd \"$ROOT_DIR\"; export PATH=\"/opt/homebrew/opt/openjdk@21/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:\$PATH\"; export JAVA_HOME=\"$JAVA_HOME\"; \"$ORDS_HOME/bin/ords\" --config \"$ORDS_CONFIG\" serve --port \"$ORDS_PORT\" --apex-images \"$APEX_IMAGES\" > /tmp/local-ords.log 2>&1"
fi

sleep 5

echo "Local APEX: http://127.0.0.1:${ORDS_PORT}/ords"
echo "APEX workspace sign-in: http://127.0.0.1:${ORDS_PORT}/ords/r/apex/workspace-sign-in/oracle-apex-sign-in"
