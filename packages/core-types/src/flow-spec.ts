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
  | 'end';

export interface FlowNode {
  id: string;
  type: FlowNodeType | string;
  label?: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface FlowEdge {
  id?: string;
  from: string;
  to: string;
  condition?: string;
}

export interface FlowSpec {
  id: string;
  workspaceId?: string;
  name: string;
  description?: string;
  version?: string;
  trigger: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  tags?: string[];
  isEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}
