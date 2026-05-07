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
  /** Agent to invoke when node.type === 'agent' | 'subagent' */
  agentId?: string;
  /** JS expression evaluated for condition nodes */
  conditionExpr?: string;
  /** Branch targets for condition nodes */
  branches?: { true?: string; false?: string };
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
  /** Override entry node; defaults to first node with type 'input' or nodes[0] */
  entryNodeId?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  tags?: string[]
  isEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}
