# Pasos pendientes para activar feature/settings

## 1 — Migration: agregar `SystemConfig` + campos a `RunStep`

### 1a — Agregar al final de `apps/api/prisma/schema.prisma`

```prisma
// ── SystemConfig ──────────────────────────────────────────────────────────────
// Configuración global del sistema (single-tenant).
// Almacena API keys y URLs de servicios externos: LLM providers, n8n.
// Sin cifrado — mismo nivel de confianza que .env en disco.

model SystemConfig {
  key       String   @id   // e.g. 'OPENAI_API_KEY', 'N8N_BASE_URL'
  value     String         // plaintext
  updatedAt DateTime @updatedAt
}
```

### 1b — Agregar campos a `RunStep` en el schema

```diff
model RunStep {
  // ... campos existentes ...
+ model     String?  // modelo LLM usado en este step (ej. 'openai/gpt-4o')
+ provider  String?  // proveedor LLM (ej. 'openai')
+ index     Int      @default(0)  // posición del step dentro del run
  // NOTA: usar completedAt (ya existe) — NO agregar finishedAt
}
```

### 1c — Ejecutar (requiere aprobación de Sebastián)

```bash
npx prisma migrate dev --name add-system-config-and-runstep-fields
```

---

## 2 — Parchear `llm-client.ts`

Archivo: `packages/run-engine/src/llm-client.ts`

```typescript
// Agregar interface antes de buildLLMClient:
export interface LLMClientOptions {
  /** Keys de SystemConfig — tienen prioridad sobre process.env */
  configOverride?: Record<string, string>
}

// Modificar firma:
// - buildLLMClient(modelId: string): ProviderAdapter
// + buildLLMClient(modelId: string, opts?: LLMClientOptions): ProviderAdapter

// En resolveApiKey(), cambiar el loop:
// - const key = process.env[envVar]
// + const key = opts?.configOverride?.[envVar] ?? process.env[envVar]

// Pasar opts internamente:
// - const apiKey = resolveApiKey(config.envVars)
// + const apiKey = resolveApiKey(config.envVars, opts)
```

---

## 3 — Verificar import del prisma singleton

`settings.service.ts` usa `new PrismaClient()` directamente.
Si el proyecto ya exporta un singleton (ej. `lib/prisma.ts`), reemplazar:

```diff
- const prisma = new PrismaClient()
+ import { prisma } from '../../lib/prisma'
```

---

## 4 — Exportar desde `packages/run-engine/src/index.ts`

```typescript
export { SystemConfigService }       from './system-config.service'
export { PROVIDER_MODELS }           from './provider-models'
export type { ProviderModelConfig }  from './provider-models'
export type { LLMClientOptions }     from './llm-client'  // después del paso 2
```

---

## Checklist de criterios de aceptación

- [ ] `GET /settings/providers` — lista providers con `hasKey` correcto
- [ ] `PATCH /settings/providers/:id/key` — guarda en BD, no en .env
- [ ] `GET /settings/providers` — NUNCA devuelve el valor de la API key
- [ ] `POST /settings/providers/:id/test` — valida con llamada real de 1 token
- [ ] `buildLLMClient()` sin opts → sigue leyendo process.env (CI no rompe)
- [ ] `buildLLMClient()` con configOverride → usa BD (producción)
- [ ] `PATCH /settings/n8n` — guarda baseUrl + apiKey
- [ ] `POST /settings/n8n/test` — confirma conectividad con instancia n8n
