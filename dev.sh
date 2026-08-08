#!/usr/bin/env bash
#
# product-hub — run the backend (NestJS API) and frontend (Vite SPA) together.
#
#   ./dev.sh                start MongoDB (docker) + API + web app
#   SKIP_DB=1 ./dev.sh      skip docker; use an existing MongoDB on :27017
#   ADMIN=1 ./dev.sh        also start the platform console on :3003
#   API_PORT=4000 ./dev.sh  pin a port yourself (API_PORT/WEB_PORT/COLLAB_PORT/ADMIN_PORT)
#
# Every port is checked before anything starts: a service whose usual port is
# busy gets a free random one instead, and the others are wired to match — see
# "Ports" below.
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

# ── Ports ────────────────────────────────────────────────────────────────
# Each service prefers the port it is configured for, but something is often
# already sitting there: a previous run that didn't shut down, another project,
# a stray `npm run dev`. Left alone that fails in two different ways — the API
# dies with EADDRINUSE, while Vite quietly slides to the next free number and
# so drops out of the API's CORS allowlist, which reads as "the app loads but
# every request fails".
#
# So we hand each service a port we have just checked is free, picking a random
# one when the preferred is taken, and wire the services to each other from
# these values. Only what actually MOVED is overridden — with the usual ports
# free, dev.sh passes no URLs and the .env files stay the single source of
# truth.
PORT_RANGE_START=3100   # random ports land in 3100–3999: still obviously "a dev
PORT_RANGE_SIZE=900     # server", and clear of the ephemeral range macOS uses.

# Ports handed out during this run. Checked alongside the OS so two services
# can't be given the same free port.
CLAIMED=''

port_busy() {
  if command -v lsof >/dev/null 2>&1; then
    [ -n "$(lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null)" ]
  else
    # No lsof — ask the kernel instead: if the connection opens, someone's there.
    (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
  fi
}

port_taken() {
  case " $CLAIMED " in *" $1 "*) return 0 ;; esac
  port_busy "$1"
}

# pick_port <preferred> <label> → sets PICKED, and PICKED_MOVED=1 if it had to
# go elsewhere (the caller uses that to decide what needs re-wiring).
PICKED=''
PICKED_MOVED=0
pick_port() {
  local preferred=$1 label=$2 candidate tries=0
  PICKED_MOVED=0
  if ! port_taken "$preferred"; then
    PICKED=$preferred
    CLAIMED="$CLAIMED $preferred"
    return
  fi
  while [ "$tries" -lt 100 ]; do
    candidate=$(( PORT_RANGE_START + RANDOM % PORT_RANGE_SIZE ))
    if ! port_taken "$candidate"; then
      PICKED=$candidate
      PICKED_MOVED=1
      CLAIMED="$CLAIMED $candidate"
      warn "port $preferred is busy — $label moved to $candidate"
      return
    fi
    tries=$(( tries + 1 ))
  done
  PICKED=$preferred
  CLAIMED="$CLAIMED $preferred"
  warn "no free port found for $label — trying $preferred anyway"
}

# Read KEY out of a per-environment config file, so the port we prefer is the
# one that service is actually configured to use. dev.sh never sets NODE_ENV,
# so the file the API and collab load is always the `local` one.
env_value() { # env_value <file> <KEY> <fallback>
  local value=''
  if [ -f "$1" ]; then
    value=$(sed -n "s/^[[:space:]]*$2[[:space:]]*=[[:space:]]*//p" "$1" \
      | tail -1 | tr -d "\"'" | tr -d '[:space:]')
  fi
  echo "${value:-$3}"
}

# Same idea for the two Vite apps, whose port lives in vite.config.ts.
vite_port() { # vite_port <vite.config.ts> <fallback>
  local value=''
  if [ -f "$1" ]; then
    value=$(sed -n 's/^[[:space:]]*port:[[:space:]]*\([0-9]\{2,5\}\).*/\1/p' "$1" | head -1)
  fi
  echo "${value:-$2}"
}

