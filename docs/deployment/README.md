# Deployment Documentation

## Environments

| Environment | Stack | Notes |
|-------------|-------|-------|
| Local Dev | Docker Compose | pnpm dev |
| Staging | Docker Compose (production config) | CI deploys on merge to develop |
| Production | Kubernetes (Helm) | CD deploys on merge to main |

## Local Development

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

## Production Docker Compose

See `docker/docker-compose.production.yml` for the full production stack including:
- PostgreSQL 15 with pgvector
- Redis 7
- API Gateway
- Channel Gateway service
- Run Worker service
- RAG Service
- Web dashboard

## Kubernetes Helm Chart

Helm chart available in `deploy/helm/agent-visualstudio/`.

```bash
helm install agent-vs ./deploy/helm/agent-visualstudio \
  --set postgresql.enabled=true \
  --set redis.enabled=true \
  --set api.replicas=3
```

## Health Endpoints

- `GET /health` — basic liveness
- `GET /health/ready` — readiness (DB + Redis connected)
- `GET /metrics` — Prometheus metrics endpoint
