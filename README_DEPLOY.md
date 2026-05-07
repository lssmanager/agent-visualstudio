# Guía de Despliegue en Coolify — Agent Visual Studio

> **Versión**: 2026-05-07 | **Branch activo**: `main` | **Build pack**: Nixpacks

---

## Prerequisitos

- Instancia de Coolify corriendo (v4.x+)
- PostgreSQL accesible desde Coolify (puede ser un recurso del mismo proyecto)
- Acceso al repositorio `lssmanager/agent-visualstudio`

---

## Paso 1 — Crear el recurso en Coolify

1. Ir a tu proyecto en Coolify → **+ New Resource**
2. Seleccionar **Public Repository** o **Private Repository** (con GitHub App)
3. URL del repo: `https://github.com/lssmanager/agent-visualstudio`
4. Branch: **`main`**
5. Build Pack: **Nixpacks** ← importante, NO seleccionar Dockerfile
6. Coolify detecta automáticamente el `nixpacks.toml`

---

## Paso 2 — Configurar el Puerto

En la sección **Network**:
- **Port**: `3400`
- Setear `PORT=3400` en las variables de entorno

---

## Paso 3 — Variables de Entorno

En la pestaña **Environment Variables** del servicio, añadir:

### Variables Obligatorias

```env
# Base de datos (PostgreSQL)
DATABASE_URL=postgresql://usuario:contraseña@host:5432/nombre_db

# Cifrado de canales — generar con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CHANNEL_SECRET=<valor_generado>

# Cifrado AES-256 — generar con: openssl rand -hex 32
# DEBE ser exactamente 64 caracteres hexadecimales
SECRETS_ENCRYPTION_KEY=<valor_generado_64_chars>

# Puerto
PORT=3400
NODE_ENV=production
```

### Variables de Autenticación

```env
# Opción A — JWT local
JWT_SECRET=<string_aleatoria_minimo_64_chars>
JWT_EXPIRES_IN=7d
REQUIRE_AUTH=true
ALLOW_REGISTER=false

# Opción B — Logto SSO (además de o en lugar de JWT)
LOGTO_ISSUER=https://auth.tu-dominio.com/oidc
LOGTO_AUDIENCE=https://api.agent-studio.com
```

### Variables Opcionales

```env
CORS_ORIGINS=https://tu-frontend.com
WEBHOOK_RATE_LIMIT=300
API_RATE_LIMIT=120
USER_RATE_LIMIT_MAX=60
USER_RATE_LIMIT_WINDOW_MS=60000
```

> **Cómo generar las claves:**
> ```bash
> # CHANNEL_SECRET (base64, 32 bytes)
> node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
>
> # SECRETS_ENCRYPTION_KEY (hex, 32 bytes = 64 chars)
> openssl rand -hex 32
>
> # JWT_SECRET (base64, 48 bytes)
> openssl rand -base64 48
> ```

---

## Paso 4 — Base de Datos

### Crear PostgreSQL en Coolify
1. En el mismo proyecto → **+ New Resource** → **Database** → **PostgreSQL**
2. Coolify genera automáticamente usuario, contraseña y nombre de DB
3. Copiar la **Internal Connection URL** como `DATABASE_URL`

### Migraciones
Se aplican automáticamente en cada deploy. El `docker/start.sh` ejecuta:

```bash
prisma migrate deploy --schema=packages/db/prisma/schema.prisma
```

Si es el **primer deploy** y `packages/db/prisma/migrations/` está vacío:

```bash
# Ejecutar localmente primero
pnpm --filter @lss/db run db:migrate:dev --name init
git add packages/db/prisma/migrations/
git commit -m "feat(db): initial migration"
git push origin main
```

---

## Paso 5 — Health Check en Coolify

| Parámetro | Valor |
|-----------|-------|
| **Path** | `/api/studio/v1/studio/state` |
| **Method** | `GET` |
| **Expected status** | `200` |
| **Interval** | `30s` |
| **Timeout** | `10s` |
| **Start period** | `60s` (dar tiempo a las migraciones) |

---

## Paso 6 — Deploy

1. Hacer clic en **Deploy** en Coolify
2. Las fases del build son:

```
[setup]   → Instala nodejs_22 + openssl
[install] → pnpm install --frozen-lockfile
[build]   → prisma generate → tsc --skipLibCheck → vite build
[start]   → sh docker/start.sh
            └─ validate → generate → migrate deploy → node dist/
```

3. El contenedor está listo cuando el health check responde 200

---

## Verificación Post-Deploy

```bash
# Health check
curl https://agents.socialstudies.cloud/api/studio/v1/studio/state
# → 200, JSON con estado del workspace

# Frontend carga
curl -s https://agents.socialstudies.cloud/ | head -1
# → <!DOCTYPE html>

# Profiles API
curl https://agents.socialstudies.cloud/api/studio/v1/profiles
# → 200, JSON array
```

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `exit code 1` en setup | `SECRETS_ENCRYPTION_KEY` no tiene 64 chars | `openssl rand -hex 32` |
| `No migration.sql files found` | `prisma/migrations/` vacío | Crear migración inicial localmente |
| `tsc` falla en build | Errores de tipos TypeScript | Ver `COMPILATION_FIXES_DETAILED.md` |
| `vite build` no encuentra módulos | `pnpm-lock.yaml` desactualizado | `pnpm install` + commitear lockfile |
| `ERR_PNPM_FROZEN_LOCKFILE` | `pnpm-lock.yaml` desincronizado | `pnpm install` en local + push |
| Contenedor arranca pero da 502 | Port mismatch | Verificar `PORT=3400` en env vars |
| API arranca pero secrets dan error | Nombre de env var incorrecto | Verificar `CHANNEL_SECRET` y `SECRETS_ENCRYPTION_KEY` |

---

## Reglas de Mantenimiento

- **No usar `npm install`** — solo `pnpm`. El repo no debe tener `package-lock.json`.
- **No commitear `.env`** — usar las variables de entorno de Coolify.
- **`pnpm-lock.yaml` debe estar commiteado** — es el contrato de dependencias.
- Antes de cada PR: `tsc -p tsconfig.json --skipLibCheck --noEmit` debe pasar con 0 errores.
- Las variables de entorno **correctas** son `CHANNEL_SECRET` y `SECRETS_ENCRYPTION_KEY` (ver `.env.example`).