# The browser origins the API and collab must accept. Ours first, then whatever
# the config file already listed — appending rather than replacing means a
# hand-added origin (an ngrok URL, a `*`) is never silently dropped.
origins_for() { # origins_for <config file>
  local ours="http://localhost:$WEB_PORT,http://127.0.0.1:$WEB_PORT" configured
  if admin_enabled; then
    ours="$ours,http://localhost:$ADMIN_PORT,http://127.0.0.1:$ADMIN_PORT"
  fi
  configured=$(env_value "$1" ALLOWED_ORIGINS '')
  if [ -n "$configured" ]; then ours="$ours,$configured"; fi
  echo "$ours"
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
  # Final sweep: free the ports no matter what. Only the ones this run claimed —
  # every one of them was verified free before we took it, so nothing here can
  # belong to somebody else's process.
  sleep 1
  for port in $CLAIMED; do
    lsof -ti:"$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
  done
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# ── Go ───────────────────────────────────────────────────────────────────
ensure_env
ensure_deps

# Claim every port up front, before a single service starts — the API's CORS
# allowlist has to name the app's final port, and the app has to be handed the
# API's, so neither can be started until both are known.
COLLAB_PORT="${COLLAB_PORT:-}"; COLLAB_MOVED=0
ADMIN_PORT="${ADMIN_PORT:-}"

pick_port "${API_PORT:-$(env_value "$BACKEND/config/.env.local" PORT 3000)}" "the API"
API_PORT=$PICKED; API_MOVED=$PICKED_MOVED

pick_port "${WEB_PORT:-$(vite_port "$FRONTEND/vite.config.ts" 3001)}" "the app"
WEB_PORT=$PICKED; WEB_MOVED=$PICKED_MOVED

if collab_enabled; then
  pick_port "${COLLAB_PORT:-$(env_value "$COLLAB/config/.env.local" PORT 3002)}" "collab"
  COLLAB_PORT=$PICKED; COLLAB_MOVED=$PICKED_MOVED
fi

if admin_enabled; then
  pick_port "${ADMIN_PORT:-$(vite_port "$ADMIN_APP/vite.config.ts" 3003)}" "the console"
  ADMIN_PORT=$PICKED
fi

[ "${SKIP_DB:-0}" = "1" ] || start_db

# The API: its own port, plus the origins the browser will actually call from.
BACKEND_ENV=(PORT="$API_PORT" ALLOWED_ORIGINS="$(origins_for "$BACKEND/config/.env.local")")
# Links the API builds into webhooks and MCP replies default to :3001. If the
# config file doesn't pin one, point them at the app that is really running.
if [ -z "$(env_value "$BACKEND/config/.env.local" APP_BASE_URL '')" ]; then
  BACKEND_ENV+=(APP_BASE_URL="http://localhost:$WEB_PORT")
fi
log "starting backend  → http://localhost:$API_PORT/v1"
( cd "$BACKEND" && exec env "${BACKEND_ENV[@]}" npm run start:dev ) &
PIDS+=($!)

if collab_enabled; then
  COLLAB_ENV=(PORT="$COLLAB_PORT" ALLOWED_ORIGINS="$(origins_for "$COLLAB/config/.env.local")")
  log "starting collab   → ws://localhost:$COLLAB_PORT"
  ( cd "$COLLAB" && exec env "${COLLAB_ENV[@]}" npm run dev ) &
  PIDS+=($!)
fi

# --strictPort so Vite can't quietly pick a different port than the one the API
# was just told to trust: better a loud restart than a board that won't load.
WEB_ENV=()
if [ "$API_MOVED" = 1 ]; then WEB_ENV+=(VITE_API_URL="http://localhost:$API_PORT/v1"); fi
if [ "$COLLAB_MOVED" = 1 ]; then WEB_ENV+=(VITE_COLLAB_URL="ws://localhost:$COLLAB_PORT"); fi
log "starting frontend → http://localhost:$WEB_PORT"
( cd "$FRONTEND" && exec env ${WEB_ENV[@]+"${WEB_ENV[@]}"} npm run dev -- --port "$WEB_PORT" --strictPort ) &
PIDS+=($!)

if admin_enabled; then
  ADMIN_ENV=()
  if [ "$API_MOVED" = 1 ]; then ADMIN_ENV+=(VITE_API_URL="http://localhost:$API_PORT/v1"); fi
  if [ "$WEB_MOVED" = 1 ]; then ADMIN_ENV+=(VITE_APP_URL="http://localhost:$WEB_PORT"); fi
  log "starting console  → http://localhost:$ADMIN_PORT"
  ( cd "$ADMIN_APP" && exec env ${ADMIN_ENV[@]+"${ADMIN_ENV[@]}"} npm run dev -- --port "$ADMIN_PORT" --strictPort ) &
  PIDS+=($!)
fi

printf "\n${GREEN}▶ product-hub is running${NC}  (press Ctrl+C to stop everything)\n"
printf "  App   : http://localhost:%s\n" "$WEB_PORT"
printf "  API   : http://localhost:%s/v1\n" "$API_PORT"
printf "  Swagger: http://localhost:%s/swagger\n" "$API_PORT"
if collab_enabled; then
  printf "  Collab: ws://localhost:%s  (health: http://localhost:%s/health)\n" "$COLLAB_PORT" "$COLLAB_PORT"
fi
if admin_enabled; then
  printf "  Console: http://localhost:%s  (platform admins — npm run seed:platform)\n" "$ADMIN_PORT"
else
  printf "  (platform console: ADMIN=1 ./dev.sh → http://localhost:3003)\n"
fi
printf "\n"

# Wait for either process; if one exits, the EXIT trap tears down the other.
wait -n 2>/dev/null || wait
