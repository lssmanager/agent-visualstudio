# @agent-visualstudio/agency-agents-loader

Carga, parsea y mapea los ~130 agentes de [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) al formato de nodo canvas de `agent-visualstudio`.

## Uso

```ts
import {
  loadAgentTemplate,
  loadCategoryAgents,
  listAgentsInCategory,
  mapTemplateToNodeConfig,
  AGENT_CATEGORIES,
} from '@agent-visualstudio/agency-agents-loader';

// Cargar un agente individual
const tpl = await loadAgentTemplate('engineering', 'backend-architect');
const node = mapTemplateToNodeConfig(tpl);
// node.type === 'agent' → compatible con React Flow sin nuevo tipo de nodo

// Cargar todos los agentes de una categoría
const designAgents = await loadCategoryAgents('design');

// Listar slugs (para sidebar sin cargar prompts completos)
const slugs = await listAgentsInCategory('marketing');
```

## Categorías

`engineering` · `design` · `product` · `marketing` · `sales` · `finance` ·
`testing` · `strategy` · `support` · `project-management` · `integrations` ·
`game-development` · `specialized`

## Arquitectura

```
src/
├── index.ts    ← API pública
├── types.ts    ← AgencyAgentTemplate, AgentNodeConfig, AGENT_CATEGORIES
├── loader.ts   ← fetch GitHub raw / Contents API
├── parser.ts   ← YAML frontmatter + markdown body
└── mapper.ts   ← AgencyAgentTemplate → AgentNodeConfig
```

## Issues
- [#267](https://github.com/lssmanager/agent-visualstudio/issues/267) · [#268](https://github.com/lssmanager/agent-visualstudio/issues/268) · [#269](https://github.com/lssmanager/agent-visualstudio/issues/269) · [#270](https://github.com/lssmanager/agent-visualstudio/issues/270) · [#271](https://github.com/lssmanager/agent-visualstudio/issues/271) · [#272](https://github.com/lssmanager/agent-visualstudio/issues/272)
