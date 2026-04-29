# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM node:20-bookworm-slim AS builder

# better-sqlite3 needs build tools to compile its native binding
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install workspace deps with cached lockfile
COPY package.json package-lock.json* ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm install

# Copy sources and build
COPY server ./server
COPY web ./web
RUN npm run build

# Prune dev deps from server's node_modules graph
RUN npm prune --omit=dev --workspace=server

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Only the bits the server needs at runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/package.json
COPY --from=builder /app/web/dist ./web/dist
COPY package.json ./

RUN mkdir -p /app/data && chown -R node:node /app
USER node

ENV PORT=8787 \
    DATABASE_PATH=/app/data/invites.db
EXPOSE 8787
VOLUME ["/app/data"]

CMD ["node", "server/dist/index.js"]
