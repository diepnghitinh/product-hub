# syntax=docker/dockerfile:1
#
# product-hub collab — the Yjs sync server. Multi-stage: compile TS in a full
# image, ship only the built output + production dependencies on a slim runtime.
#
# Node 22, not 20 like the API: @hocuspocus/server declares engines >=22.
#
# Runtime config comes from the environment (MONGODB_URI, JWT_SECRET, PORT,
# ALLOWED_ORIGINS) — nothing secret is baked into the image.

# ── Build: install everything and compile src/ → dist/ ────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Deps: production-only node modules, resolved from the lockfile ────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Runtime: slim image, non-root, just dist + prod deps ─────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY package.json ./
USER app
# The service reads PORT from the env (default 3002); expose that default.
EXPOSE 3002
CMD ["node", "dist/index.js"]
