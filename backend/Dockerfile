# syntax=docker/dockerfile:1
#
# product-hub API (NestJS). Multi-stage: compile TS in a full image, ship only
# the built output + production dependencies on a slim runtime.
#
# Runtime config comes from the environment (MONGODB_URI, JWT_SECRET, PORT,
# AZURE_STORAGE_*, …) — nothing secret is baked into the image.
#
# PDF export (docs → PDF) drives a real headless browser. The Chrome that
# `npm install puppeteer` downloads is a glibc build and cannot run on Alpine,
# and it lands in the *installing* user's ~/.cache — which isn't the user this
# image runs as. So we skip that download everywhere and use Alpine's own
# Chromium package instead, pointed at by PUPPETEER_EXECUTABLE_PATH.

# ── Build: install everything and compile src/ + libs/ → dist/ ────────────
FROM node:20-alpine AS build
WORKDIR /app
# Nothing here launches a browser, and the download can't run on musl anyway.
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Deps: production-only node modules, resolved from the lockfile ────────
FROM node:20-alpine AS deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Runtime: slim image, non-root, just dist + prod deps ─────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Chromium for PDF export, plus the fonts it renders with. A container has no
# system fonts at all, so without these every glyph prints as an empty box:
#   liberation  metric-compatible Arial / Times New Roman / Courier New, which
#               is what the print stylesheet actually asks for
#   noto        the sans/serif fallback for everything else Latin
#   noto-cjk    Korean (the app ships ko) and the rest of CJK
#   noto-emoji  emoji in headings and text
RUN apk add --no-cache \
      chromium nss freetype harfbuzz ca-certificates \
      font-liberation font-noto font-noto-cjk font-noto-emoji
# The service reads this and hands it to puppeteer.launch(); with it set,
# puppeteer never looks in ~/.cache for a browser it didn't download.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY package.json ./
USER app
# The API reads PORT from the env (default 3000); expose that default.
EXPOSE 3000
CMD ["node", "dist/src/main"]
