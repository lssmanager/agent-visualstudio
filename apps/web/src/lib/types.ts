import type {
  CanonicalStudioState,
  CoreFileDiff,
  WorkspaceSpecCanonical,
} from '../../../../packages/core-types/src/studio-canonical';
import type { AgentSpec, FlowSpec, ProfileSpec, SkillSpec, WorkspaceSpec } from './types-base';

export type ChannelKind = 'telegram' | 'whatsapp' | 'discord' | 'webchat';

export interface ChannelRecord {
  id: string;
  workspaceId: string;
  kind: ChannelKind;
  name: string;
  status: 'idle' | 'provisioning' | 'active' | 'error';
  agentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LlmProviderRecord {
  id: string;
  workspaceId: string;
  provider: string;
  label: string;
  maskedKey: string;
  isDefault: boolean;
  createdAt: string;
}

export interface StudioStateResponse {
  workspace: WorkspaceSpec | null;
  agents: AgentSpec[];
  skills: SkillSpec[];
  flows: FlowSpec[];
  policies: Array<{ id: string; name: string }>;
  profiles: ProfileSpec[];
  compile: { artifacts: unknown[]; diagnostics: string[] };
  runtime: {
    health: { ok: boolean; [key: string]: unknown };
    diagnostics: Record<string, unknown>;
    sessions: { ok: boolean; payload?: unknown[] };
  };
  generatedAt: string;
}

export type CanonicalStudioStateResponse = CanonicalStudioState;
export type CoreFilesDiffResponse = { snapshotId?: string; diffs: CoreFileDiff[]; generatedAt?: string };
export type CoreFilesPreviewResponse = { snapshotId?: string; artifacts: unknown[]; diagnostics: string[]; generatedAt?: string };

export * from './types-base';
export type * from '../../../../packages/core-types/src/studio-canonical';
