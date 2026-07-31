# syntax=docker/dockerfile:1
#
# product-hub platform console (Vite/React SPA). Multi-stage: build the static
# bundle, then serve it from nginx.
#
# Unlike frontend/Dockerfile there is no "did you forget an env file?" guard and
# no .env.prod in the build context. This image is only ever served behind an
# nginx that proxies /v1 to the API on its own origin, so the API URL has exactly
# one sane value and it is the default below — there is nothing to forget and no
# way to silently ship a localhost fallback.

# ── Build: produce the static bundle ─────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Same origin as the console itself; nginx forwards it to the api service.
ARG VITE_API_URL=/v1
# The tenant app, used only for "open workspace" links. Empty hides them, which
# is the right default: the console must not assume the app is on a known host.
ARG VITE_APP_URL=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_APP_URL=$VITE_APP_URL
RUN npm run build

# ── Runtime: nginx serving the SPA ───────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# The base image's CMD already runs: nginx -g 'daemon off;'
