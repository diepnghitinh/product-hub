#!/usr/bin/env bash
#
# product-hub — run the backend (NestJS API) and frontend (Vite SPA) together.
#
#   ./dev.sh              start MongoDB (docker) + API + web app
#   SKIP_DB=1 ./dev.sh    skip docker; use an existing MongoDB on :27017
#
# On first run it copies the .env examples and installs dependencies if missing.
# Ctrl+C stops everything cleanly.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
log()  { printf "${BLUE}[dev]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[dev] %s${NC}\n" "$*"; }

# ── Ensure .env files exist ──────────────────────────────────────────────
ensure_env() {
  if [ ! -f "$BACKEND/.env" ]; then
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    log "created backend/.env from example"
  fi
  if [ ! -f "$FRONTEND/.env" ]; then
    cp "$FRONTEND/.env.example" "$FRONTEND/.env"
    log "created frontend/.env from example"
  fi
}

# ── Install dependencies on first run ────────────────────────────────────
ensure_deps() {
  if [ ! -d "$BACKEND/node_modules" ]; then
    log "installing backend dependencies (first run)…"
    ( cd "$BACKEND" && npm install )
  fi
  if [ ! -d "$FRONTEND/node_modules" ]; then
    log "installing frontend dependencies (first run)…"
    ( cd "$FRONTEND" && npm install )
  fi
}

# ── Start MongoDB via docker compose and wait until it accepts connections ───
start_db() {
  if ! command -v docker >/dev/null 2>&1; then
    warn "docker not found — assuming MongoDB is already running on localhost:27017"
    return
  fi
  log "starting MongoDB (docker compose)…"
  ( cd "$BACKEND" && docker compose up -d db ) || {
    warn "could not start MongoDB via docker — assuming an external one is available"
    return
  }
  log "waiting for MongoDB to be ready…"
  for _ in $(seq 1 30); do
    if docker exec producthub-mongo mongosh --quiet --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
      log "MongoDB is ready"
      return
    fi
    sleep 1
  done
  warn "MongoDB did not report ready in time — starting anyway"
}

# ── Clean shutdown ───────────────────────────────────────────────────────
PIDS=()

# Print a pid and all of its descendant pids (pre-order).
_tree() {
  local pid=$1 child
  echo "$pid"
  for child in $(pgrep -P "$pid" 2>/dev/null); do _tree "$child"; done
}

cleanup() {
  echo
  log "shutting down…"
  # Snapshot each job's whole tree first, then SIGKILL all at once — killing the
  # `node --watch` parent together with its child avoids the respawn race.
  local victims=()
  if [ "${#PIDS[@]}" -gt 0 ]; then
    for pid in "${PIDS[@]}"; do
      while read -r p; do victims+=("$p"); done < <(_tree "$pid")
    done
    if [ "${#victims[@]}" -gt 0 ]; then
      kill -9 "${victims[@]}" 2>/dev/null || true
    fi
  fi
  # Final sweep: free the ports no matter what.
  sleep 1
  for port in 3000 3001; do
    lsof -ti:"$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
  done
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# ── Go ───────────────────────────────────────────────────────────────────
ensure_env
ensure_deps
[ "${SKIP_DB:-0}" = "1" ] || start_db

log "starting backend  → http://localhost:3000/v1"
( cd "$BACKEND" && exec npm run start:dev ) &
PIDS+=($!)

log "starting frontend → http://localhost:3001"
( cd "$FRONTEND" && exec npm run dev ) &
PIDS+=($!)

printf "\n${GREEN}▶ product-hub is running${NC}  (press Ctrl+C to stop both)\n"
printf "  App : http://localhost:3001\n"
printf "  API : http://localhost:3000/v1\n"
printf "  Docs: http://localhost:3000/swagger\n\n"

# Wait for either process; if one exits, the EXIT trap tears down the other.
wait -n 2>/dev/null || wait
