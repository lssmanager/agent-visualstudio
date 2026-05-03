// THIS FILE WAS GENERATED — original content of types.ts moved here so the
// barrel re-export in types.ts stays clean.
// If you're adding new shared types, add them directly to types.ts.

export interface WorkspaceSpec {
  id: string;
  name: string;
  slug: string;
  profileId: string | null;
  defaultModel: string | null;
  agentCount?: number;
  flowCount?: number;
  skillCount?: number;
}

export interface AgentSpec {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
  model?: string;
  goal?: string;
  backstory?: string;
  tools?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface FlowSpec {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  triggerType?: string;
  status?: string;
  nodes?: unknown[];
  edges?: unknown[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SkillSpec {
  id: string;
  workspaceId: string;
  name: string;
  type: string;
  description?: string;
  config?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProfileSpec {
  id: string;
  name: string;
  category?: string;
  description?: string;
  agentCount?: number;
  flowCount?: number;
  skillCount?: number;
}

export interface StudioState {
  workspace: WorkspaceSpec | null;
  workspaces: WorkspaceSpec[];
  agents: AgentSpec[];
  flows: FlowSpec[];
  skills: SkillSpec[];
  profiles: ProfileSpec[];
}

// ── Flow Node types ───────────────────────────────────────────────────────────

/** Todos los tipos de nodo válidos en el canvas. Sincronizado con NODE_TYPES
 *  en EditableFlowCanvas.tsx y NODE_TEMPLATES en canvas-utils.ts */
export type FlowNodeType =
  | 'trigger'
  | 'agent'
  | 'subagent'
  | 'skill'
  | 'tool'
  | 'condition'
  | 'handoff'
  | 'loop'
  | 'approval'
  | 'end'
  | 'supervisor'
  | 'n8n_webhook'
  | 'n8n_workflow'
  | 'subflow';

/** Mapeado de entradas del canvas al payload del workflow n8n.
 *  Cada entrada es una expresión libre: puede ser un valor literal
 *  o una referencia tipo "{{output.fieldName}}". */
export type N8nInputMapping = Record<string, string>;

export interface N8nNodeConfig {
  /** ID del workflow en n8n (string numérico, ej: "42") */
  workflowId:   string;
  /** ID del webhook en n8n (solo si triggerType === 'webhook') */
  webhookPath?: string;
  /** Mapeo nombre_parametro → expresión de valor */
  inputMapping: N8nInputMapping;
}

export interface FlowNode {
  id:        string;
  /** Tipo de nodo — union exhaustivo de todos los tipos válidos del canvas */
  type:      FlowNodeType;
  label?:    string;
  position?: { x: number; y: number };
  /** Presente cuando type === 'n8n_workflow' o 'n8n_webhook' */
  n8n?:      N8nNodeConfig;
  /** Metadatos abiertos para otros tipos de nodo */
  config?:   Record<string, unknown>;
}
