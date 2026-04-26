import type { AgentHandoffRule, AgentSpec } from './agent-spec';
import type {
  AgencySpec,
  CanonicalNodeLevel,
  CanonicalStudioState,
  ConnectionSpec,
  CoreFileDiff,
  DepartmentSpec,
  ReplayMetadata,
  RuntimeCapabilityMatrix,
  SessionState,
} from './canonical-studio-state';
import type { RunSpec, RunStep } from './run-spec';
import type { SkillSpec } from './skill-spec';
import type { ToolSpec } from './tool-spec';
import type { VersionSnapshot } from './version-snapshot';
import type { WorkspaceSpec } from './workspace-spec';

export type WorkspaceSpecCanonical = WorkspaceSpec & {
  departmentId: string;
};

export interface SubagentSpec extends AgentSpec {
  kind?: 'subagent';
  parentAgentId: string;
}

export type HandoffPolicy = AgentHandoffRule;

export interface TraceEvent {
  id: string;
  type: string;
  timestamp: string;
  runId?: string;
  stepId?: string;
  level?: CanonicalNodeLevel;
  sourceId?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}

export type RollbackSnapshot = VersionSnapshot;

export type {
  AgencySpec,
  DepartmentSpec,
  AgentSpec,
  SkillSpec,
  ToolSpec,
  ConnectionSpec,
  RunSpec,
  RunStep,
  CoreFileDiff,
  CanonicalStudioState,
  ReplayMetadata,
  RuntimeCapabilityMatrix,
  SessionState,
};
