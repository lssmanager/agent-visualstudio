/**
 * flow-node.types.ts
 * Discriminated union of all canvas node types.
 * Inspired by LangGraph StateGraph nodes, Flowise INodeData, n8n INode.
 */

export type FlowNodeKind =
  | 'trigger'
  | 'agent'
  | 'subagent'
  | 'supervisor'
  | 'skill'
  | 'tool'
  | 'condition'
  | 'handoff'
  | 'loop'
  | 'approval'
  | 'end'
  | 'n8n_webhook'
  | 'n8n_workflow';

// ─── Base ────────────────────────────────────────────────────────────────────
export interface BaseFlowNodeConfig {
  label?: string;
  description?: string;
}

// ─── Trigger ─────────────────────────────────────────────────────────────────
export interface TriggerNodeConfig extends BaseFlowNodeConfig {
  triggerType: 'manual' | 'schedule' | 'webhook' | 'event' | 'n8n';
  schedule?: string;      // cron
  webhookPath?: string;
  eventName?: string;
  n8nWorkflowId?: string;
}

// ─── Agent / Subagent / Supervisor ───────────────────────────────────────────
export interface AgentNodeConfig extends BaseFlowNodeConfig {
  agentId: string;
  agentName?: string;
  model?: string;
  systemPrompt?: string;
  skills?: string[];
  tools?: string[];
}

export interface SubAgentNodeConfig extends AgentNodeConfig {
  parentAgentId?: string;
  delegationContext?: string;
}

export interface SupervisorNodeConfig extends BaseFlowNodeConfig {
  agentId: string;
  agentName?: string;
  delegationMode: 'round_robin' | 'llm_router' | 'priority';
  maxIterations?: number;
  subAgentIds?: string[];
  systemPrompt?: string;
}

// ─── Tool / Skill ─────────────────────────────────────────────────────────────
export interface ToolNodeConfig extends BaseFlowNodeConfig {
  skillId?: string;
  toolId?: string;
  functionName?: string;
  parameters?: Record<string, unknown>;
}

// ─── Condition / Handoff / Loop ───────────────────────────────────────────────
export interface ConditionNodeConfig extends BaseFlowNodeConfig {
  expression: string;
  branches: string[];
}

export interface HandoffNodeConfig extends BaseFlowNodeConfig {
  targetAgentId: string;
  reason?: string;
  payload?: Record<string, unknown>;
}

export interface LoopNodeConfig extends BaseFlowNodeConfig {
  maxIterations: number;
  expression?: string;
  breakCondition?: string;
}

// ─── Approval ────────────────────────────────────────────────────────────────
export interface ApprovalNodeConfig extends BaseFlowNodeConfig {
  approvalRole: 'operator' | 'manager' | 'admin';
  timeoutMs?: number;
  message?: string;
  approvalPolicy?: 'any' | 'all' | 'majority';
}

// ─── End ─────────────────────────────────────────────────────────────────────
export interface EndNodeConfig extends BaseFlowNodeConfig {
  outcome: 'completed' | 'failed' | 'cancelled';
  summaryTemplate?: string;
}

// ─── n8n nodes ───────────────────────────────────────────────────────────────
export interface N8nWebhookNodeConfig extends BaseFlowNodeConfig {
  /** ID of the n8n workflow that owns this webhook */
  workflowId?: string;
  /** Path registered in n8n Webhook node, e.g. /my-hook */
  webhookPath: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Handlebars/Jinja-style template for the request payload */
  payloadTemplate?: string;
  /** Whether to wait for n8n execution to complete */
  waitForResponse?: boolean;
}

export interface N8nWorkflowNodeConfig extends BaseFlowNodeConfig {
  workflowId: string;
  /** Map of input keys from flow context to n8n input keys */
  inputMapping?: Record<string, string>;
  /** Map of n8n output keys to flow context keys */
  outputMapping?: Record<string, string>;
}

// ─── Discriminated union ──────────────────────────────────────────────────────
export type TypedFlowNodeConfig =
  | ({ kind: 'trigger' }      & TriggerNodeConfig)
  | ({ kind: 'agent' }        & AgentNodeConfig)
  | ({ kind: 'subagent' }     & SubAgentNodeConfig)
  | ({ kind: 'supervisor' }   & SupervisorNodeConfig)
  | ({ kind: 'skill' }        & ToolNodeConfig)
  | ({ kind: 'tool' }         & ToolNodeConfig)
  | ({ kind: 'condition' }    & ConditionNodeConfig)
  | ({ kind: 'handoff' }      & HandoffNodeConfig)
  | ({ kind: 'loop' }         & LoopNodeConfig)
  | ({ kind: 'approval' }     & ApprovalNodeConfig)
  | ({ kind: 'end' }          & EndNodeConfig)
  | ({ kind: 'n8n_webhook' }  & N8nWebhookNodeConfig)
  | ({ kind: 'n8n_workflow' } & N8nWorkflowNodeConfig);

/** Runtime connection rules — what can connect to what */
export const ALLOWED_EDGES: Record<FlowNodeKind, FlowNodeKind[]> = {
  trigger:      ['agent', 'supervisor', 'condition', 'n8n_webhook', 'n8n_workflow'],
  agent:        ['tool', 'skill', 'condition', 'handoff', 'approval', 'end', 'subagent', 'n8n_webhook'],
  subagent:     ['tool', 'skill', 'condition', 'handoff', 'approval', 'end'],
  supervisor:   ['subagent', 'agent', 'condition', 'end'],
  skill:        ['agent', 'subagent', 'supervisor', 'condition', 'end'],
  tool:         ['agent', 'subagent', 'supervisor', 'condition', 'end'],
  condition:    ['agent', 'subagent', 'supervisor', 'tool', 'skill', 'approval', 'end', 'loop'],
  handoff:      ['agent', 'supervisor', 'end'],
  loop:         ['agent', 'subagent', 'tool', 'skill', 'condition', 'end'],
  approval:     ['agent', 'supervisor', 'end'],
  end:          [],
  n8n_webhook:  ['agent', 'supervisor', 'condition', 'end'],
  n8n_workflow: ['agent', 'supervisor', 'condition', 'end'],
};
