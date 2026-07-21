# syntax=docker/dockerfile:1
#
# product-hub web app (Vite/React SPA). Multi-stage: build the static bundle,
# then serve it from nginx.
#
# NOTE: Vite inlines env vars at BUILD time, so the API URL is a build arg, not
# a runtime one. Pass it with --build-arg VITE_API_URL=… (the build script does
# this for you). Default is /v1 — i.e. the SPA calls the API on the same origin,
# which assumes your ingress/reverse-proxy routes /v1 to the API service.

# ── Build: produce the static bundle ─────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Runtime: nginx serving the SPA ───────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# The base image's CMD already runs: nginx -g 'daemon off;'
