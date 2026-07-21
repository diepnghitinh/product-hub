# syntax=docker/dockerfile:1
#
# product-hub API (NestJS). Multi-stage: compile TS in a full image, ship only
# the built output + production dependencies on a slim runtime.
#
# Runtime config comes from the environment (MONGODB_URI, JWT_SECRET, PORT,
# AZURE_STORAGE_*, …) — nothing secret is baked into the image.

# ── Build: install everything and compile src/ + libs/ → dist/ ────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Deps: production-only node modules, resolved from the lockfile ────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Runtime: slim image, non-root, just dist + prod deps ─────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY package.json ./
USER app
# The API reads PORT from the env (default 3000); expose that default.
EXPOSE 3000
CMD ["node", "dist/src/main"]
