import type { FlowNodeType } from '../../../lib/types';

export interface NodeTemplate {
  type: FlowNodeType;
  label: string;
  icon: string;
  color: string;
  defaultConfig: Record<string, unknown>;
}

export const NODE_TEMPLATES: NodeTemplate[] = [
  { type: 'trigger', label: 'Root', icon: '⚡', color: '#2563eb', defaultConfig: { triggerType: 'manual' } },
  {
    type: 'agent',
    label: 'Agent Node',
    icon: '🤖',
    color: '#16a34a',
    defaultConfig: { agentId: '', name: '', purpose: '', skills: [], tools: [] },
  },
  {
    type: 'subagent',
    label: 'Subagent Node',
    icon: '🧩',
    color: '#0d9488',
    defaultConfig: { agentId: '', name: '', purpose: '', skills: [], tools: [] },
  },
  { type: 'skill', label: 'Skill', icon: '⚙️', color: '#7c3aed', defaultConfig: { skillId: '' } },
  { type: 'tool', label: 'Tool', icon: '🔧', color: '#9333ea', defaultConfig: { toolId: '', functionName: '' } },
  {
    type: 'condition',
    label: 'Condition',
    icon: '🔀',
    color: '#ca8a04',
    defaultConfig: { expression: '', branches: ['true', 'false'] },
  },
  { type: 'handoff', label: 'Handoff', icon: '↗️', color: '#ea580c', defaultConfig: { targetAgentId: '', reason: '' } },
  {
    type: 'loop',
    label: 'Loop',
    icon: '🔁',
    color: '#0284c7',
    defaultConfig: { maxIterations: 3, expression: '' },
  },
  {
    type: 'approval',
    label: 'Approval',
    icon: '✅',
    color: '#0f766e',
    defaultConfig: { approvalRole: 'operator', timeoutMs: 300000 },
  },
  { type: 'end', label: 'End', icon: '⏹', color: '#4b5563', defaultConfig: { outcome: 'completed' } },
];

let nodeCounter = 0;

export function generateNodeId(type: string): string {
  nodeCounter += 1;
  return `${type}-${Date.now()}-${nodeCounter}`;
}

export function getNodeTemplate(type: FlowNodeType): NodeTemplate | undefined {
  return NODE_TEMPLATES.find((template) => template.type === type);
}
