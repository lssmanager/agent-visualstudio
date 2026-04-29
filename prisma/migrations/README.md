# Migrations — Notas de migraciones manuales

## C-20 — Partial unique index para `isLevelOrchestrator`

Prisma no puede expresar un `UNIQUE` condicional ("solo un `true` por scope").
Después de ejecutar `prisma migrate dev`, editar la migración generada y agregar
al final del archivo SQL:

```sql
-- C-20: Garantiza que solo un Agent por Workspace sea isLevelOrchestrator=true
CREATE UNIQUE INDEX "agent_one_orchestrator_per_workspace"
  ON "Agent" ("workspaceId")
  WHERE "isLevelOrchestrator" = true;

-- C-20: Garantiza que solo un Workspace por Department sea isLevelOrchestrator=true
CREATE UNIQUE INDEX "workspace_one_orchestrator_per_department"
  ON "Workspace" ("departmentId")
  WHERE "isLevelOrchestrator" = true;

-- C-20: Garantiza que solo un Department por Agency sea isLevelOrchestrator=true
CREATE UNIQUE INDEX "department_one_orchestrator_per_agency"
  ON "Department" ("agencyId")
  WHERE "isLevelOrchestrator" = true;
```

Este bloque SQL va al FINAL del archivo de migración, después de las instrucciones
generadas por Prisma. Aplicar con `prisma migrate dev` (no `migrate deploy`).

## Budget/Model Policy — CHECK constraints

También agregar en la misma migración (o en una migración separada):

```sql
ALTER TABLE "BudgetPolicy" ADD CONSTRAINT "budget_policy_exactly_one_scope"
  CHECK (
    (CASE WHEN "agencyId"     IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN "departmentId" IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN "workspaceId"  IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN "agentId"      IS NOT NULL THEN 1 ELSE 0 END) = 1
  );

ALTER TABLE "ModelPolicy" ADD CONSTRAINT "model_policy_exactly_one_scope"
  CHECK (
    (CASE WHEN "agencyId"     IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN "departmentId" IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN "workspaceId"  IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN "agentId"      IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
```
