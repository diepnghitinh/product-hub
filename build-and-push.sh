#!/usr/bin/env bash
#
# build-and-push.sh — build the product-hub images and push them to a registry.
#
#   REGISTRY=<host>/<repo> ./build-and-push.sh                    # all four images (one tag each)
#   REGISTRY=<host>/<repo> ./build-and-push.sh backend            # just the API
#   REGISTRY=<host>/<repo> ./build-and-push.sh realtime           # just the sync server
#   REGISTRY=<host>/<repo> ./build-and-push.sh admin              # just the platform console
#   REGISTRY=<host>/<repo> VITE_API_URL=https://api.acme.com/v1 ./build-and-push.sh
#   REGISTRY=<host>/<repo> PUSH=0 ./build-and-push.sh             # build only, no push
#
# Produces (REGISTRY is the full repo path; the image name is the tag):
#   $REGISTRY:product-hub-backend
#   $REGISTRY:product-hub-frontend
#   $REGISTRY:product-hub-realtime    the collab/ Yjs sync server — deployed as the
#                                     `realtime` service (docker-compose.internal-tools.stack.yml)
#   $REGISTRY:product-hub-saas-admin  the saas-admin/ vendor console — deployed as the
#                                     `productos-admin` service, on its own hostname
#
# After each build it reports the image's content digest (sha256) — an immutable
# handle on that exact image — so you can pin a deployment to
# $REGISTRY:tag@sha256:… instead of the mutable :tag. Set DIGEST_FILE=path to
# also write those pinnable refs to a file for a deploy step to read.
#
# Config (environment variables):
#   REGISTRY        (required) full repository path — both images push here, one tag each.
#                   e.g. 680543267295.dkr.ecr.ap-northeast-2.amazonaws.com/tools
#   PUSH            1 build+push (default), 0 build only
#   PLATFORM        target arch            (default linux/amd64 — right for most cloud hosts)
#   VITE_API_URL    frontend API base URL, inlined at build time. Unset by default →
#                   the value in frontend/.env.prod is used; set it to override that.
#   VITE_COLLAB_URL frontend sync-server URL, inlined the same way (default /collab,
#                   from .env.prod). Note an EMPTY value here means "don't override",
#                   not "ship without collaboration" — to build an image that never
#                   talks to the realtime service, blank it in frontend/.env.prod.
#   BUILD_MODE      Vite build mode → picks frontend/.env.<mode> and
#                   saas-admin/.env.<mode> (default prod)
#   ADMIN_API_URL   platform console API base URL. Unset by default → the value in
#                   saas-admin/.env.prod (/v1 = same origin, which is what the stack
#                   routes to the API). Set it only where /v1 on the console's host
#                   can't reach the API — and then add that host to the API's
#                   ALLOWED_ORIGINS, or every console login fails on CORS.
#   ADMIN_APP_URL   tenant app URL the console's "open workspace" links point at, e.g.
#                   https://team.example.com. Unset → the .env.prod value; empty there
#                   hides those links.
#                   Deliberately separate from the frontend's VITE_* vars: the two SPAs
#                   are different origins with different config, and sharing one variable
#                   would silently rewire the console when you rebuild the app.
#   BACKEND_IMAGE   backend tag            (default product-hub-backend)
#   FRONTEND_IMAGE  frontend tag           (default product-hub-frontend)
#   REALTIME_IMAGE  sync server tag        (default product-hub-realtime)
#   ADMIN_IMAGE     platform console tag   (default product-hub-saas-admin)
#   DIGEST_FILE     optional path; when set, each image's pinnable
#                   "<name>\t<ref>@sha256:…" line is written here as well as printed
#   REGISTRY_USER / REGISTRY_PASSWORD   if both set, the script `docker login`s first
#
# Registry login (do once beforehand, or set REGISTRY_USER/REGISTRY_PASSWORD):
#   Azure ACR : az acr login --name <name>      # or: docker login <name>.azurecr.io -u <sp-id> -p <sp-pw>
#   GHCR      : echo "$CR_PAT" | docker login ghcr.io -u <user> --password-stdin
#   Docker Hub: docker login -u <user>
#   AWS ECR   : aws ecr get-login-password --region <r> | docker login --username AWS --password-stdin <acct>.dkr.ecr.<r>.amazonaws.com
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Config ────────────────────────────────────────────────────────────────
REGISTRY="${REGISTRY:-}"
PUSH="${PUSH:-1}"
PLATFORM="${PLATFORM:-linux/amd64}"
VITE_API_URL="${VITE_API_URL:-}"          # empty → use frontend/.env.prod
VITE_COLLAB_URL="${VITE_COLLAB_URL:-}"    # empty → use frontend/.env.prod (/collab)
BUILD_MODE="${BUILD_MODE:-prod}"          # Vite mode → frontend/.env.<mode>
ADMIN_API_URL="${ADMIN_API_URL:-}"        # empty → the console's own /v1 default (same origin)
ADMIN_APP_URL="${ADMIN_APP_URL:-}"        # empty → console hides its "open workspace" links
BACKEND_IMAGE="${BACKEND_IMAGE:-product-hub-backend}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-product-hub-frontend}"
REALTIME_IMAGE="${REALTIME_IMAGE:-product-hub-realtime}"
ADMIN_IMAGE="${ADMIN_IMAGE:-product-hub-saas-admin}"
DIGEST_FILE="${DIGEST_FILE:-}"          # optional file to also write pinnable ref@digest lines to
TARGET="${1:-all}"

