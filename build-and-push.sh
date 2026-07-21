#!/usr/bin/env bash
#
# build-and-push.sh — build the product-hub images and push them to a registry.
#
#   REGISTRY=myacr.azurecr.io ./build-and-push.sh                 # both images
#   REGISTRY=ghcr.io/acme     ./build-and-push.sh backend         # just the API
#   REGISTRY=... TAG=v1.2.3 VITE_API_URL=https://api.acme.com/v1 ./build-and-push.sh
#   REGISTRY=... PUSH=0       ./build-and-push.sh                 # build only, no push
#
# Produces:
#   $REGISTRY/product-hub-backend:$TAG   (+ :latest)
#   $REGISTRY/product-hub-frontend:$TAG  (+ :latest)
#
# Config (environment variables):
#   REGISTRY        (required) registry + namespace, e.g. myacr.azurecr.io  or  ghcr.io/acme
#   TAG             image tag              (default: short git sha, else "dev")
#   PUSH            1 build+push (default), 0 build only
#   PUSH_LATEST     1 also tag :latest (default), 0 only :$TAG
#   PLATFORM        target arch            (default linux/amd64 — right for most cloud hosts)
#   VITE_API_URL    frontend API base URL, inlined at build time (default /v1 = same origin)
#   BACKEND_IMAGE   backend repo name      (default product-hub-backend)
#   FRONTEND_IMAGE  frontend repo name     (default product-hub-frontend)
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
TAG="${TAG:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo dev)}"
PUSH="${PUSH:-1}"
PUSH_LATEST="${PUSH_LATEST:-1}"
PLATFORM="${PLATFORM:-linux/amd64}"
VITE_API_URL="${VITE_API_URL:-/v1}"
BACKEND_IMAGE="${BACKEND_IMAGE:-product-hub-backend}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-product-hub-frontend}"
TARGET="${1:-all}"

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { printf "${BLUE}[build]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[build] %s${NC}\n" "$*"; }
die()  { printf "${RED}[build] %s${NC}\n" "$*" >&2; exit 1; }

# ── Validate ──────────────────────────────────────────────────────────────
[ -n "$REGISTRY" ] || die "REGISTRY is required — e.g. REGISTRY=myacr.azurecr.io ./build-and-push.sh"
case "$TARGET" in all|backend|frontend) ;; *) die "unknown target '$TARGET' — use: all | backend | frontend" ;; esac
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
  local ref="$REGISTRY/$name"
  local args=( buildx build --platform "$PLATFORM" -f "$context/Dockerfile" -t "$ref:$TAG" )
  [ "$PUSH_LATEST" = "1" ] && args+=( -t "$ref:latest" )
  args+=( "$@" )
  # buildx: --push uploads straight to the registry; --load leaves it in the
  # local image store (single-platform only, which our default PLATFORM is).
  if [ "$PUSH" = "1" ]; then args+=( --push ); else args+=( --load ); fi
  args+=( "$context" )
  log "building $ref:$TAG  ($PLATFORM$([ "$PUSH" = 1 ] && echo ', push'))"
  docker "${args[@]}"
}

# ── Go ────────────────────────────────────────────────────────────────────
log "registry=$REGISTRY  tag=$TAG  platform=$PLATFORM  push=$PUSH  target=$TARGET"

if [ "$TARGET" = "all" ] || [ "$TARGET" = "backend" ]; then
  build "$BACKEND_IMAGE" "$ROOT/backend"
fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "frontend" ]; then
  build "$FRONTEND_IMAGE" "$ROOT/frontend" --build-arg "VITE_API_URL=$VITE_API_URL"
fi

if [ "$PUSH" = "1" ]; then
  printf "\n${GREEN}✔ pushed to %s${NC}\n" "$REGISTRY"
  [ "$TARGET" != "frontend" ] && printf "  %s:%s\n" "$REGISTRY/$BACKEND_IMAGE" "$TAG"
  [ "$TARGET" != "backend"  ] && printf "  %s:%s\n" "$REGISTRY/$FRONTEND_IMAGE" "$TAG"
else
  printf "\n${GREEN}✔ built locally${NC} (PUSH=0 — nothing pushed)\n"
fi
