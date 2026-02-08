#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.yml"
ENV_EXAMPLE="$ROOT_DIR/infra/.env.example"
ENV_FILE="$ROOT_DIR/infra/.env"
API_URL="http://localhost:4000"
WEB_URL="http://localhost:3000"

log() {
  printf '[orbstack-smoke] %s\n' "$*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "missing required command: $1"
    exit 1
  fi
}

wait_for_url() {
  local url="$1"
  local timeout_seconds="${2:-120}"
  local start
  start="$(date +%s)"

  while true; do
    if curl --silent --show-error --fail "$url" >/dev/null 2>&1; then
      return 0
    fi

    if [ $(( $(date +%s) - start )) -ge "$timeout_seconds" ]; then
      log "timed out waiting for $url"
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
require_cmd curl

if [ ! -f "$ENV_FILE" ]; then
  log "infra/.env missing; creating from infra/.env.example"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  log "created infra/.env; set secure secrets before production use"
fi

log "starting stack via docker compose"
docker compose -f "$COMPOSE_FILE" up --build -d

log "waiting for API health"
wait_for_url "$API_URL/health" 180

log "waiting for Web home"
wait_for_url "$WEB_URL" 180

AUTH_USERNAME="$(read_env_value AUTH_USERNAME "$ENV_FILE" || true)"
AUTH_PASSWORD="$(read_env_value AUTH_PASSWORD "$ENV_FILE" || true)"

if [ -n "$AUTH_USERNAME" ] && [ -n "$AUTH_PASSWORD" ]; then
  log "running auth login smoke check"
  LOGIN_RESPONSE="$(curl --silent --show-error --fail \
    -X POST "$API_URL/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"$AUTH_USERNAME\",\"password\":\"$AUTH_PASSWORD\",\"tenantSlug\":\"default\"}" || true)"

  if ! printf '%s' "$LOGIN_RESPONSE" | grep -q '"accessToken"'; then
    log "login smoke check failed"
    log "response: $LOGIN_RESPONSE"
    exit 1
  fi
else
  log "skipping auth login smoke check (AUTH_USERNAME/AUTH_PASSWORD not found in infra/.env)"
fi

RUNNING_SERVICES="$(docker compose -f "$COMPOSE_FILE" ps --services --status running)"
for required in api web worker postgres; do
  if ! printf '%s\n' "$RUNNING_SERVICES" | grep -qx "$required"; then
    log "required service is not running: $required"
    docker compose -f "$COMPOSE_FILE" ps
    exit 1
  fi
done

log "stack smoke check passed"
log "services:"
docker compose -f "$COMPOSE_FILE" ps
