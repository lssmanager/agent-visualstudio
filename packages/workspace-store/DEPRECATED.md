# workspace-store — DEPRECATED (F0-08)

> **Status:** Deprecated as of `2026-04-29`.
> **Removal:** Milestone F1 — Agentes & Ejecución.

This package (`packages/workspace-store`) provided JSON/YAML file-based
persistence for agents, flows, skills, policies, and workspace metadata.
It has been replaced by individual **Prisma-backed repositories**.

---

## Migration Map

| WorkspaceStore method | Prisma replacement |
|---|---|
| `readWorkspace()` / `writeWorkspace()` | `WorkspaceRepository` — `apps/api/src/modules/workspaces/workspaces.repository.ts` |
| `listAgents()` / `getAgent()` / `saveAgents()` | `AgentRepository` — `apps/api/src/modules/agents/agents.repository.ts` |
| `listFlows()` / `getFlow()` / `saveFlows()` | `FlowRepository` — `apps/api/src/modules/flows/flows.repository.ts` |
| `listSkills()` / `getSkill()` / `saveSkills()` | `SkillRepository` — `apps/api/src/modules/skills/skills.repository.ts` |
| `listPolicies()` / `getPolicy()` / `savePolicies()` | `PoliciesRepository` — `apps/api/src/modules/policies/policies.repository.ts` |
| `listHooks()` / `getHook()` / `saveHooks()` | HookRepository — to be created in F1 |

---

## Files with active imports (must migrate before F1)

Each file below imports from `workspace-store`. The import is marked with
`// @deprecated(F0-08)` for grep/CI tracking.

| File | Imported symbol | Target repository |
|---|---|---|
| `apps/api/src/config.ts` | `WorkspaceStore` | WorkspaceRepository |
| `apps/api/src/modules/routing/routing.service.ts` | `WorkspaceStore` | WorkspaceRepository |
| `apps/api/src/modules/versions/versions.service.ts` | `WorkspaceStore` | WorkspaceRepository |
| `apps/api/src/modules/policies/policies.repository.ts` | `WorkspaceStore` | PoliciesRepository |
| `apps/api/src/modules/agents/agents.repository.ts` | `WorkspaceStore` | AgentRepository |
| `apps/api/src/modules/runs/run.repository.ts` | `WorkspaceStore` | RunRepository |
| `apps/api/src/modules/skills/skills.repository.ts` | `WorkspaceStore` | SkillRepository |
| `apps/api/src/modules/flows/flows.repository.ts` | `WorkspaceStore` | FlowRepository |
| `apps/api/src/modules/runs/runs.service.ts` | `WorkspaceStore` | RunRepository |
| `apps/api/src/modules/runtime/runs-stream.controller.ts` | `WorkspaceStore` | RunRepository |
| `apps/api/src/modules/workspaces/workspaces.repository.ts` | `WorkspaceStore` | WorkspaceRepository |
| `apps/api/src/modules/runtime/run-queue.service.ts` | `WorkspaceStore` | RunRepository |
| `apps/api/src/modules/runtime/agent-executor.service.ts` | `WorkspaceStore` | AgentRepository |
| `apps/api/src/modules/export/export.controller.ts` | `WorkspaceStore` | (export-only, keep DualFormatStore for file output) |

---

## Grep command to find remaining usages

```bash
grep -r "workspace-store\|WorkspaceStore" apps/ packages/ \
  --include='*.ts' \
  --exclude-dir='node_modules' \
  -l
```

## CI check (add to pre-commit or CI pipeline)

```bash
# Fail if any non-export file still imports from workspace-store
IMPORTS=$(grep -r "from.*workspace-store" apps/ --include='*.ts' -l | grep -v '.deprecated.')
if [ -n "$IMPORTS" ]; then
  echo "ERROR: workspace-store imports found (F0-08 not complete):"
  echo "$IMPORTS"
  exit 1
fi
```
