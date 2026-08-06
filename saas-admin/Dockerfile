# syntax=docker/dockerfile:1
#
# product-hub platform console (Vite/React SPA). Multi-stage: build the static
# bundle, then serve it from nginx.
#
# NOTE: Vite inlines env vars at BUILD time, so config is baked in here, not at
# runtime. The build runs in --mode $BUILD_MODE (default "prod"), so Vite loads
# saas-admin/.env.prod for its VITE_* values. The two build-args below are
# optional escape hatches for a one-off build.
#
# Unlike frontend/Dockerfile there is no "did you forget an env file?" hard stop:
# this image is only ever served where /v1 on its own origin reaches the API, so
# a missing env file has one sane answer (/v1) rather than an unanswerable
# question. It warns and uses it — what it will never do is silently ship the
# localhost fallback in src/lib/env.ts.

# ── Build: produce the static bundle ─────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Build mode selects which .env.<mode> file Vite loads (default: .env.prod).
ARG BUILD_MODE=prod
# Optional overrides for the API base URL (same origin, /v1) and the tenant app
# URL behind the console's "open workspace" links (empty hides them).
#
# IMPORTANT: these are ARGs read inside the RUN, not ENVs. A declared ARG is
# present in the RUN environment even when empty, and Vite applies process.env
# VITE_* values AFTER the .env file — so a set-but-empty variable does not mean
# "no override", it silently blanks whatever .env.prod said. Hence: export when
# non-empty, `unset` otherwise. This is also why they can't stay ENVs — an ENV
# would win over .env.prod on every build and the file would never be read.
ARG VITE_API_URL=""
ARG VITE_APP_URL=""
RUN set -e; \
    if [ -n "$VITE_API_URL" ]; then \
      export VITE_API_URL="$VITE_API_URL"; \
    else \
      unset VITE_API_URL; \
      if [ ! -f ".env.$BUILD_MODE" ]; then \
        echo "WARN: saas-admin/.env.$BUILD_MODE is not in the build context — falling back to VITE_API_URL=/v1 (same origin)." >&2; \
        export VITE_API_URL=/v1; \
      fi; \
    fi; \
    if [ -n "$VITE_APP_URL" ]; then \
      export VITE_APP_URL="$VITE_APP_URL"; \
    else \
      unset VITE_APP_URL; \
    fi; \
    npm run build -- --mode "$BUILD_MODE"

# ── Runtime: nginx serving the SPA ───────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# The base image's CMD already runs: nginx -g 'daemon off;'
