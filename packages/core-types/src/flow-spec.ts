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

/** Canonical FlowEdge — uses source/target to match React Flow conventions
 *  and the internal contract expected by flow-executor and agent-executor. */
export interface FlowEdge {
  id?: string;
  /** Source node id */
  source: string;
  /** Target node id */
  target: string;
  condition?: string;
  label?: string;
  /** @deprecated use source */
  from?: string;
  /** @deprecated use target */
  to?: string;
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
