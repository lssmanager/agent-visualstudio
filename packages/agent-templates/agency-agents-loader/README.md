# @agent-visualstudio/agency-agents-loader

Carga, parsea y mapea los ~130 agentes de [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) al formato de nodo canvas de `agent-visualstudio`.

## Instalación

Este paquete es parte del monorepo. Está disponible automáticamente como workspace:

```ts
import {
  loadAgentTemplate,
  loadCategoryAgents,
  listAgentsInCategory,
  mapTemplateToNodeConfig,
  AGENT_CATEGORIES,
} from '@agent-visualstudio/agency-agents-loader';
```

## API

### `loadAgentTemplate(category, slug)`

Carga un template individual por categoría y slug.

```ts
const template = await loadAgentTemplate('engineering', 'backend-architect');
console.log(template.name);         // "Backend Architect"
console.log(template.systemPrompt); // full role prompt
```

### `loadCategoryAgents(category)`

Carga todos los agentes de una categoría.

```ts
const agents = await loadCategoryAgents('design');
// → AgencyAgentTemplate[]
```

### `listAgentsInCategory(category)`

Lista los slugs disponibles sin cargar el contenido completo. Útil para el panel sidebar.

```ts
const slugs = await listAgentsInCategory('marketing');
// → ['content-strategist', 'seo-specialist', ...]
```

### `mapTemplateToNodeConfig(template)`

Convierte un template en un `AgentNodeConfig` listo para soltar en el canvas React Flow.

```ts
const nodeConfig = mapTemplateToNodeConfig(template);
// Drop en canvas: { id, type: 'agent', label, systemPrompt, skills, ... }
```

## Categorías disponibles

```ts
import { AGENT_CATEGORIES } from '@agent-visualstudio/agency-agents-loader';
// ['engineering', 'design', 'product', 'marketing', 'sales',
//  'finance', 'testing', 'strategy', 'support',
//  'project-management', 'integrations', 'game-development', 'specialized']
```

## Arquitectura

```
src/
├── index.ts      ← Public API (re-exports)
├── types.ts      ← AgencyAgentTemplate, AgentNodeConfig, AGENT_CATEGORIES
├── loader.ts     ← fetch desde GitHub raw / Contents API
├── parser.ts     ← YAML frontmatter + markdown body
└── mapper.ts     ← AgencyAgentTemplate → AgentNodeConfig
```

## Issues relacionados

- [#267](https://github.com/lssmanager/agent-visualstudio/issues/267) Integrar agency-agents como fuente de templates
- [#268](https://github.com/lssmanager/agent-visualstudio/issues/268) Crear mapper AgencyAgent → AgentNodeConfig  
- [#269](https://github.com/lssmanager/agent-visualstudio/issues/269) API REST `/api/agent-templates`
- [#270](https://github.com/lssmanager/agent-visualstudio/issues/270) UI: Agent Library panel
- [#271](https://github.com/lssmanager/agent-visualstudio/issues/271) Drag-and-drop al canvas
- [#272](https://github.com/lssmanager/agent-visualstudio/issues/272) Tests del loader