DIGESTS=()   # "name|ref|sha256:…" per built image → summary + optional DIGEST_FILE
BUILT=()     # "name|ref" per image built, in order → drives the pushed/built summary
METAS=()     # buildx --metadata-file temp files, removed on exit

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { printf "${BLUE}[build]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[build] %s${NC}\n" "$*"; }
die()  { printf "${RED}[build] %s${NC}\n" "$*" >&2; exit 1; }

# Best-effort cleanup of the temp metadata files, even if a build fails mid-way.
# Must end with `return 0`: under `set -e` an EXIT trap whose last command fails
# makes the whole script exit non-zero — here the final `[ -f ]` is usually false
# (build() already removed the file), which would wrongly report failure.
cleanup() { local m; for m in ${METAS+"${METAS[@]}"}; do [ -f "$m" ] && rm -f "$m"; done; return 0; }
trap cleanup EXIT

# Read the image's content digest (sha256) out of a buildx --metadata-file.
# Prefers jq; falls back to a fixed-format grep so it also works without jq. We
# want containerimage.digest (the manifest digest you pin with @sha256), never
# containerimage.config.digest (the config blob) — the exact-key match ensures that.
image_digest() {
  local meta="$1" d=""
  [ -f "$meta" ] || return 0
  if command -v jq >/dev/null 2>&1; then
    d="$(jq -r '."containerimage.digest" // empty' "$meta" 2>/dev/null || true)"
  fi
  if [ -z "$d" ]; then
    d="$(tr -d '\n' < "$meta" | grep -o '"containerimage\.digest"[[:space:]]*:[[:space:]]*"sha256:[a-f0-9]\{64\}"' | grep -o 'sha256:[a-f0-9]\{64\}' | head -1 || true)"
  fi
  printf '%s' "$d"
}

# ── Validate ──────────────────────────────────────────────────────────────
[ -n "$REGISTRY" ] || die "REGISTRY is required — e.g. REGISTRY=myacr.azurecr.io ./build-and-push.sh"
case "$TARGET" in all|backend|frontend|realtime|admin) ;; *) die "unknown target '$TARGET' — use: all | backend | frontend | realtime | admin" ;; esac
command -v docker >/dev/null 2>&1 || die "docker not found on PATH"
docker buildx version >/dev/null 2>&1 || die "docker buildx is required (it ships with modern Docker/OrbStack)"
REGISTRY="${REGISTRY%/}"   # trim any trailing slash

# ── Optional login ────────────────────────────────────────────────────────
if [ -n "${REGISTRY_USER:-}" ] && [ -n "${REGISTRY_PASSWORD:-}" ]; then
  # Log in to the registry host (the part before the first slash — namespace stripped).
  log "logging in to ${REGISTRY%%/*} as $REGISTRY_USER"
  printf '%s' "$REGISTRY_PASSWORD" | docker login "${REGISTRY%%/*}" -u "$REGISTRY_USER" --password-stdin
fi

# ── Build (and optionally push) one image ─────────────────────────────────
# build <image-name> <context-dir> [extra buildx args…]
build() {
  local name="$1" context="$2"; shift 2
  # REGISTRY is the full repository path; the image name is the tag — e.g. ECR's one
  # repo with backend/frontend as separate tags:  <acct>.dkr.ecr…/tools:product-hub-backend
  local ref="$REGISTRY:$name"
  # --metadata-file makes buildx write the built image's digest (as JSON) so we
  # can read it back and report a pin-able ref below.
  local meta; meta="$(mktemp "${TMPDIR:-/tmp}/phdigest.XXXXXX")"; METAS+=( "$meta" )
  local args=( buildx build --platform "$PLATFORM" -f "$context/Dockerfile" -t "$ref" --metadata-file "$meta" )
  args+=( "$@" )
  # buildx: --push uploads straight to the registry; --load leaves it in the
  # local image store (single-platform only, which our default PLATFORM is).
  if [ "$PUSH" = "1" ]; then args+=( --push ); else args+=( --load ); fi
  args+=( "$context" )
  log "building $ref  ($PLATFORM$([ "$PUSH" = 1 ] && echo ', push'))"
  docker "${args[@]}"
  BUILT+=( "$name|$ref" )

  # Capture the sha256 buildx just computed. It's the same digest the registry
  # stores, so "$ref@$digest" is an immutable handle on this exact build.
  local digest; digest="$(image_digest "$meta")"
  rm -f "$meta"
  if [ -n "$digest" ]; then
    DIGESTS+=( "$name|$ref|$digest" )
    log "digest $name → $digest"
  else
    warn "no digest reported for $name (buildx metadata had no containerimage.digest)"
  fi
}

