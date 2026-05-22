#!/usr/bin/env bash
set -euo pipefail

ORACLE_CONTAINER="${ORACLE_CONTAINER:-local-oracle-free}"
ORDS_PORT="${ORDS_PORT:-8181}"

screen -S local-ords -X quit >/dev/null 2>&1 || true
lsof -tiTCP:"$ORDS_PORT" -sTCP:LISTEN | xargs -r kill

if docker ps --format '{{.Names}}' | grep -qx "$ORACLE_CONTAINER"; then
  docker stop "$ORACLE_CONTAINER" >/dev/null
fi

echo "Stopped local APEX services."
