#!/usr/bin/env bash
set -euo pipefail

APEX_HOME="${APEX_HOME:-$HOME/Downloads/apex-latest/apex}"
LOCAL_API_URL="${LOCAL_API_URL:-http://127.0.0.1:8010/api/status}"

ok() {
  printf "OK       %s\n" "$1"
}

warn() {
  printf "MISSING  %s\n" "$1"
}

info() {
  printf "INFO     %s\n" "$1"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

echo "Local Oracle APEX readiness check"
echo

if [ -d "$APEX_HOME" ]; then
  ok "APEX bundle found: $APEX_HOME"
else
  warn "APEX bundle not found: $APEX_HOME"
fi

for file in apexins.sql apxsilentins.sql apex_rest_config.sql apxchpwd.sql; do
  if [ -f "$APEX_HOME/$file" ]; then
    ok "APEX installer file found: $file"
  else
    warn "APEX installer file missing: $file"
  fi
done

if [ -f "$APEX_HOME/images/apex_version.txt" ]; then
  ok "$(tr -d '\r' < "$APEX_HOME/images/apex_version.txt")"
else
  warn "APEX version file missing: $APEX_HOME/images/apex_version.txt"
fi

if [ -d "$APEX_HOME/images" ]; then
  ok "APEX static images found: $APEX_HOME/images"
else
  warn "APEX static images folder missing"
fi

echo
info "Host architecture: $(uname -m)"

if has_cmd brew; then
  ok "Homebrew is available: $(command -v brew)"
else
  warn "Homebrew is not available"
fi

if has_cmd colima; then
  ok "Colima is available: $(command -v colima)"
  if colima status >/dev/null 2>&1; then
    ok "Colima is running"
  else
    warn "Colima is installed but not running"
  fi
else
  warn "Colima is not available"
fi

if has_cmd docker; then
  ok "Docker CLI is available: $(command -v docker)"
  if docker info >/dev/null 2>&1; then
    ok "Docker daemon is reachable"
  else
    warn "Docker daemon is not reachable"
  fi
else
  warn "Docker CLI is not available"
fi

JAVA_CANDIDATE="${JAVA_CANDIDATE:-}"
if has_cmd java; then
  JAVA_CANDIDATE="$(command -v java)"
elif [ -x /opt/homebrew/opt/openjdk@21/bin/java ]; then
  JAVA_CANDIDATE="/opt/homebrew/opt/openjdk@21/bin/java"
fi

if [ -n "$JAVA_CANDIDATE" ]; then
  if ! "$JAVA_CANDIDATE" -version >/tmp/local-apex-java-version.txt 2>&1 && [ -x /opt/homebrew/opt/openjdk@21/bin/java ]; then
    JAVA_CANDIDATE="/opt/homebrew/opt/openjdk@21/bin/java"
  fi

  if "$JAVA_CANDIDATE" -version >/tmp/local-apex-java-version.txt 2>&1; then
    ok "Java runtime works: $(head -1 /tmp/local-apex-java-version.txt)"
  else
    warn "java command exists, but no usable Java runtime is configured"
  fi
else
  warn "Java runtime is not available"
fi

if has_cmd sql; then
  ok "SQLcl is available: $(command -v sql)"
else
  warn "SQLcl command 'sql' is not available"
fi

if has_cmd sqlplus; then
  ok "SQL*Plus is available: $(command -v sqlplus)"
elif docker exec local-oracle-free bash -lc 'command -v sqlplus' >/dev/null 2>&1; then
  ok "SQL*Plus is available inside the Oracle container"
else
  warn "SQL*Plus command 'sqlplus' is not available"
fi

if has_cmd ords; then
  ok "ORDS is available: $(command -v ords)"
elif [ -x $HOME/ords/bin/ords ]; then
  ok "ORDS is available: $HOME/ords/bin/ords"
else
  warn "ORDS command 'ords' is not available"
fi

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx local-oracle-free; then
  ok "Oracle Database container is running: local-oracle-free"
elif docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx local-oracle-free; then
  warn "Oracle Database container exists but is not running: local-oracle-free"
else
  warn "Oracle Database container does not exist: local-oracle-free"
fi

echo
if curl --silent --fail --max-time 5 "$LOCAL_API_URL" >/tmp/local-apex-api-status.json 2>/dev/null; then
  ok "Deprecated local middleware is reachable: $LOCAL_API_URL"
else
  info "Deprecated local middleware is not running: $LOCAL_API_URL"
fi

echo
info "Next guide: docs/local-apex-desktop.md"
