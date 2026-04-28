/**
 * OpenClawChannelAdapter
 * 
 * Converts openclaw-fs write* functions into an IChannelAdapter-compatible
 * observer of RunStep completions.
 *
 * IMPORTANT — role clarification after Fase 3:
 *   openclaw-fs is NO LONGER the runtime execution engine.
 *   It is now a FILE-SYSTEM SERIALIZATION CHANNEL only.
 *   FlowExecutor drives execution; this adapter optionally mirrors
 *   run artifacts (agents, flows, skills) to the .openclaw/ directory
 *   so that legacy OpenClaw CLI tooling can still inspect the workspace.
 *
 * Usage:
 *   import { OpenClawChannelAdapter } from '@lssmanager/flow-engine';
 *   const adapter = new OpenClawChannelAdapter({ rootDir: process.cwd() });
 *   // Pass adapter.onStepComplete as FlowExecutorConfig.onStepComplete
 *   const executor = new FlowExecutor({ ..., onStepComplete: adapter.onStepComplete });
 */
import type { RunStep } from '../../core-types/src/run-spec.js';
import type { AgentSpec } from '../../core-types/src/agent-spec.js';
import type { FlowSpec } from '../../core-types/src/flow-spec.js';
import type { SkillSpec } from '../../core-types/src/skill-spec.js';

// Lazy import openclaw-fs to keep it optional — consumers who
// don’t use openclaw-fs don’t pay the import cost.
type OpenClawWriter = typeof import('../../openclaw-fs/src/writer.js');

export interface OpenClawChannelAdapterConfig {
  /** Root directory for .openclaw/ output. Defaults to process.cwd() */
  rootDir?: string;
  /**
   * Whether to write step outputs as individual files.
   * Default: false (only write on explicit sync calls)
   */
  writeStepsOnComplete?: boolean;
  /** Custom writer — injected for testing */
  writer?: Partial<OpenClawWriter>;
}

export class OpenClawChannelAdapter {
  private readonly rootDir: string;
  private readonly writeStepsOnComplete: boolean;
  private writer: OpenClawWriter | null = null;
  private writerLoading: Promise<OpenClawWriter> | null = null;

  constructor(config: OpenClawChannelAdapterConfig = {}) {
    this.rootDir = config.rootDir ?? process.cwd();
    this.writeStepsOnComplete = config.writeStepsOnComplete ?? false;
    if (config.writer) {
      // Partial writer for testing
      this.writer = config.writer as OpenClawWriter;
    }
  }

  /**
   * Lazily load openclaw-fs writer module.
   * Returns null if the module is not installed (optional dependency).
   */
  private async getWriter(): Promise<OpenClawWriter | null> {
    if (this.writer) return this.writer;
    if (this.writerLoading) return this.writerLoading;
    this.writerLoading = import('../../openclaw-fs/src/writer.js').then(
      (m) => {
        this.writer = m;
        return m;
      },
    );
    try {
      return await this.writerLoading;
    } catch {
      // openclaw-fs not available — channel is a no-op
      return null;
    }
  }

  /**
   * Callback compatible with FlowExecutorConfig.onStepComplete.
   * Optionally writes step outputs to .openclaw/ if writeStepsOnComplete is true.
   */
  onStepComplete = async (step: RunStep): Promise<void> => {
    if (!this.writeStepsOnComplete) return;
    const writer = await this.getWriter();
    if (!writer) return;
    // Steps don’t map directly to openclaw YAML entities — this is a hook
    // for subclasses or future extensions (e.g., writing a run-log.yaml).
    void step; // used via subclass override
  };

  /** Sync the full agent catalog to .openclaw/agents/ */
  async syncAgents(agents: AgentSpec[]): Promise<void> {
    const writer = await this.getWriter();
    if (!writer) return;
    writer.writeAllAgents(this.rootDir, agents);
  }

  /** Sync the full flow catalog to .openclaw/flows/ */
  async syncFlows(flows: FlowSpec[]): Promise<void> {
    const writer = await this.getWriter();
    if (!writer) return;
    writer.writeAllFlows(this.rootDir, flows);
  }

  /** Sync the full skill catalog to .openclaw/skills/ */
  async syncSkills(skills: SkillSpec[]): Promise<void> {
    const writer = await this.getWriter();
    if (!writer) return;
    writer.writeAllSkills(this.rootDir, skills);
  }

  /**
   * Full workspace sync: agents + flows + skills in one call.
   * Typically called on app startup or after a catalog reload.
   */
  async syncWorkspace(catalog: {
    agents: AgentSpec[];
    flows: FlowSpec[];
    skills: SkillSpec[];
  }): Promise<void> {
    await Promise.all([
      this.syncAgents(catalog.agents),
      this.syncFlows(catalog.flows),
      this.syncSkills(catalog.skills),
    ]);
  }
}
