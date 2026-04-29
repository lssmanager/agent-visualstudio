# Prisma Migrations — Agent Visual Studio

> **Orden de aplicación** (Prisma aplica en orden alfanumérico de carpeta):

| # | Carpeta | Descripción |
|---|---------|-------------|
| 1 | `20260428000000_init` | Schema base completo + partial unique indexes (C-20) |
| 2 | `20260429_provider_catalog` | ProviderCredential, ModelCatalogEntry, CHECK constraints exactly-one-scope |

---

## Cómo aplicar las migraciones

```bash
# Aplicar en desarrollo (crea la DB si no existe)
npx prisma migrate dev

# Aplicar en producción / CI
npx prisma migrate deploy

# Verificar estado
npx prisma migrate status
```

---

## Notas de diseño

### C-20 — Partial unique indexes para `isLevelOrchestrator`

Prisma no puede expresar `@@unique WHERE value = true`. Los tres índices parciales
están en `20260428000000_init/migration.sql` como SQL raw:

```sql
CREATE UNIQUE INDEX "dept_one_orchestrator_per_agency"
  ON "Department"("agencyId") WHERE "isLevelOrchestrator" = TRUE;

CREATE UNIQUE INDEX "workspace_one_orchestrator_per_department"
  ON "Workspace"("departmentId") WHERE "isLevelOrchestrator" = TRUE;

CREATE UNIQUE INDEX "agent_one_orchestrator_per_workspace"
  ON "Agent"("workspaceId") WHERE "isLevelOrchestrator" = TRUE;
```

### D-10 — Índices de performance

- `Run`: compuestos en `(flowId, status)` y `(agencyId, status, createdAt)`.
- `RunStep`: compuestos en `(runId, status)` y `(agentId, startedAt)`.
- `ConversationMessage`: en `(sessionId, createdAt)`, `(sessionId, role)`, `(scopeId, createdAt)`.
- `AuditEvent`: en `(eventType, createdAt)`, `(scopeType, scopeId, createdAt)`, `(userId, createdAt)`.

### D-15 — ConversationMessage append-only

`GatewaySession.messageHistory` fue eliminado. El historial completo vive en
`ConversationMessage` (append-only). El contexto activo de la ventana LLM
se guarda en `GatewaySession.activeContextJson`.

### Policy invariant (exactly-one-FK)

`BudgetPolicy` y `ModelPolicy` cada una pertenece exactamente a UN scope.
Reforzado en dos capas:
1. **DB layer** — CHECK constraint en `20260429_provider_catalog`.
2. **App layer** — `PolicyScopeGuard` en `apps/api` valida antes de upsert.
