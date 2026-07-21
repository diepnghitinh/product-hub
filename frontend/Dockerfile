# syntax=docker/dockerfile:1
#
# product-hub web app (Vite/React SPA). Multi-stage: build the static bundle,
# then serve it from nginx.
#
# NOTE: Vite inlines env vars at BUILD time, so config is baked in here, not at
# runtime. The build runs in --mode $BUILD_MODE (default "prod"), so Vite loads
# frontend/.env.prod for its VITE_* values. VITE_API_URL is an optional escape
# hatch: pass --build-arg VITE_API_URL=… to override the .env.prod value for a
# one-off build (the .env.prod default is /v1 = same origin, proxied to the API).

# ── Build: produce the static bundle ─────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Build mode selects which .env.<mode> file Vite loads (default: .env.prod).
ARG BUILD_MODE=prod
# Optional override for the API base URL. IMPORTANT: a declared ARG is present in the
# RUN environment even when empty, and Vite treats an empty VITE_API_URL as "set",
# letting it win over .env files — which would blank the value and fall back to
# localhost. So when no override is given we must `unset` it, not merely skip export.
ARG VITE_API_URL=""
# Guard: fail loudly if there is neither an env file nor an explicit override, so a
# prod image can never silently ship the localhost dev fallback (src/lib/env.ts).
RUN set -e; \
    if [ -n "$VITE_API_URL" ]; then \
      export VITE_API_URL="$VITE_API_URL"; \
    else \
      unset VITE_API_URL; \
      if [ ! -f ".env.$BUILD_MODE" ]; then \
        echo "ERROR: frontend/.env.$BUILD_MODE is missing from the build context and no VITE_API_URL build-arg was given." >&2; \
        echo "Fix: create frontend/.env.$BUILD_MODE (copy .env.prod.example), or pass --build-arg VITE_API_URL=..." >&2; \
        exit 1; \
      fi; \
    fi; \
    npm run build -- --mode "$BUILD_MODE"

# ── Runtime: nginx serving the SPA ───────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# The base image's CMD already runs: nginx -g 'daemon off;'