# ── Go ────────────────────────────────────────────────────────────────────
log "registry=$REGISTRY  platform=$PLATFORM  push=$PUSH  target=$TARGET  mode=$BUILD_MODE${VITE_API_URL:+  VITE_API_URL=$VITE_API_URL}"

if [ "$TARGET" = "all" ] || [ "$TARGET" = "backend" ]; then
  build "$BACKEND_IMAGE" "$ROOT/backend"
fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "frontend" ]; then
  # BUILD_MODE picks the .env file; the two VITE_* overrides are passed only when
  # set, so they override .env.<mode> rather than blanking it out.
  fe_args=( --build-arg "BUILD_MODE=$BUILD_MODE" )
  [ -n "$VITE_API_URL" ]    && fe_args+=( --build-arg "VITE_API_URL=$VITE_API_URL" )
  [ -n "$VITE_COLLAB_URL" ] && fe_args+=( --build-arg "VITE_COLLAB_URL=$VITE_COLLAB_URL" )
  build "$FRONTEND_IMAGE" "$ROOT/frontend" "${fe_args[@]}"
fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "realtime" ]; then
  # The Yjs sync server. Nothing is baked in: it reads MONGODB_URI, JWT_SECRET,
  # PORT and ALLOWED_ORIGINS from the environment at start-up, so one image is
  # good for every environment — unlike the frontend, whose config Vite inlines.
  build "$REALTIME_IMAGE" "$ROOT/collab"
fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "admin" ]; then
  # The vendor console (saas-admin/). Same shape as the frontend: BUILD_MODE picks
  # the .env file Vite loads, and the two overrides are passed only when set — an
  # empty --build-arg does not mean "no override", it blanks what .env.<mode> said
  # (Vite applies process.env VITE_* after the file).
  admin_args=( --build-arg "BUILD_MODE=$BUILD_MODE" )
  [ -n "$ADMIN_API_URL" ] && admin_args+=( --build-arg "VITE_API_URL=$ADMIN_API_URL" )
  [ -n "$ADMIN_APP_URL" ] && admin_args+=( --build-arg "VITE_APP_URL=$ADMIN_APP_URL" )
  build "$ADMIN_IMAGE" "$ROOT/saas-admin" "${admin_args[@]}"
fi

if [ "$PUSH" = "1" ]; then
  printf "\n${GREEN}✔ pushed to %s${NC}\n" "$REGISTRY"
else
  printf "\n${GREEN}✔ built locally${NC} (PUSH=0 — nothing pushed)\n"
fi
# Listed from what was actually built rather than re-derived from $TARGET: the
# old "which one did we skip" tests only worked while there were exactly two
# images, and silently claimed a third had been pushed when it had not.
for entry in ${BUILT+"${BUILT[@]}"}; do
  printf "  %s\n" "${entry#*|}"
done

# ── Digests ────────────────────────────────────────────────────────────────
# Pin deployments to REF@sha256:… (an immutable handle on this exact build)
# rather than the mutable :tag, so a host can't silently pull a different image.
if [ "${#DIGESTS[@]}" -gt 0 ]; then
  if [ "$PUSH" = "1" ]; then
    printf "\n${GREEN}✔ image digests${NC} — pin deployments to these:\n"
  else
    printf "\n${GREEN}✔ image digests${NC} (built locally; identical once pushed):\n"
  fi
  for entry in "${DIGESTS[@]}"; do
    ref="${entry#*|}"; ref="${ref%|*}"; digest="${entry##*|}"
    printf "  %s@%s\n" "$ref" "$digest"
  done
  if [ -n "$DIGEST_FILE" ]; then
    : > "$DIGEST_FILE"
    for entry in "${DIGESTS[@]}"; do
      name="${entry%%|*}"; ref="${entry#*|}"; ref="${ref%|*}"; digest="${entry##*|}"
      printf "%s\t%s@%s\n" "$name" "$ref" "$digest" >> "$DIGEST_FILE"
    done
    log "digests also written to $DIGEST_FILE"
  fi
fi
