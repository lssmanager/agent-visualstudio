# Plan Maestro — Integración `agency-agents` como Templates Ready

**Repo objetivo:** `lssmanager/agent-visualstudio`  
**Fuente de templates:** `msitarzewski/agency-agents` (~130 agentes, 16 departments)  
**Estado actual (2026-05-03):** módulo `agency-templates` en API existe (controller + service + openapi), pero el package `agency-agents-loader` que importa **aún no está creado**.

---

## Diagnóstico del estado actual

El módulo `apps/api/src/modules/agency-templates/` ya tiene:

| Archivo | Estado | Notas |
|---|---|---|
| `agency-templates.controller.ts` | ✅ Completo | 4 endpoints Express registrados |
| `agency-templates.service.ts` | ✅ Completo | Carga en memoria al arrancar, 4 métodos |
| `agency-templates.openapi.yaml` | ✅ Completo | Spec documentada |

**Bloqueador principal:**  
`agency-templates.service.ts` importa desde:
```ts
import { buildAgency } from '../../../../../packages/agency-agents-loader/src';
```
→ El package `packages/agency-agents-loader/` **no existe en el repo**. Esto provoca error de compilación que bloquea todo el módulo.

---

## Arquitectura objetivo

```
packages/
└── agency-agents-loader/          ← PACKAGE A CREAR (bloqueador)
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts               ← re-exports públicos
    │   ├── types.ts               ← Agency, DepartmentWorkspace, AgentTemplate
    │   ├── loader.ts              ← buildAgency() — lee filesystem de agency-agents
    │   ├── parser.ts              ← parsea frontmatter YAML + body de cada .md
    │   └── mapper.ts             ← convierte raw → AgentTemplate tipado
    └── __tests__/
        └── loader.test.ts

apps/api/src/modules/agency-templates/   ← YA EXISTE, funciona al completar el package
    ├── agency-templates.controller.ts   ✅
    ├── agency-templates.service.ts      ✅
    └── agency-templates.openapi.yaml    ✅
```

### Estructura de `msitarzewski/agency-agents`

Los ~130 agentes están organizados en 16 carpetas de department. Cada agente es un `.md` con frontmatter YAML:

```yaml
---
name: Backend Architect
department: engineering
role: Senior Backend Architect
goal: Design scalable, maintainable backend systems
tools:
  - code_review
  - architecture_diagrams
---

You are a Senior Backend Architect with deep expertise in...
```

El loader debe leer este formato y producir objetos `AgentTemplate` tipados.

---

## Tipos TypeScript (src/types.ts)

```typescript
// packages/agency-agents-loader/src/types.ts

export interface AgentTemplate {
  /** slug único derivado del filename: "backend-architect" */
  slug: string;
  /** Nombre legible del frontmatter: "Backend Architect" */
  name: string;
  /** Department al que pertenece: "engineering" */
  department: string;
  /** Rol del agente */
  role: string;
  /** Objetivo/goal del agente */
  goal: string;
  /** System prompt completo (body del .md sin frontmatter) */
  systemPrompt: string;
  /** Herramientas declaradas en frontmatter */
  tools: string[];
  /** Backstory/contexto adicional si existe */
  backstory?: string;
}

export interface DepartmentWorkspace {
  /** ID slug del department: "engineering" */
  id: string;
  /** Label legible: "Engineering" */
  label: string;
  /** Número de agentes en este department */
  agentCount: number;
  /** Lista de agentes */
  agents: AgentTemplate[];
}

export interface Agency {
  /** Total de agentes cargados */
  totalAgents: number;
  /** Total de departments */
  totalDepartments: number;
  /** Lista de departments con sus agentes */
  departments: DepartmentWorkspace[];
  /** Timestamp de carga (ISO 8601) */
  loadedAt: string;
}
```

---

## Implementación del loader (src/loader.ts)

