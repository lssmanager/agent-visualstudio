FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps --include=dev

COPY . .
RUN ./node_modules/.bin/prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3400
ENV STUDIO_API_PORT=3400

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
# Copy the Prisma-generated client (written to .prisma/client by prisma generate)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/docker ./docker

RUN chmod +x /app/docker/start.sh

EXPOSE 3400

CMD ["/app/docker/start.sh"]
