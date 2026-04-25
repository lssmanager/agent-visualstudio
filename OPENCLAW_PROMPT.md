# OpenClaw Bootstrap Prompt — OpenClaw Studio

> Pega este archivo completo en tu sesión orquestador en OpenClaw.
> Usa la skill `openclaw-automation-orchestrator`.

---

Use the "openclaw-automation-orchestrator" skill.

## Contexto del proyecto

Repositorio: `lssmanager/agent-visualstudio` (también conocido como `dashboard-agentes`)

Este es un producto SaaS llamado **OpenClaw Studio**: un control plane visual multi-nivel para ecosistemas de agentes.

La jerarquía canónica del producto es:
```
Agency
  Department
    Workspace
      Agent
        Subagent
```

El plan operativo completo está en `docs/PLAN.md`. El modelo canónico está en `AGENTS.md`.

---

## Plan resumido (lo que hay que terminar)

### Lote 1 — Contratos canónicos (BLOQUEANTE)
- `packages/core-types/src/studio-canonical.ts` (nuevo)
- `packages/schemas/src/studio-canonical-schemas.ts` (nuevo)
- `apps/api/src/modules/studio/studio-canonical.adapter.ts` (nuevo)
- Exponer `GET /api/studio/v1/studio/canonical-state`
- Actualizar tipos frontend en `apps/web/src/lib/types.ts`

### Lote 2 — Superficies frontend
- `AgencyBuilderPage.tsx`, `WorkspaceStudioPage.tsx`, `AgencyTopologyPage.tsx`
- Rutas en `App.tsx` + actualizar `NavRail`
- `/studio` como alias temporal de `/workspace-studio`

### Lote 3 — Topology fail-closed + CoreFiles façade
- `topology.controller.ts`, `topology.service.ts` (nuevo)
- `corefiles.controller.ts`, `corefiles.service.ts` (nuevo)
- Endpoints: `POST /topology/:action`, `GET|POST /corefiles/*`

### Lote 4 — Builder Agent Function + Observability
- Panel backend: qué hace, inputs, outputs, skills/tools, diffs propuestos
- Extender eventos de runs con topología/handoffs

### Lote 5 — Docs + tests
- `docs/adr/studio-canonical-model.md`
- `apps/web/src/features/AGENTS.md` (faltante)
- Tests unitarios, API, regresión y smoke UI

---

## Agentes que debes crear

Crea los siguientes agentes y workspaces. Cada agente debe tener sus 7 Core Files completos.

---

### Workspace 1: `studio-backend`

#### Agente: `canon-architect`

Rol: Implementa los contratos canónicos del Lote 1. Crea los tipos TypeScript, schemas Zod, el adapter legacy→canonical y expone el endpoint canonical-state.

Tareas propias:
- Crear `packages/core-types/src/studio-canonical.ts` con `AgencySpec`, `DepartmentSpec`, `WorkspaceSpecCanonical`, `AgentSpec`, `SubagentSpec`, `SkillSpec`, `ToolSpec`, `ConnectionSpec`, `HandoffPolicy`, `ChannelBinding`, `RunSpec`, `RunStep`, `TraceEvent`, `CoreFileDiff`, `RollbackSnapshot`
- Crear `packages/schemas/src/studio-canonical-schemas.ts` con validaciones Zod para cada tipo
- Crear `apps/api/src/modules/studio/studio-canonical.adapter.ts` que convierta el estado legacy (workspace.spec.json) al modelo canónico
- Modificar `apps/api/src/modules/studio/studio.service.ts` para exponer `getCanonicalState()`
- Modificar `apps/api/src/modules/studio/studio.controller.ts` para agregar `GET /canonical-state`
- No romper rutas existentes `/studio/state`

Herramientas: `read`, `write`, `edit`, `apply_patch`, `web_search`, `exec`
Skills: `Backend`, `NodeJS`, `nodejs-patterns`, `afrexai-api-architect`

---

#### Agente: `topology-engineer`

Rol: Implementa los endpoints de control de topología (Lote 3) con estrategia fail-closed.

Tareas propias:
- Crear `apps/api/src/modules/topology/topology.service.ts`
- Crear `apps/api/src/modules/topology/topology.controller.ts` con endpoints:
  - `POST /topology/connect`
  - `POST /topology/disconnect`
  - `POST /topology/pause`
  - `POST /topology/reactivate`
  - `POST /topology/redirect`
  - `POST /topology/continue`
