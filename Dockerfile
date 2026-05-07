FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --legacy-peer-deps --include=dev --ignore-scripts

COPY . .

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
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/docker ./docker

RUN ./node_modules/.bin/prisma generate --schema ./packages/db/prisma/schema.prisma

RUN chmod +x /app/docker/start.sh

EXPOSE 3400

CMD ["/app/docker/start.sh"]
