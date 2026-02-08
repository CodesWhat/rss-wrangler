#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.yml"
ENV_EXAMPLE="$ROOT_DIR/infra/.env.example"
ENV_FILE="$ROOT_DIR/infra/.env"
COMPOSE_ARGS=(-f "$COMPOSE_FILE" --env-file "$ENV_FILE")

log() {
  printf '[orbstack-smoke] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "missing required command: $1"
    exit 1
  fi
}

wait_for_service_url() {
  local service="$1"
  local url="$2"
  local timeout_seconds="${3:-120}"
  local start
  start="$(date +%s)"

  while true; do
    if docker compose "${COMPOSE_ARGS[@]}" exec -T "$service" \
      node -e "fetch(process.argv[1]).then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))" \
      "$url" >/dev/null 2>&1; then
      return 0
    fi

    if [ $(( $(date +%s) - start )) -ge "$timeout_seconds" ]; then
      log "timed out waiting for $service to serve $url"
      return 1
    fi

    sleep 2
  done
}

read_env_value() {
  local key="$1"
  local file="$2"

  if [ ! -f "$file" ]; then
    return 1
  fi

  local line
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  if [ -z "$line" ]; then
    return 1
  fi

  printf '%s' "${line#*=}" | tr -d '\r'
}

require_cmd docker

if [ ! -f "$ENV_FILE" ]; then
  log "infra/.env missing; creating from infra/.env.example"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  log "created infra/.env; set secure secrets before production use"
fi

log "starting stack via docker compose"
docker compose "${COMPOSE_ARGS[@]}" up --build -d

log "waiting for API health"
wait_for_service_url api "http://127.0.0.1:4000/health" 180

log "waiting for Web home"
wait_for_service_url web "http://127.0.0.1:3000" 180

AUTH_USERNAME="$(read_env_value AUTH_USERNAME "$ENV_FILE" || true)"
AUTH_PASSWORD="$(read_env_value AUTH_PASSWORD "$ENV_FILE" || true)"

if [ -n "$AUTH_USERNAME" ] && [ -n "$AUTH_PASSWORD" ]; then
  log "running auth login smoke check"
  if ! docker compose "${COMPOSE_ARGS[@]}" exec -T api node <<'NODE'
const username = process.env.AUTH_USERNAME ?? "";
const password = process.env.AUTH_PASSWORD ?? "";

async function main() {
  try {
    const res = await fetch("http://127.0.0.1:4000/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        tenantSlug: "default"
      })
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[orbstack-smoke] login HTTP ${res.status}: ${text}`);
      process.exit(1);
    }

    const payload = await res.json();
    if (!payload || typeof payload.accessToken !== "string" || payload.accessToken.length === 0) {
      console.error("[orbstack-smoke] login response missing accessToken");
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[orbstack-smoke] login request failed: ${message}`);
    process.exit(1);
  }
}

main();
NODE
  then
    log "login smoke check failed"
    exit 1
  fi
else
  log "skipping auth login smoke check (AUTH_USERNAME/AUTH_PASSWORD not found in infra/.env)"
fi

RUNNING_SERVICES="$(docker compose "${COMPOSE_ARGS[@]}" ps --services --status running)"
for required in api web worker postgres; do
  if ! printf '%s\n' "$RUNNING_SERVICES" | grep -qx "$required"; then
    log "required service is not running: $required"
    docker compose "${COMPOSE_ARGS[@]}" ps
    exit 1
  fi
done

log "stack smoke check passed"
log "services:"
docker compose "${COMPOSE_ARGS[@]}" ps

WEB_CONTAINER_NAME="$(docker compose "${COMPOSE_ARGS[@]}" ps -q web || true)"
API_CONTAINER_NAME="$(docker compose "${COMPOSE_ARGS[@]}" ps -q api || true)"

if [ -n "$WEB_CONTAINER_NAME" ]; then
  WEB_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$WEB_CONTAINER_NAME" 2>/dev/null || true)"
  if [ -n "$WEB_IP" ]; then
    log "web direct URL: http://$WEB_IP:3000"
  fi
fi

if [ -n "$API_CONTAINER_NAME" ]; then
  API_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$API_CONTAINER_NAME" 2>/dev/null || true)"
  if [ -n "$API_IP" ]; then
    log "api direct URL: http://$API_IP:4000"
  fi
fi