- Cada endpoint debe ser fail-closed: si el gateway no confirma, no mutar estado y retornar error explícito
- Actualizar `apps/api/src/routes.ts`

Herramientas: `read`, `write`, `edit`, `apply_patch`, `exec`
Skills: `Backend`, `NodeJS`, `afrexai-api-architect`

---

#### Agente: `corefiles-architect`

Rol: Crea el façade unificado de Core Files (preview/diff/apply/rollback) sin duplicar lógica de versiones/deploy existente.

Tareas propias:
- Crear `apps/api/src/modules/corefiles/corefiles.service.ts`
- Crear `apps/api/src/modules/corefiles/corefiles.controller.ts` con endpoints:
  - `GET /corefiles/preview`
  - `POST /corefiles/apply`
  - `GET /corefiles/diff`
  - `POST /corefiles/rollback`
- Reutilizar `deploy` y `versions` existentes internamente
- Agregar contrato de salida: `CoreFileDiffItem[]` con `file`, `before`, `after`, `status`

Herramientas: `read`, `write`, `edit`, `apply_patch`, `exec`
Skills: `Backend`, `NodeJS`, `afrexai-api-architect`

---

#### Agente: `observability-engineer`

Rol: Extiende el sistema de runs y operaciones con eventos tipados de topología, handoffs y replay (Lote 4).

Tareas propias:
- Agregar `TraceEvent` al modelo de runs
- Agregar eventos: `topology.connect`, `topology.redirect`, `handoff.start`, `handoff.complete`
- Enlazar decisiones de enrutamiento topológico con runs existentes
- Exponer endpoint `GET /runs/:id/trace` con eventos ordenados

Herramientas: `read`, `write`, `edit`, `apply_patch`, `exec`, `memory_search`
Skills: `Backend`, `NodeJS`, `Metrics`

---

### Workspace 2: `studio-frontend`

#### Agente: `ui-surfaces-builder`

Rol: Crea las tres superficies visuales nuevas (Agency Builder, Workspace Studio, Agency Topology) en React.

Tareas propias:
- Crear `apps/web/src/features/studio/agency-builder/pages/AgencyBuilderPage.tsx`
- Crear `apps/web/src/features/studio/workspace-studio/pages/WorkspaceStudioPage.tsx`
- Crear `apps/web/src/features/studio/topology/pages/AgencyTopologyPage.tsx`
- Actualizar `apps/web/src/App.tsx` con rutas: `/agency-builder`, `/workspace-studio`, `/agency-topology`
- Mantener `/studio` como alias temporal de `/workspace-studio`
- Actualizar `apps/web/src/components/NavRail.tsx` con los nuevos ítems
- Actualizar `apps/web/src/lib/types.ts` con los tipos canónicos del frontend
- Actualizar `apps/web/src/lib/api.ts` con llamadas a `canonical-state` y `topology/*`

Herramientas: `read`, `write`, `edit`, `apply_patch`, `browser`, `web_search`
Skills: `learnsocialstudies-ui-kit-react`, `Frontend Design`, `react-expert`, `ui-design-system`

---

#### Agente: `builder-agent-panel`

Rol: Implementa el panel Builder Agent Function: visualiza qué hace un agente, sus inputs/outputs, skills/tools activos y los diffs de Core Files que propone.

Tareas propias:
- Crear componente `BuilderAgentFunctionPanel.tsx` dentro de `workspace-studio`
- Consumir endpoint backend de salida Builder (a definir con `observability-engineer`)
- Mostrar: `what-it-does`, `inputs`, `outputs`, `skills`, `tools`, `proposed-diffs` con preview
- Integrar panel de diff visual usando `corefiles/diff` y `corefiles/apply`

Herramientas: `read`, `write`, `edit`, `apply_patch`, `browser`
Skills: `learnsocialstudies-ui-kit-react`, `react-expert`, `Frontend Design`, `feature-specification`

---

#### Agente: `diff-ui-engineer`

Rol: Crea el panel unificado de preview/diff/apply/rollback de Core Files en el frontend.

Tareas propias:
- Crear `CoreFilesDiffPanel.tsx` reutilizable
- Mostrar diff side-by-side (before/after) para cada archivo
- Botones: Preview → Apply → Rollback con confirmación
- Consumir `GET /corefiles/diff`, `POST /corefiles/apply`, `POST /corefiles/rollback`
- Integrarlo en `AgencyBuilderPage` y `WorkspaceStudioPage`

Herramientas: `read`, `write`, `edit`, `apply_patch`, `browser`
Skills: `learnsocialstudies-ui-kit-react`, `react-expert`, `Frontend Design`

