FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update -qq && apt-get install -y --no-install-recommends git openssl && rm -rf /var/lib/apt/lists/*

# Instalar pnpm globalmente
RUN npm install -g pnpm

# IMPORTANTE: pnpm-workspace.yaml debe copiarse antes de pnpm install
# porque contiene la config de 'catalog' y 'onlyBuiltDependencies'
# que debe coincidir exactamente con lo registrado en el lockfile.
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN ./node_modules/.bin/prisma generate --schema ./packages/db/prisma/schema.prisma

RUN pnpm run build

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3400
ENV STUDIO_API_PORT=3400

# pnpm en runner por si se necesita en runtime
RUN npm install -g pnpm

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/docker ./docker

RUN ./node_modules/.bin/prisma generate --schema ./packages/db/prisma/schema.prisma

RUN chmod +x /app/docker/start.sh

EXPOSE 3400

CMD ["/app/docker/start.sh"]