```typescript
// packages/agency-agents-loader/src/loader.ts
import * as fs   from 'fs';
import * as path from 'path';
import { parseAgentFile } from './parser';
import type { Agency, DepartmentWorkspace, AgentTemplate } from './types';

/**
 * Ruta al repo msitarzewski/agency-agents.
 * Estrategia: buscar en node_modules o en un path relativo configurable.
 * Si no está instalado como npm package, leer desde AGENCY_AGENTS_PATH env.
 */
function resolveAgencyAgentsRoot(): string {
  const envPath = process.env.AGENCY_AGENTS_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  // Fallback: node_modules/agency-agents (si se instala como package)
  const nmPath = path.resolve(
    __dirname,
    '../../../../../node_modules/agency-agents',
  );
  if (fs.existsSync(nmPath)) return nmPath;

  throw new Error(
    '[agency-agents-loader] Cannot locate agency-agents directory. ' +
    'Set AGENCY_AGENTS_PATH env var pointing to the msitarzewski/agency-agents clone.',
  );
}

/**
 * buildAgency() — función principal del package.
 * Lee el filesystem UNA sola vez y devuelve el objeto Agency completo.
 * Llamar al arrancar el servidor para cachear en memoria.
 */
export function buildAgency(): Agency {
  const root = resolveAgencyAgentsRoot();

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const deptDirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);

  const departments: DepartmentWorkspace[] = [];

  for (const deptName of deptDirs) {
    const deptPath = path.join(root, deptName);
    const mdFiles  = fs
      .readdirSync(deptPath)
      .filter((f) => f.endsWith('.md'));

    const agents: AgentTemplate[] = [];
    for (const mdFile of mdFiles) {
      const raw = fs.readFileSync(path.join(deptPath, mdFile), 'utf-8');
      const agent = parseAgentFile(raw, mdFile, deptName);
      if (agent) agents.push(agent);
    }

    if (agents.length > 0) {
      departments.push({
        id:         deptName,
        label:      capitalize(deptName.replace(/-/g, ' ')),
        agentCount: agents.length,
        agents,
      });
    }
  }

  const totalAgents = departments.reduce((acc, d) => acc + d.agentCount, 0);

  return {
    totalAgents,
    totalDepartments: departments.length,
    departments,
    loadedAt: new Date().toISOString(),
  };
}

function capitalize(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}
```

---

## Parser de frontmatter (src/parser.ts)

```typescript
// packages/agency-agents-loader/src/parser.ts
import type { AgentTemplate } from './types';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

/**
 * Parsea un archivo .md de agency-agents sin depender de librerías externas.
 * Retorna null si el archivo no tiene frontmatter válido.
 */
export function parseAgentFile(
  raw: string,
  filename: string,
  department: string,
): AgentTemplate | null {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return null;

  const [, frontRaw, body] = match;
  const front = parseSimpleYaml(frontRaw);

  const slug = filename.replace(/\.md$/, '').toLowerCase().replace(/\s+/g, '-');

  return {
    slug,
    name:        front.name        ?? slug,
    department:  front.department  ?? department,
    role:        front.role        ?? '',
    goal:        front.goal        ?? '',
    systemPrompt: body.trim(),
    tools:       parseTools(front.tools),
    backstory:   front.backstory   ?? undefined,
  };
}

function parseSimpleYaml(raw: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const lines = raw.split('\n');
  let currentKey: string | null = null;
  const listBuffer: string[] = [];

  for (const line of lines) {
    const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (keyMatch) {
      if (currentKey && listBuffer.length > 0) {
        result[currentKey] = [...listBuffer];
        listBuffer.length = 0;
      }
      currentKey = keyMatch[1];
      const val = keyMatch[2].trim();
      if (val) result[currentKey] = val;
      continue;
    }
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentKey) {
      listBuffer.push(listMatch[1].trim());
    }
  }

  if (currentKey && listBuffer.length > 0) {
    result[currentKey] = [...listBuffer];
  }

  return result;
}

function parseTools(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.split(',').map((t) => t.trim()).filter(Boolean);
}
```

---

## package.json del loader

```json
{
  "name": "agency-agents-loader",
  "version": "1.0.0",
  "description": "Loads msitarzewski/agency-agents templates into typed AgentTemplate objects",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0",
    "ts-jest": "^29.0.0"
  }
}
```

---

## index.ts (re-exports públicos)

```typescript
// packages/agency-agents-loader/src/index.ts
export { buildAgency }           from './loader';
export type { Agency, DepartmentWorkspace, AgentTemplate } from './types';
```

---

## Estrategia para los 130 agentes — 3 opciones

### Opción A — Git Submodule (RECOMENDADA para producción)

```bash
git submodule add https://github.com/msitarzewski/agency-agents \
  packages/agency-agents-data
echo "AGENCY_AGENTS_PATH=./packages/agency-agents-data" >> .env
```

**Ventajas:** siempre actualizado desde upstream, sin duplicar archivos.  
**Contra:** requiere `git submodule update --init` en cada clone.

### Opción B — Copiar los .md al repo (para desarrollo inmediato)

```bash
rsync -av \
  ../agency-agents/ \
  packages/agency-agents-data/ \
  --include="*/" --include="*.md" --exclude="*"
```

**Ventajas:** self-contained, sin dependencias externas.  
**Contra:** sync manual cuando upstream actualiza agentes.