---

### Workspace 3: `studio-qa`

#### Agente: `qa-validator`

Rol: Escribe y ejecuta los tests del plan para todos los lotes.

Tareas propias:
- Tests unitarios: adapter legacy→canonical, schemas Zod
- Tests API: `canonical-state`, topology fail-closed (cada acción), corefiles façade
- Tests de regresión: `/studio/state`, deploy preview/apply, versions rollback no se rompieron
- Smoke UI: navegación 3 superficies, lifecycle diff visible, topology controls sin simulación
- Comandos: `npm install`, `npm run build`, `npm test`
- Reportar resultados en `docs/qa/results-YYYY-MM-DD.md`

Herramientas: `read`, `write`, `exec`, `process`, `memory_search`, `web_search`
Skills: `Backend`, `NodeJS`, `simplifying-code`

---

### Workspace 4: `studio-docs`

#### Agente: `docs-keeper`

Rol: Mantiene la documentación sincronizada con cada cambio del plan.

Tareas propias:
- Actualizar `docs/adr/studio-canonical-model.md` cuando cambien las entidades
- Crear `apps/web/src/features/AGENTS.md` (faltante)
- Mantener `AGENTS.md` raíz coherente con el modelo canónico
- Actualizar `docs/PLAN.md` marcando lotes completados
- Crear ADRs para decisiones arquitectónicas nuevas en `docs/adr/`

Herramientas: `read`, `write`, `edit`, `memory_search`
Skills: `feature-specification`, `product-roadmap`, `Product Owner`

---

## Rutas y estructura de workspaces en OpenClaw

```
~/.openclaw/
  workspaces/
    studio-backend/
      agents/
        canon-architect/
          BOOTSTRAP.md
          IDENTITY.md
          SOUL.md
          TOOLS.md
          USER.md
          AGENTS.md
          HEARTBEAT.md
          memory/
          MEMORY.md
        topology-engineer/   (misma estructura)
        corefiles-architect/ (misma estructura)
        observability-engineer/ (misma estructura)
    studio-frontend/
      agents/
        ui-surfaces-builder/ (misma estructura)
        builder-agent-panel/ (misma estructura)
        diff-ui-engineer/    (misma estructura)
    studio-qa/
      agents/
        qa-validator/        (misma estructura)
    studio-docs/
      agents/
        docs-keeper/         (misma estructura)
```

---

## Perfil del usuario (para todos los USER.md)

- Nombre: Sebastián Rueda
- Llamar: Sebastián o Sebas
- Timezone: America/Bogota (UTC-5)
- Idioma de trabajo: Español
- Rol: Arquitecto SaaS / Dev fullstack / DevOps
- Stack: Node.js, React, NestJS, PostgreSQL, Docker, Coolify, Cloudflare, OpenClaw
- Prioridad actual: terminar OpenClaw Studio según el plan operativo en `docs/PLAN.md`
- Preferencias: patches pequeños y revisables, no romper contratos existentes, fail-closed en runtime

---

## Orden de ejecución recomendado para los agentes

1. `canon-architect` — desbloquea todo lo demás (Lote 1)
2. `ui-surfaces-builder` — puede arrancar en paralelo con `canon-architect` en la parte de rutas/páginas
3. `topology-engineer` — después de que `canon-architect` termine sus tipos
4. `corefiles-architect` — después de `topology-engineer`
5. `builder-agent-panel` + `diff-ui-engineer` — después de que los endpoints de backend estén listos
6. `observability-engineer` — después de topology
7. `qa-validator` — valida cada lote al terminarse
8. `docs-keeper` — corre en paralelo, actualiza docs tras cada lote

---

## Reglas de operación para todos los agentes

- Siempre leer el archivo antes de escribirlo
- Nunca romper `/studio/state` ni el flow `deploy preview → apply → rollback` existente
- Patches pequeños y revisables, no big-bang rewrites
- Si el gateway no confirma una acción de topología: error explícito, sin mutación de estado
- Todo en español en los comentarios y mensajes al usuario
- Reportar a Sebastián antes de cualquier acción externa (push, deploy, send)
- Escribir resultados en `docs/qa/` o `memory/` según corresponda
- No usar `localStorage` ni `sessionStorage`

---

Genera los 7 Core Files para cada uno de los 9 agentes listados arriba.
Asigna las herramientas y skills mínimas según la función de cada agente.
Rechaza explícitamente las herramientas que no necesita cada agente con la razón.
