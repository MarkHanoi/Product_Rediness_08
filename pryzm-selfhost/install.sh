#!/usr/bin/env bash
# pryzm-selfhost/install.sh — one-shot installer for Ubuntu / Debian / RHEL / Rocky.
#
# S67 D1 / D4 deliverable.  Source authority: PHASE-3D §S67 "Implementation Detail — install.sh"
# (base verbatim, with two additions: docker-compose v1/v2 detection, and a `docker compose build`
# pass before `up -d` so a fresh checkout works without ghcr.io published images — see ADR-0048 §B).
#
# Exit codes:
#   0   — stack healthy at http://localhost:3000.
#   1   — missing prerequisite (docker / docker-compose / openssl).
#   2   — secret generation failed.
#   3   — `docker compose build` failed.
#   4   — `docker compose up -d` failed.
#   5   — healthcheck timeout (300s default; override with HEALTHCHECK_TIMEOUT_SEC).
#
# Usage (from this directory):
#   ./install.sh                                  # build + up
#   SKIP_BUILD=1 ./install.sh                     # skip build (use ghcr.io images)
#   HEALTHCHECK_TIMEOUT_SEC=600 ./install.sh      # extend health-wait window

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

readonly HEALTHCHECK_TIMEOUT_SEC="${HEALTHCHECK_TIMEOUT_SEC:-300}"
readonly SKIP_BUILD="${SKIP_BUILD:-0}"

log() { printf "[install] %s\n" "$*"; }
err() { printf "[install:error] %s\n" "$*" >&2; }

# ── Detect docker compose v2 (preferred) vs docker-compose v1 (legacy). ─────
COMPOSE_CMD=""
detect_compose() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
  else
    err "Missing docker compose (v2) or docker-compose (v1).  Install Docker 20.10+ with Compose plugin."
    exit 1
  fi
  log "Using compose: ${COMPOSE_CMD}"
}

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Missing prerequisite: $1"
    exit 1
  fi
}

# ── Prereqs. ────────────────────────────────────────────────────────────────
require docker
require openssl
detect_compose

# ── Secrets generation (idempotent — only generates if missing). ────────────
mkdir -p .secrets
if [ ! -s .secrets/postgres_password ]; then
  log "Generating Postgres password..."
  openssl rand -hex 24 > .secrets/postgres_password || { err "openssl failed"; exit 2; }
fi
if [ ! -s .secrets/minio_password ]; then
  log "Generating MinIO password..."
  openssl rand -hex 24 > .secrets/minio_password || { err "openssl failed"; exit 2; }
fi
chmod 600 .secrets/postgres_password .secrets/minio_password

# ── .env scaffold. ──────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    log "Creating .env from .env.example"
    cp .env.example .env
  else
    err "Missing .env.example — refusing to proceed without env scaffold."
    exit 1
  fi
fi

# ── Build images (skipped if SKIP_BUILD=1). ─────────────────────────────────
if [ "${SKIP_BUILD}" != "1" ]; then
  log "Building images (this can take 5-15 min on first run)..."
  if ! ${COMPOSE_CMD} build --pull; then
    err "Image build failed.  Re-run with SKIP_BUILD=1 to use published images instead."
    exit 3
  fi
fi

# ── Bring up the stack. ─────────────────────────────────────────────────────
log "Starting stack..."
if ! ${COMPOSE_CMD} up -d; then
  err "docker compose up failed."
  exit 4
fi

# ── Wait for all services to report healthy. ────────────────────────────────
log "Waiting for healthchecks (max ${HEALTHCHECK_TIMEOUT_SEC}s)..."
start_ts=$(date +%s)
deadline=$((start_ts + HEALTHCHECK_TIMEOUT_SEC))

while true; do
  now=$(date +%s)
  if [ "${now}" -ge "${deadline}" ]; then
    err "Healthcheck timeout after ${HEALTHCHECK_TIMEOUT_SEC}s.  Inspect: ${COMPOSE_CMD} ps && ${COMPOSE_CMD} logs"
    exit 5
  fi
  # Treat "running" without "starting" as ready when no health is declared,
  # otherwise require all healthchecks green.
  status_lines=$(${COMPOSE_CMD} ps --format '{{.Service}} {{.Status}}' || true)
  unhealthy=$(printf "%s\n" "${status_lines}" | grep -E "(starting|unhealthy)" || true)
  if [ -z "${unhealthy}" ] && [ -n "${status_lines}" ]; then
    break
  fi
  sleep 3
done

elapsed=$(( $(date +%s) - start_ts ))
log "All services healthy after ${elapsed}s."

cat <<EOF

PRYZM is live at:    http://localhost:3000
MinIO console at:    http://localhost:9001  (login: pryzm / cat .secrets/minio_password)

Next steps:
  - Tail logs:       ${COMPOSE_CMD} logs -f
  - Stop:            ${COMPOSE_CMD} down
  - Stop + wipe:     ${COMPOSE_CMD} down -v   (DESTRUCTIVE: deletes Postgres + MinIO volumes)
  - First admin:     see docs.pryzm.com/selfhost/getting-started

EOF
