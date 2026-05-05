FROM node:20-bookworm-slim AS builder

WORKDIR /app

# openssl needed by Prisma query-engine even at generate time
RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --legacy-peer-deps --include=dev

COPY . .

# Generate Prisma client BEFORE compiling TypeScript.
# Without this, tsc resolves @prisma/client to an empty stub and the
# compiled JS crashes at runtime with "did not initialize yet".
RUN ./node_modules/.bin/prisma generate --schema ./apps/api/prisma/schema.prisma

RUN npm run build

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

# openssl is required by the Prisma query-engine on debian-slim images
RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3400
ENV STUDIO_API_PORT=3400

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/docker ./docker

# Re-generate Prisma client for the runner OS/arch (debian-slim native binary).
# The builder already generated it for compilation; this ensures the correct
# linux query-engine binary is present in the final image.
RUN ./node_modules/.bin/prisma generate --schema ./apps/api/prisma/schema.prisma

RUN chmod +x /app/docker/start.sh

EXPOSE 3400

CMD ["/app/docker/start.sh"]