### Opción C — Fetch en runtime desde GitHub API

El loader hace `GET https://api.github.com/repos/msitarzewski/agency-agents/contents/{dept}` y cachea en memoria. Sin datos locales.

**→ Para desarrollo inmediato: Opción B. Para producción: Opción A (submodule).**

---

## Plan de Issues a crear

### FX-01 — Crear package `agency-agents-loader` *(BLOQUEADOR)*

**Labels:** `phase:F6b`, `priority:blocker`, `area:backend` | **Estimado:** 4h

- [ ] `src/types.ts` con `AgentTemplate`, `DepartmentWorkspace`, `Agency`
- [ ] `src/parser.ts` parsea frontmatter sin librerías externas
- [ ] `src/loader.ts` con `buildAgency()` funcional
- [ ] `src/index.ts` re-exporta todo
- [ ] `package.json` con scripts build/test
- [ ] `pnpm build` compila sin errores

### FX-02 — Copiar/sync los 130 agentes al repo

**Labels:** `phase:F6b`, `priority:high`, `area:data` | **Estimado:** 2h | **Depende de:** FX-01

- [ ] `packages/agency-agents-data/` con los 16 directorios de departments
- [ ] `buildAgency()` retorna `totalAgents >= 100`
- [ ] `AGENCY_AGENTS_PATH` documentado en `.env.example`

### FX-03 — Registrar rutas en app.ts y validar endpoints

**Labels:** `phase:F6b`, `priority:high`, `area:backend` | **Estimado:** 2h | **Depende de:** FX-01, FX-02

- [ ] `registerAgencyTemplatesRoutes(router)` llamado en `apps/api/src/app.ts`
- [ ] `GET /api/agency-templates` retorna `totalAgents >= 100`
- [ ] `GET /api/agency-templates/departments` retorna 16 departments
- [ ] `GET /api/agency-templates/departments/engineering/agents` funcional
- [ ] 404 correcto para agente/department inexistente

### FX-04 — UI: Panel Agent Library en el canvas

**Labels:** `phase:F6b`, `priority:medium`, `area:frontend` | **Estimado:** 6h | **Depende de:** FX-03

- [ ] Sidebar con sección "Agent Library"
- [ ] Filtro por department (16 opciones)
- [ ] Búsqueda por nombre/rol
- [ ] Drawer con `systemPrompt` completo al hacer click

### FX-05 — Drag-and-drop desde Agent Library al canvas

**Labels:** `phase:F6b`, `priority:medium`, `area:frontend` | **Estimado:** 4h | **Depende de:** FX-04

- [ ] Drop en canvas crea nodo tipo `agent` (no un tipo nuevo)
- [ ] Nodo pre-relleno con `name`, `role`, `systemPrompt`, `tools`
- [ ] Nodo editable post-drop
- [ ] `dataTransfer.getData('application/agency-agent-slug')` como contrato

### FX-06 — Tests unitarios del loader

**Labels:** `phase:F6b`, `priority:low`, `area:testing` | **Estimado:** 2h | **Depende de:** FX-01

- [ ] `parseAgentFile` con frontmatter válido → `AgentTemplate` correcto
- [ ] `parseAgentFile` sin frontmatter → `null`
- [ ] `buildAgency()` con directorio real → `totalAgents > 0`
- [ ] `pnpm test` pasa al 100%

---

## Orden de ejecución

```
FX-01 → FX-02 → FX-03 → FX-04 → FX-05
         ↓
        FX-06 (paralelo con FX-02)
```

**Total estimado:** ~20h de desarrollo

---

## Criterio de cierre del Milestone F6b

- [ ] `GET /api/agency-templates` responde con `totalAgents >= 100` en staging
- [ ] Los 16 departments presentes en la respuesta
- [ ] Panel "Agent Library" visible en canvas sin errores de consola
- [ ] Drag-and-drop crea nodo de agente funcional
- [ ] Todos los tests del package pasan
- [ ] `tsc --noEmit` limpio

---

## Notas técnicas

**Por qué NO crear un tipo de nodo nuevo:** los templates se dropean como nodo `agent` existente para no duplicar código en el canvas renderer ni romper serialización de flows.

**Por qué el loader usa zero dependencias:** el parser de frontmatter está implementado con regex puro (sin `gray-matter` ni `js-yaml`) para mantener el package ligero y evitar conflictos en el monorepo.

**Caching:** `buildAgency()` corre una sola vez en el constructor de `AgencyTemplatesService`. Los ~130 agentes ocupan < 500 KB en memoria.
