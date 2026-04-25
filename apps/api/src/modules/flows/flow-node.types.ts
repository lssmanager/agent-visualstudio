/**
 * flow-node.types.ts
 * Declaración canónica de todos los tipos de nodo que puede contener un Flow.
 *
 * Inspirado en:
 *   - LangGraph  → StateGraph nodes / conditional edges
 *   - n8n        → INodeTypeDescription, NodeConnectionType
 *   - Flowise    → INodeData, INodeParams
 *   - CrewAI     → Task / Agent roles
 *   - AutoGen    → AssistantAgent / GroupChatManager
 *   - Semantic Kernel → KernelPlugin step
 */

// ─── Node kind enum ────────────────────────────────────────────────────────────
export const FLOW_NODE_KINDS = [
  'Trigger',
  'Agent',
  'SubAgent',
  'SupervisorNode',
  'Tool',
  'Condition',
  'Approval',
  'End',
  'N8nWebhook',
  'N8nWorkflow',
  'LLMStep',
  'HumanInLoop',
  'RouterNode',
  'MergeNode',
  'LoopNode',
  'Note',
] as const;

export type FlowNodeKind = typeof FLOW_NODE_KINDS[number];

// ─── Node colour / icon hint (UI only) ────────────────────────────────────────
export const FLOW_NODE_STYLE: Record<FlowNodeKind, { color: string; icon: string }> = {
  Trigger:        { color: '#22c55e', icon: 'zap' },
  Agent:          { color: '#6366f1', icon: 'user' },
  SubAgent:       { color: '#818cf8', icon: 'user-cog' },
  SupervisorNode: { color: '#f59e0b', icon: 'crown' },
  Tool:           { color: '#14b8a6', icon: 'wrench' },
  Condition:      { color: '#f97316', icon: 'git-branch' },
  Approval:       { color: '#ec4899', icon: 'check-square' },
  End:            { color: '#ef4444', icon: 'flag' },
  N8nWebhook:     { color: '#e76e50', icon: 'webhook' },
  N8nWorkflow:    { color: '#e76e50', icon: 'workflow' },
  LLMStep:        { color: '#a855f7', icon: 'cpu' },
  HumanInLoop:    { color: '#0ea5e9', icon: 'hand' },
  RouterNode:     { color: '#64748b', icon: 'shuffle' },
  MergeNode:      { color: '#64748b', icon: 'merge' },
  LoopNode:       { color: '#84cc16', icon: 'repeat' },
  Note:           { color: '#94a3b8', icon: 'sticky-note' },
};

// ─── Connection port types ────────────────────────────────────────────────────
export type PortType = 'data' | 'control' | 'approval' | 'error';

export interface FlowPort {
  id: string;
  label?: string;
  type: PortType;
}

// ─── Per-kind configuration schemas ──────────────────────────────────────────
export interface TriggerConfig {
  triggerType: 'manual' | 'webhook' | 'schedule' | 'event';
  webhookPath?: string;
  schedule?: string;
  eventName?: string;
}

export interface AgentConfig {
  agentId: string;
  workspaceId?: string;
  systemPromptOverride?: string;
  maxIterations?: number;
}

export interface SubAgentConfig extends AgentConfig {
  parentAgentId: string;
  delegatedTask?: string;
}

export interface SupervisorConfig {
  supervisorAgentId: string;
  subordinateAgentIds: string[];
  selectionStrategy: 'round-robin' | 'llm-pick' | 'priority';
  maxRounds?: number;
}

export interface ToolConfig {
  toolName: string;
  skillId?: string;
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
}

export interface ConditionConfig {
  expression: string;
  trueLabel?: string;
  falseLabel?: string;
}

export interface ApprovalConfig {
  approverRoles: string[];
  timeoutSeconds?: number;
  onTimeout: 'reject' | 'approve' | 'escalate';
  message?: string;
}

export interface N8nWebhookConfig {
  n8nWorkflowId: string;
  webhookUrl: string;
  method?: 'GET' | 'POST';
  bodyTemplate?: Record<string, unknown>;
  waitForResponse?: boolean;
  responseTimeoutMs?: number;
}

export interface N8nWorkflowConfig extends N8nWebhookConfig {
  triggerNodeName?: string;
}

export interface LLMStepConfig {
  model: string;
  systemPrompt?: string;
  userPromptTemplate?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface HumanInLoopConfig {
  question: string;
  choices?: string[];
  timeoutSeconds?: number;
  defaultChoice?: string;
}

export interface RouterConfig {
  routes: { label: string; condition: string }[];
}

export interface LoopConfig {
  iterateOver: string;
  maxIterations?: number;
}

// ─── Union discriminated by kind ─────────────────────────────────────────────
export type FlowNodeConfig =
  | ({ kind: 'Trigger' }        & TriggerConfig)
  | ({ kind: 'Agent' }          & AgentConfig)
  | ({ kind: 'SubAgent' }       & SubAgentConfig)
  | ({ kind: 'SupervisorNode' } & SupervisorConfig)
  | ({ kind: 'Tool' }           & ToolConfig)
  | ({ kind: 'Condition' }      & ConditionConfig)
  | ({ kind: 'Approval' }       & ApprovalConfig)
  | ({ kind: 'End' }            & { exitCode?: number; message?: string })
  | ({ kind: 'N8nWebhook' }     & N8nWebhookConfig)
  | ({ kind: 'N8nWorkflow' }    & N8nWorkflowConfig)
  | ({ kind: 'LLMStep' }        & LLMStepConfig)
  | ({ kind: 'HumanInLoop' }    & HumanInLoopConfig)
  | ({ kind: 'RouterNode' }     & RouterConfig)
  | ({ kind: 'MergeNode' }      & Record<string, never>)
  | ({ kind: 'LoopNode' }       & LoopConfig)
  | ({ kind: 'Note' }           & { text: string });

// ─── Canonical node record (persisted in flows.nodes[]) ──────────────────────
export interface FlowNode {
  id: string;
  kind: FlowNodeKind;
  label?: string;
  position: { x: number; y: number };
  config: FlowNodeConfig;
  _ui?: {
    status?: 'idle' | 'running' | 'done' | 'error' | 'pending_approval';
    tokensUsed?: number;
    costUsd?: number;
    durationMs?: number;
  };
}

// ─── Canonical edge record ────────────────────────────────────────────────────
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  type?: PortType;
}

