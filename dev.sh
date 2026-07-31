#!/usr/bin/env bash
#
# product-hub — run the backend (NestJS API) and frontend (Vite SPA) together.
#
#   ./dev.sh              start MongoDB (docker) + API + web app
#   SKIP_DB=1 ./dev.sh    skip docker; use an existing MongoDB on :27017
#   ADMIN=1 ./dev.sh      also start the platform console on :3003
#
# On first run it copies the .env examples and installs dependencies if missing.
# Ctrl+C stops everything cleanly.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
FRONTEND_ENV="$FRONTEND/.env"
COLLAB="$ROOT/collab"
ADMIN_APP="$ROOT/saas-admin"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
log()  { printf "${BLUE}[dev]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[dev] %s${NC}\n" "$*"; }

# ── Is collaborative doc editing switched on? ────────────────────────────
# The app only talks to the Yjs sync server when frontend's env sets
# VITE_COLLAB_URL. Empty (the default) means doc pages use the same Editor.js
# editor an issue's description uses — so there is nothing for the service to do,
# and no reason to install it, start it or hold the port.
collab_enabled() {
  grep -qE '^[[:space:]]*VITE_COLLAB_URL[[:space:]]*=[[:space:]]*[^[:space:]#]' "$FRONTEND_ENV" 2>/dev/null
}

# ── Is the platform console switched on? ─────────────────────────────────
# Opt-in with ADMIN=1. It's the vendor's own tenant-administration app, not part
# of the product a workspace user sees, so ordinary app work has no reason to
# pay for a third dev server — and it must never be reachable by accident.
admin_enabled() {
  [ "${ADMIN:-0}" = "1" ]
}

# ── Ensure .env files exist ──────────────────────────────────────────────
ensure_env() {
  if [ ! -f "$BACKEND/.env" ]; then
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    log "created backend/.env from example"
  fi
  if [ ! -f "$FRONTEND_ENV" ]; then
    cp "$FRONTEND/.env.example" "$FRONTEND_ENV"
    log "created frontend/.env from example"
  fi
  # The collab service follows the backend's per-environment config convention.
  # Only when it's switched on — see collab_enabled().
  if collab_enabled && [ ! -f "$COLLAB/config/.env.local" ]; then
    cp "$COLLAB/config/example.env.local" "$COLLAB/config/.env.local"
    log "created collab/config/.env.local from example"
  fi
  if admin_enabled && [ ! -f "$ADMIN_APP/.env" ]; then
    cp "$ADMIN_APP/.env.example" "$ADMIN_APP/.env"
    log "created saas-admin/.env from example"
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
  if collab_enabled && [ ! -d "$COLLAB/node_modules" ]; then
    log "installing collab dependencies (first run)…"
    ( cd "$COLLAB" && npm install )
  fi
  if admin_enabled && [ ! -d "$ADMIN_APP/node_modules" ]; then
    log "installing saas-admin dependencies (first run)…"
    ( cd "$ADMIN_APP" && npm install )
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
  for port in 3000 3001 3002 3003; do
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

if collab_enabled; then
  log "starting collab   → ws://localhost:3002"
  ( cd "$COLLAB" && exec npm run dev ) &
  PIDS+=($!)
fi

log "starting frontend → http://localhost:3001"
( cd "$FRONTEND" && exec npm run dev ) &
PIDS+=($!)

if admin_enabled; then
  log "starting console  → http://localhost:3003"
  ( cd "$ADMIN_APP" && exec npm run dev ) &
  PIDS+=($!)
fi

printf "\n${GREEN}▶ product-hub is running${NC}  (press Ctrl+C to stop everything)\n"
printf "  App   : http://localhost:3001\n"
printf "  API   : http://localhost:3000/v1\n"
printf "  Swagger: http://localhost:3000/swagger\n"
if collab_enabled; then
  printf "  Collab: ws://localhost:3002  (health: http://localhost:3002/health)\n"
fi
if admin_enabled; then
  printf "  Console: http://localhost:3003  (platform admins — npm run seed:platform)\n"
else
  printf "  (platform console: ADMIN=1 ./dev.sh → http://localhost:3003)\n"
fi
printf "\n"

# Wait for either process; if one exits, the EXIT trap tears down the other.
wait -n 2>/dev/null || wait
