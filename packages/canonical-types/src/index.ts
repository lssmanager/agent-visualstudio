export type CanonicalId = string;

export interface SkillSpec {
  id: CanonicalId;
  name: string;
  description: string;
  profileImpact: 'low' | 'medium' | 'high';
  affectedCoreFiles?: CoreFileTarget[];
  tags?: string[];
  version?: string;
}

export interface ToolSpec {
  id: CanonicalId;
  name: string;
  description: string;
  kind: 'mcp' | 'webhook' | 'browser' | 'file_search' | 'db' | 'crm' | 'api' | 'custom';
  affectedCoreFiles?: CoreFileTarget[];
  config?: Record<string, unknown>;
  tags?: string[];
}

export interface SkillRef {
  skillId: CanonicalId;
  name: string;
  profileImpact: 'low' | 'medium' | 'high';
  inherited?: boolean;
  overridden?: boolean;
}

export interface ToolRef {
  toolId: CanonicalId;
  name: string;
  inherited?: boolean;
  overridden?: boolean;
}

export type CoreFileTarget =
  | 'BOOTSTRAP'
  | 'IDENTITY'
  | 'TOOLS'
  | 'USER'
  | 'HEARTBEAT'
  | 'MEMORY'
  | 'SOUL'
  | 'AGENT_MD'
  | 'AGENTS_MD';

export interface CoreFileDiffProposal {
  id: string;
  target: CoreFileTarget;
  operation: 'add' | 'modify' | 'remove';
  patch: string;
  reason: string;
  proposedBy: CanonicalId;
  proposedAt: string;
}

export interface ApplyResult {
  success: boolean;
  target: CoreFileTarget;
  snapshotId: string;
  appliedAt: string;
  appliedBy: CanonicalId;
}

export interface RollbackSnapshot {
  id: string;
  target: CoreFileTarget;
  content: string;
  createdAt: string;
  createdBy: CanonicalId;
  diffApplied?: string;
}

export type HandoffKind =
  | 'delegate'
  | 'request'
  | 'notify'
  | 'publish_result'
  | 'await_result'
  | 'escalate'
  | 'handoff_to_workspace'
  | 'handoff_to_department';

export interface HandoffPolicy {
  kind: HandoffKind;
  condition?: string;
  fallbackId?: CanonicalId;
  maxRetries?: number;
  timeoutMs?: number;
  loopProtection?: {
    maxDepth: number;
    maxReentry: number;
  };
}

export interface ConnectionSpec {
  id: CanonicalId;
  fromId: CanonicalId;
  toId: CanonicalId;
  kind: 'direct' | 'handoff' | 'redirect';
  policy: HandoffPolicy;
  payloadTypes: PayloadType[];
  status: 'active' | 'paused' | 'disconnected';
}

export type PayloadType =
  | 'message'
  | 'context'
  | 'memory'
  | 'search_results'
  | 'artifacts'
  | 'files'
  | 'images'
  | 'videos'
  | 'structured_payload'
  | 'completion_signal';

export interface ChannelBinding {
  id: CanonicalId;
  entityId: CanonicalId;
  entityKind: 'agency' | 'department' | 'workspace';
  channelType: 'inbound' | 'outbound' | 'bidirectional';
  protocol: string;
  config?: Record<string, unknown>;
}

export interface BuilderAgentProfile {
  whatItDoes: string;
  whatItDoesNot?: string;
  inputs: { name: string; type: string; required: boolean; description: string }[];
  outputs: { name: string; type: string; description: string }[];
  skills: SkillRef[];
  tools: ToolRef[];
  collaborators: {
    agentId: CanonicalId;
    name: string;
    relationship: 'delegates-to' | 'receives-from' | 'peers-with';
  }[];
  proposedCoreFileDiffs: CoreFileDiffProposal[];
  reusable: boolean;
  exclusiveToWorkspaceId?: CanonicalId;
}

export interface SubagentSpec {
  id: CanonicalId;
  name: string;
  kind: 'subagent';
  role?: string;
  skills?: SkillRef[];
  tools?: ToolRef[];
  status: 'active' | 'paused' | 'inactive';
  builderProfile?: BuilderAgentProfile;
}

export interface AgentSpec {
  id: CanonicalId;
  name: string;
  kind: 'agent';
  role?: string;
  skills?: SkillRef[];
  tools?: ToolRef[];
  subagents?: SubagentSpec[];
  status: 'active' | 'paused' | 'inactive';
  builderProfile?: BuilderAgentProfile;
}

export interface OrchestratorSpec {
  id: CanonicalId;
  name: string;
  level: 'agency' | 'department' | 'workspace';
  parentId: CanonicalId;
  dispatchPolicy: {
    receiveFrom: ('user' | 'agency' | 'department' | 'workspace')[];
    dispatchTo: ('department' | 'workspace' | 'agent')[];
    parallelDispatch: boolean;
    classificationStrategy?: string;
  };
  skills?: SkillRef[];
  tools?: ToolRef[];
  status: 'active' | 'paused' | 'inactive';
}

export interface WorkspaceSpec {
  id: CanonicalId;
  name: string;
  kind: 'workspace';
  canReceiveDirectMessages: true;
  orchestrator?: OrchestratorSpec;
  agents: AgentSpec[];
  skills?: SkillRef[];
  tools?: ToolRef[];
  connections?: ConnectionSpec[];
  channels?: ChannelBinding[];
  status: 'active' | 'paused' | 'inactive';
  flow?: FlowDefinition;
}

export interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type FlowNodeKind =
  | 'orchestrator'
  | 'agent'
  | 'subagent'
  | 'skill'
  | 'tool'
  | 'condition'
  | 'loop'
  | 'approval'
  | 'handoff'
  | 'start'
  | 'end';

