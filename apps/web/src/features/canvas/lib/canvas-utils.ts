import type { FlowNodeType } from '../../../lib/types';

export interface NodeTemplate {
  type: FlowNodeType;
  label: string;
  icon: string;
  color: string;
  defaultConfig: Record<string, unknown>;
  group?: 'core' | 'control' | 'hierarchy' | 'n8n';
}

export const NODE_TEMPLATES: NodeTemplate[] = [
  // ── Core ───────────────────────────────────────────────────────────────────
  {
    type: 'trigger', label: 'Root', icon: '⚡', color: '#2563eb', group: 'core',
    defaultConfig: { triggerType: 'manual' },
  },
  {
    type: 'agent', label: 'Agent Node', icon: '🤖', color: '#16a34a', group: 'core',
    defaultConfig: { agentId: '', name: '', purpose: '', skills: [], tools: [] },
  },
  {
    type: 'subagent', label: 'Subagent Node', icon: '🧩', color: '#0d9488', group: 'core',
    defaultConfig: { agentId: '', name: '', purpose: '', skills: [], tools: [] },
  },
  {
    type: 'skill', label: 'Skill', icon: '⚙️', color: '#7c3aed', group: 'core',
    defaultConfig: { skillId: '' },
  },
  {
    type: 'tool', label: 'Tool', icon: '🔧', color: '#9333ea', group: 'core',
    defaultConfig: { toolId: '', functionName: '' },
  },

  // ── Control ────────────────────────────────────────────────────────────────
  {
    type: 'condition', label: 'Condition', icon: '🔀', color: '#ca8a04', group: 'control',
    defaultConfig: { expression: '', branches: ['true', 'false'] },
  },
  {
    type: 'handoff', label: 'Handoff', icon: '↗️', color: '#ea580c', group: 'control',
    defaultConfig: { targetAgentId: '', reason: '' },
  },
  {
    type: 'loop', label: 'Loop', icon: '🔁', color: '#0284c7', group: 'control',
    defaultConfig: { maxIterations: 3, expression: '' },
  },
  {
    type: 'approval', label: 'Approval', icon: '✅', color: '#0f766e', group: 'control',
    defaultConfig: { approvalRole: 'operator', timeoutMs: 300000 },
  },
  {
    type: 'subflow', label: 'Sub-Flow', icon: '🔗', color: '#7c3aed', group: 'control',
    defaultConfig: { subFlowId: '', label: '', passthrough: false },
  },
  {
    type: 'end', label: 'End', icon: '⏹', color: '#4b5563', group: 'control',
    defaultConfig: { outcome: 'completed' },
  },

  // ── Hierarchy ──────────────────────────────────────────────────────────────
  {
    type: 'supervisor', label: 'Supervisor', icon: '👑', color: '#7c3aed', group: 'hierarchy',
    defaultConfig: {
      agentId: '', agentName: '', delegationMode: 'llm_router', maxIterations: 10, subAgentIds: [],
    },
  },

  // ── n8n ────────────────────────────────────────────────────────────────────
  {
    type: 'n8n_webhook', label: 'n8n Webhook', icon: '🔗', color: '#ea580c', group: 'n8n',
    defaultConfig: { webhookPath: '/hook', method: 'POST', waitForResponse: false },
  },
  {
    type: 'n8n_workflow', label: 'n8n Workflow', icon: '⚙️', color: '#d97706', group: 'n8n',
    defaultConfig: {
      label:         '',
      workflowId:    '',
      workflowName:  '',
      triggerMode:   'webhook',
      inputMapping:  {},
      outputMapping: {},
      waitForResult: false,
    },
  },
];

let nodeCounter = 0;

export function generateNodeId(type: string): string {
  nodeCounter += 1;
  return `${type}-${Date.now()}-${nodeCounter}`;
}

export function getNodeTemplate(type: FlowNodeType): NodeTemplate | undefined {
  return NODE_TEMPLATES.find((template) => template.type === type);
}

export function getNodeTemplatesByGroup(group: NodeTemplate['group']): NodeTemplate[] {
  return NODE_TEMPLATES.filter((t) => t.group === group);
}
