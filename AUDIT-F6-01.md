# AUDIT-F6-01 — Estado real del canvas React Flow

**Rama:** `feat/phase-F6-frontend-canvas`  
**Fase:** F6 — Frontend Canvas (AgentBuilder Surface)  
**Fecha:** 2026-05-03  
**Ruta canónica real:** `apps/web/src/features/canvas/` *(NO `apps/web/src/modules/studio/`)*

---

## A. Inventario de nodos (D-17)

| Nodo | Archivo | `nodeTypes` | NodeEditor | Estado |
|------|---------|-------------|------------|--------|
| `trigger` | TriggerNode.tsx ✓ | ✅ | ✅ triggerType/schedule/webhook/n8n | COMPLETO |
| `agent` | AgentNode.tsx ✓ | ✅ | ✅ agentId/agentName/model | COMPLETO |
| `subagent` | AgentNode.tsx ✓ (alias) | ✅ | ✅ (same branch) | COMPLETO |
| `supervisor` | SupervisorNode.tsx ✓ | ✅ | ✅ agentId/delegationMode/maxIterations | COMPLETO |
| `tool` | ToolNode.tsx ✓ | ✅ | ✅ skillId/functionName | COMPLETO |
| `skill` | ToolNode.tsx ✓ (alias) | ✅ | ✅ F6-01: mismo branch que tool | COMPLETO |
| `n8n_webhook` | N8nWebhookNode.tsx ✓ | ✅ | ✅ webhookPath/method/workflowId | COMPLETO |
| `n8n_workflow` | N8nWorkflowNode.tsx ✓ | ✅ | ✅ label/workflowId/triggerMode/mappings | COMPLETO |
| `condition` | ConditionNode.tsx ✓ | ✅ | ✅ via ConditionBuilder | COMPLETO |
| `handoff` | ConditionNode.tsx ✓ (alias) | ✅ | ✅ F6-01: targetAgentId/reason | COMPLETO |
| `loop` | ConditionNode.tsx ✓ (alias) | ✅ | ✅ F6-01: maxIterations/expression | COMPLETO |
| `approval` | ApprovalNode.tsx ✓ | ✅ | ✅ approvalRole/timeoutMs | COMPLETO |
| `end` | EndNode.tsx ✓ | ✅ | ✅ outcome | COMPLETO |
| `subflow` | **SubFlowNode.tsx ✓ (F6-01)** | ✅ **F6-01** | ✅ **F6-01** flowId/label/mappings | **CREADO** |

---

## B. Estado del EditableFlowCanvas

- **Versión activa:** `components/EditableFlowCanvas.tsx` (7.375 bytes)
- **Versión legacy (raíz):** convertida a re-export del canónico en F6-01
- Canvas conectado a `<ReactFlow nodeTypes={NODE_TYPES}>` ✅
- `applyNodeChanges` / `applyEdgeChanges` ✅
- `onNodesChange`, `onEdgesChange`, `onConnect` ✅
- `onDrop` + `onDragOver` ✅
- Save/load delegado al padre via `onChange(FlowSpec)` — **sin `PATCH /api/flows/:id` propio**

---

## C. Estado del NodeEditor

- 14 tipos cubiertos tras F6-01 (trigger, agent, subagent, supervisor, tool, skill, condition, handoff, loop, approval, end, n8n_webhook, n8n_workflow, subflow)
- Formularios reales (no stubs) en todos los tipos
- Sin conexión directa a API — persistencia delegada al padre

---

## D. Gaps resueltos en F6-01

| Gap | Resolución |
|-----|------------|
| `subflow` no existía | Creado `SubFlowNode.tsx` + template + formulario |
| `handoff` sin formulario | Agregado en NodeEditor |
| `loop` sin formulario | Agregado en NodeEditor |
| `skill` sin formulario | Agregado (mismo branch que `tool`) |
| Import roto `./FlowNodeCard` | Reemplazado por re-export canónico |
| Paletas incompatibles (2 sistemas) | `flow-node-palette.tsx` redirige a `NodePalette` canónica |

---

## E. Deuda técnica pendiente (para F6-02+)

- `zustand` NO instalado — requerirá `npm install zustand` si F6-02 usa store global
- `ConditionNode` usado como renderer de `handoff` y `loop` — considerar nodos visuales específicos en F6-03
- Save/load a `PATCH /api/flows/:id` no implementado en el canvas — pendiente F6-04
- `SupervisorNode`: tipo válido y canónico (no es deuda), documenta orquestación jerárquica F2a

---

## Ruta canónica oficial

```
apps/web/src/features/canvas/          ← BASE REAL
├── EditableFlowCanvas.tsx              ← re-export → components/ (legacy corregido)
├── flow-node-palette.tsx               ← re-export → components/NodePalette (legacy corregido)
├── components/
│   ├── EditableFlowCanvas.tsx          ← CANÓNICO ACTIVO
│   ├── NodeEditor.tsx                  ← panel de propiedades (14 tipos)
│   ├── NodePalette.tsx                 ← paleta canónica (grupos: core/control/hierarchy/n8n/subflow)
│   ├── CanvasToolbar.tsx
│   ├── ConditionBuilder.tsx
│   └── nodes/
│       ├── AgentNode.tsx
│       ├── ApprovalNode.tsx
│       ├── ConditionNode.tsx
│       ├── EndNode.tsx
│       ├── N8nWebhookNode.tsx
│       ├── N8nWorkflowNode.tsx
│       ├── SubFlowNode.tsx             ← NUEVO F6-01
│       ├── SupervisorNode.tsx
│       ├── ToolNode.tsx
│       └── TriggerNode.tsx
└── lib/
    └── canvas-utils.ts                 ← templates de 14 nodos
```

**TODOS los issues F6-02 a F6-14 deben usar `apps/web/src/features/canvas/` como ruta base.**