export interface FlowNode {
  id: string;
  kind: FlowNodeKind;
  entityId?: CanonicalId;
  label: string;
  position: { x: number; y: number };
  config?: Record<string, unknown>;
  validationState?: 'valid' | 'warning' | 'error';
  validationMessages?: string[];
}

/**
 * FlowEdge — canonical edge type.
 * fix(tsc): added `from` and `to` as aliases for `fromNodeId`/`toNodeId`
 * to support legacy flow-engine code that accesses e.from / e.to directly.
 * Both naming conventions are accepted; canonical fields are fromNodeId/toNodeId.
 */
export interface FlowEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  /** @deprecated use fromNodeId. Kept for backward compat with flow-engine/agent-runner.ts */
  from?: string;
  /** @deprecated use toNodeId. Kept for backward compat with flow-engine/agent-runner.ts */
  to?: string;
  kind: 'sequence' | 'condition_true' | 'condition_false' | 'handoff' | 'loop_back';
  label?: string;
  handoffPolicy?: HandoffPolicy;
}

export interface DepartmentSpec {
  id: CanonicalId;
  name: string;
  kind: 'department';
  canReceiveDirectMessages: true;
  orchestrator?: OrchestratorSpec;
  workspaces: WorkspaceSpec[];
  skills?: SkillRef[];
  tools?: ToolRef[];
  connections?: ConnectionSpec[];
  channels?: ChannelBinding[];
  status: 'active' | 'paused' | 'inactive';
}

export interface AgencyPackPreset {
  id: string;
  name: string;
  description: string;
  version: string;
  editable: true;
  seeds: {
    departments?: Partial<DepartmentSpec>[];
    workspaces?: Partial<WorkspaceSpec>[];
    roles?: { name: string; skills: string[]; tools: string[] }[];
    taskPresets?: SopTaskPreset[];
    skillIds?: string[];
    toolIds?: string[];
  };
}

export interface SopTaskPreset {
  id: string;
  name: string;
  description: string;
  inputFields: string[];
  outputFields: string[];
  suggestedSkills: string[];
  suggestedTools: string[];
}

export interface AgencySpec {
  id: CanonicalId;
  name: string;
  kind: 'agency';
  canReceiveDirectMessages: true;
  orchestrator?: OrchestratorSpec;
  departments: DepartmentSpec[];
  skillsCatalog: SkillSpec[];
  toolsCatalog: ToolSpec[];
  connections?: ConnectionSpec[];
  channels?: ChannelBinding[];
  status: 'active' | 'paused' | 'inactive';
  presetPackId?: string;
}

export type TopologyAction =
  | 'connect'
  | 'disconnect'
  | 'pause'
  | 'reactivate'
  | 'redirect'
  | 'continue';

export type TopologyActionResult =
  | { success: true; action: TopologyAction; targetId: CanonicalId; timestamp: string }
  | {
      success: false;
      action: TopologyAction;
      targetId: CanonicalId;
      reason: 'unsupported_by_runtime' | 'runtime_error' | 'not_found' | 'loop_detected';
      detail?: string;
    };

export interface RuntimeCapabilities {
  runtimeName: string;
  supportsTopologyConnect: boolean;
  supportsTopologyDisconnect: boolean;
  supportsTopologyPause: boolean;
  supportsTopologyReactivate: boolean;
  supportsTopologyRedirect: boolean;
  supportsTopologyContinue: boolean;
  supportsReplay: boolean;
  supportsCheckpoints: boolean;
  supportsLoopProtection: boolean;
  supportsParallelDispatch: boolean;
}

export interface CanonicalStudioState {
  version: '1.0';
  resolvedAt: string;
  agency: AgencySpec | null;
  source: 'canonical' | 'legacy-adapted' | 'empty';
  runtimeCapabilities: RuntimeCapabilities;
}

export interface RunSpec {
  id: string;
  workspaceId?: CanonicalId;
  departmentId?: CanonicalId;
  agencyId?: CanonicalId;
  startedAt: string;
  endedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'replaying';
  totalCostUsd?: number;
  totalLatencyMs?: number;
  triggerKind: 'user_message' | 'scheduled' | 'handoff' | 'replay';
  replayFromCheckpointId?: string;
}

export type TraceEventKind =
  | 'tool_call'
  | 'llm_call'
  | 'message'
  | 'topology_action'
  | 'handoff'
  | 'redirect'
  | 'state_transition'
  | 'checkpoint'
  | 'condition_eval'
  | 'loop_iteration'
  | 'approval_request'
  | 'approval_response'
  | 'error'
  | 'retry';

export interface TraceEvent {
  id: string;
  runId: string;
  kind: TraceEventKind;
  timestamp: string;
  agentId?: CanonicalId;
  workspaceId?: CanonicalId;
  departmentId?: CanonicalId;
  latencyMs?: number;
  costUsd?: number;
  topologyAction?: TopologyAction;
  topologyResult?: TopologyActionResult;
  fromId?: CanonicalId;
  toId?: CanonicalId;
  handoffKind?: HandoffKind;
  handoffPayloadTypes?: PayloadType[];
  stateBefore?: Record<string, unknown>;
  stateAfter?: Record<string, unknown>;
  checkpointId?: string;
  checkpointData?: Record<string, unknown>;
  conditionExpression?: string;
  conditionResult?: boolean;
  loopIteration?: number;
  loopDepth?: number;
  errorCode?: string;
  errorMessage?: string;
  retryCount?: number;
  metadata?: Record<string, unknown>;
}

export * from './adapters/legacy-to-canonical';
export * from './validators/loop-detector';
