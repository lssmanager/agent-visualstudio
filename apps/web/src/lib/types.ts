import type {
  CanonicalStudioState,
  CoreFileDiff,
  WorkspaceSpecCanonical,
} from '../../../../packages/core-types/src/studio-canonical';
import type { AgentSpec, FlowSpec, ProfileSpec, SkillSpec, WorkspaceSpec } from './types-base';

// AUDIT-31: sincronizado con enum ChannelKind del schema Prisma
//           (AUDIT-30 añadió slack y teams al enum)
//           fix(channels-ui): añadido 'webhook' para completar el enum
export type ChannelKind =
  | 'telegram'
  | 'whatsapp'
  | 'discord'
  | 'webchat'
  | 'slack'
  | 'teams'
  | 'webhook';

// AUDIT-31: status alineado con enum ChannelStatus del schema Prisma:
//   ANTES: 'idle' | 'provisioning' | 'active' | 'error'    (incorrecto)
//   DESPUÉS: 'provisioned' | 'bound' | 'error' | 'offline'  (oracle de DB)
export interface ChannelRecord {
  id: string;
  workspaceId: string;
  kind: ChannelKind;
  name: string;
  status: 'provisioned' | 'bound' | 'error' | 'offline';
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

// ── Run types ────────────────────────────────────────────────────────────────
// Re-exportados desde core-types/run-spec para que todos los consumidores
// (RunsPage, RunTimeline, StepDetail, ApprovalPanel, etc.) importen
// desde el barrel unificado '@/lib/types'.
export type {
  RunSpec,
  RunStep,
  RunStatus,
  StepStatus,
  RunTrigger,
  RunStepTokenUsage,
} from '../../../../packages/core-types/src/run-spec';
