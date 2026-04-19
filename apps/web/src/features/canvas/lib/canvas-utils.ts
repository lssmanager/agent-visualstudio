import type { FlowNodeType } from '../../../lib/types';

export interface NodeTemplate {
  type: FlowNodeType;
  label: string;
  icon: string;
  color: string;
  defaultConfig: Record<string, unknown>;
}

export const NODE_TEMPLATES: NodeTemplate[] = [
  { type: 'trigger', label: 'Trigger', icon: '⚡', color: '#2563eb', defaultConfig: { triggerType: 'manual' } },
  { type: 'agent', label: 'Agent', icon: '🤖', color: '#16a34a', defaultConfig: { agentId: '', model: '' } },
  { type: 'tool', label: 'Tool', icon: '🔧', color: '#7c3aed', defaultConfig: { skillId: '', functionName: '' } },
  { type: 'condition', label: 'Condition', icon: '🔀', color: '#ca8a04', defaultConfig: { expression: '', branches: ['true', 'false'] } },
  { type: 'approval', label: 'Approval', icon: '✅', color: '#d97706', defaultConfig: { approvers: [], timeout: 24 } },
  { type: 'end', label: 'End', icon: '⏹', color: '#4b5563', defaultConfig: { outcome: 'completed' } },
];

let nodeCounter = 0;

export function generateNodeId(type: string): string {
  nodeCounter += 1;
  return `${type}-${Date.now()}-${nodeCounter}`;
}

export function getNodeTemplate(type: FlowNodeType): NodeTemplate | undefined {
  return NODE_TEMPLATES.find((t) => t.type === type);
}