// ─── Palette descriptor (used by the node palette UI) ────────────────────────
export interface FlowNodePaletteEntry {
  kind: FlowNodeKind;
  label: string;
  description: string;
  color: string;
  icon: string;
  group: 'trigger' | 'agent' | 'integration' | 'control' | 'utility';
}

export const FLOW_NODE_PALETTE: FlowNodePaletteEntry[] = [
  { kind: 'Trigger',        label: 'Trigger',       description: 'Starts the flow',                      color: FLOW_NODE_STYLE.Trigger.color,        icon: FLOW_NODE_STYLE.Trigger.icon,        group: 'trigger' },
  { kind: 'Agent',          label: 'Agent',         description: 'Assigns work to an agent',             color: FLOW_NODE_STYLE.Agent.color,          icon: FLOW_NODE_STYLE.Agent.icon,          group: 'agent' },
  { kind: 'SubAgent',       label: 'SubAgent',      description: 'Delegates to a sub-agent',             color: FLOW_NODE_STYLE.SubAgent.color,       icon: FLOW_NODE_STYLE.SubAgent.icon,       group: 'agent' },
  { kind: 'SupervisorNode', label: 'Supervisor',    description: 'Orchestrates multiple agents',         color: FLOW_NODE_STYLE.SupervisorNode.color, icon: FLOW_NODE_STYLE.SupervisorNode.icon, group: 'agent' },
  { kind: 'Tool',           label: 'Tool',          description: 'Invokes a skill/tool directly',        color: FLOW_NODE_STYLE.Tool.color,           icon: FLOW_NODE_STYLE.Tool.icon,           group: 'integration' },
  { kind: 'N8nWebhook',     label: 'n8n Webhook',   description: 'Triggers an n8n workflow via webhook', color: FLOW_NODE_STYLE.N8nWebhook.color,     icon: FLOW_NODE_STYLE.N8nWebhook.icon,     group: 'integration' },
  { kind: 'N8nWorkflow',    label: 'n8n Workflow',  description: 'Runs a full n8n workflow',             color: FLOW_NODE_STYLE.N8nWorkflow.color,    icon: FLOW_NODE_STYLE.N8nWorkflow.icon,    group: 'integration' },
  { kind: 'LLMStep',        label: 'LLM Step',      description: 'Direct LLM call with prompt template', color: FLOW_NODE_STYLE.LLMStep.color,        icon: FLOW_NODE_STYLE.LLMStep.icon,        group: 'agent' },
  { kind: 'Condition',      label: 'Condition',     description: 'Branches based on expression',         color: FLOW_NODE_STYLE.Condition.color,      icon: FLOW_NODE_STYLE.Condition.icon,      group: 'control' },
  { kind: 'RouterNode',     label: 'Router',        description: 'Multi-route conditional branch',       color: FLOW_NODE_STYLE.RouterNode.color,     icon: FLOW_NODE_STYLE.RouterNode.icon,     group: 'control' },
  { kind: 'LoopNode',       label: 'Loop',          description: 'Iterates over an array in context',    color: FLOW_NODE_STYLE.LoopNode.color,       icon: FLOW_NODE_STYLE.LoopNode.icon,       group: 'control' },
  { kind: 'MergeNode',      label: 'Merge',         description: 'Merges parallel branches',             color: FLOW_NODE_STYLE.MergeNode.color,      icon: FLOW_NODE_STYLE.MergeNode.icon,      group: 'control' },
  { kind: 'Approval',       label: 'Approval',      description: 'Waits for human approval',             color: FLOW_NODE_STYLE.Approval.color,       icon: FLOW_NODE_STYLE.Approval.icon,       group: 'control' },
  { kind: 'HumanInLoop',    label: 'Human-in-Loop', description: 'Pauses for human input / choice',      color: FLOW_NODE_STYLE.HumanInLoop.color,    icon: FLOW_NODE_STYLE.HumanInLoop.icon,    group: 'control' },
  { kind: 'End',            label: 'End',           description: 'Terminates the flow',                  color: FLOW_NODE_STYLE.End.color,            icon: FLOW_NODE_STYLE.End.icon,            group: 'utility' },
  { kind: 'Note',           label: 'Note',          description: 'Free-text annotation',                 color: FLOW_NODE_STYLE.Note.color,           icon: FLOW_NODE_STYLE.Note.icon,           group: 'utility' },
];
