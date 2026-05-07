FROM node:20-bookworm-slim AS builder

WORKDIR /app

# openssl needed by Prisma query-engine at generate time
RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# --ignore-scripts prevents @prisma/client postinstall from running
# with a potentially wrong schema before we explicitly generate below.
RUN npm install --legacy-peer-deps --include=dev --ignore-scripts

COPY . .

# Explicit generate using the canonical schema in packages/db/prisma.
# This is the source of truth used by docker/start.sh and all package.json scripts.
RUN ./node_modules/.bin/prisma generate --schema ./packages/db/prisma/schema.prisma

RUN npm run build:ci

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3400
ENV STUDIO_API_PORT=3400

COPY --from=builder /app/package*.json ./

# Copy node_modules with the already-generated Prisma client from builder.
# We still re-generate below to ensure the native query-engine binary
# matches the runner OS (debian-slim linux/amd64 or linux/arm64).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Canonical schema path — must match start.sh MIGRATIONS_DIR and prisma commands
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma

COPY --from=builder /app/docker ./docker

# Re-generate for the runner OS native binary (same schema, no custom output).
RUN ./node_modules/.bin/prisma generate --schema ./packages/db/prisma/schema.prisma

RUN chmod +x /app/docker/start.sh

EXPOSE 3400

CMD ["/app/docker/start.sh"]
