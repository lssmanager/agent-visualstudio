# Pasos pendientes para completar la feature/settings

## 1 — Agregar `SystemConfig` al schema Prisma

```prisma
// apps/api/prisma/schema.prisma — agregar al final del archivo

// ── SystemConfig ──────────────────────────────────────────────────────────
// Configuración global del sistema (single-tenant).
// Almacena API keys y URLs de servicios externos: LLM providers, n8n.
// Sin cifrado — mismo nivel de confianza que .env en disco.
// Configurable desde Settings UI por el administrador.

model SystemConfig {
  key       String   @id   // e.g. 'OPENAI_API_KEY', 'N8N_BASE_URL'
  value     String         // plaintext
  updatedAt DateTime @updatedAt
}
```

Luego ejecutar:
```bash
npx prisma migrate dev --name add-system-config
```

**Requiere aprobación de Sebastián antes de ejecutar.**

---

## 2 — Parchear `llm-client.ts`

Archivo: `packages/run-engine/src/llm-client.ts`

### 2a — Agregar interface `LLMClientOptions`

```typescript
// Agregar antes de la función buildLLMClient
export interface LLMClientOptions {
  /** API keys cargadas desde SystemConfig (tiene prioridad sobre process.env). */
  configOverride?: Record<string, string>
}
```

### 2b — Modificar firma de `buildLLMClient`

```diff
-export function buildLLMClient(modelId: string): ProviderAdapter {
+export function buildLLMClient(modelId: string, opts?: LLMClientOptions): ProviderAdapter {
```

### 2c — Modificar `resolveApiKey` para usar `configOverride`

```diff
-  for (const envVar of envVars) {
-    const key = process.env[envVar]
-    if (key) return key
-  }
+  for (const envVar of envVars) {
+    const key = opts?.configOverride?.[envVar] ?? process.env[envVar]
+    if (key) return key
+  }
```

### 2d — Pasar `opts` a `resolveApiKey` internamente

```diff
-  const apiKey = resolveApiKey(config.envVars)
+  const apiKey = resolveApiKey(config.envVars, opts)
```

---

## 3 — Registrar `SettingsModule` en el módulo raíz

Encontrar el archivo raíz (`app.module.ts` o equivalente) y agregar:

```typescript
import { SettingsModule } from './modules/settings/settings.module'

@Module({
  imports: [
    // ... módulos existentes ...
    SettingsModule,
  ],
})
export class AppModule {}
```

---

## 4 — Exportar desde `packages/run-engine/src/index.ts`

```typescript
export { SystemConfigService }         from './system-config.service'
export { PROVIDER_MODELS }             from './provider-models'
export type { ProviderModelConfig }    from './provider-models'
export type { LLMClientOptions }       from './llm-client'  // después del paso 2
```
