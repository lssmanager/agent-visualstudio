import type { RunSpec, RunTrigger } from '../../../../../packages/core-types/src';
import type { FlowSpec } from '../../../../../packages/core-types/src';
import { FlowExecutor, RunRepository, ApprovalQueue } from '../../../../../packages/run-engine/src';
import { LLMStepExecutor, type ModelProviderConfig, type SkillDescriptor } from '../../../../../packages/run-engine/src/llm-step-executor';
import { workspaceStore, studioConfig } from '../../config';

// ── Resolve model config from env / workspace config ──────────────────────
// Priority: workspace DB config > env vars > defaults
// Replace this function with a DB lookup when Prisma is wired.
function resolveModelConfig(): ModelProviderConfig {
  const provider = (process.env.DEFAULT_LLM_PROVIDER ?? 'openai') as ModelProviderConfig['provider'];
  const model = process.env.DEFAULT_LLM_MODEL ?? 'gpt-4o-mini';
  const apiKey = process.env.OPENAI_API_KEY ??
    process.env.QWEN_API_KEY ??
    process.env.DEEPSEEK_API_KEY ??
    process.env.OPENROUTER_API_KEY ?? '';
  const baseUrl = process.env.LLM_BASE_URL;

  if (!apiKey) {
    console.warn('[RunsService] No LLM API key found in env. Agent steps will fail.');
  }

  return { provider, model, apiKey, ...(baseUrl ? { baseUrl } : {}) };
}

// ── Resolve skills for the current workspace ──────────────────────────────
// Replace with a DB/Prisma lookup when skills table is available.
function resolveSkills(): SkillDescriptor[] {
  const n8nBase = process.env.N8N_BASE_URL;
  if (!n8nBase) return [];

  // Expose n8n as a generic webhook skill available to all agents
  return [
    {
      id: 'n8n_default',
      name: 'n8n Automation',
      description: 'Trigger an n8n workflow via webhook. Pass the workflow path and payload.',
      type: 'n8n_webhook',
      config: { webhookUrl: `${n8nBase}/webhook` },
    },
  ];
}

// ── Module-level singletons ────────────────────────────────────────────────
const runRepository = new RunRepository(studioConfig.workspaceRoot);
const approvalQueue = new ApprovalQueue();

// LLMStepExecutor replaces the former stub StepExecutor
const stepExecutor = new LLMStepExecutor({
  modelConfig: resolveModelConfig(),
  skills: resolveSkills(),
  systemPrompt: process.env.DEFAULT_SYSTEM_PROMPT,
});

let flowExecutor: FlowExecutor | null = null;

function getExecutor(): FlowExecutor {
  if (!flowExecutor) {
    const workspace = workspaceStore.readWorkspace();
    flowExecutor = new FlowExecutor({
      workspaceId: workspace?.id ?? 'default',
      repository: runRepository,
      stepExecutor,
      approvalQueue,
    });
  }
  return flowExecutor;
}

export class RunsService {
  findAll(): RunSpec[] {
    return runRepository.findAll();
  }

  findById(id: string): RunSpec | null {
    return runRepository.findById(id);
  }

  startRun(flowId: string, trigger?: RunTrigger): RunSpec {
    const flows = workspaceStore.listFlows();
    const flow = flows.find((f: FlowSpec) => f.id === flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }
    const runTrigger: RunTrigger = trigger ?? { type: 'manual' };
    return getExecutor().startRun(flow, runTrigger);
  }

  cancelRun(id: string): RunSpec | null {
    return getExecutor().cancelRun(id);
  }

  async approveStep(runId: string, stepId: string): Promise<RunSpec | null> {
    return getExecutor().resumeAfterApproval(runId, stepId, true);
  }

  async rejectStep(runId: string, stepId: string, reason?: string): Promise<RunSpec | null> {
    return getExecutor().resumeAfterApproval(runId, stepId, false, reason);
  }

  getTrace(id: string): RunSpec | null {
    return runRepository.findById(id);
  }

  getReplayMetadata(id: string) {
    const run = runRepository.findById(id);
    if (!run) return null;

    const metadata = (run.metadata ?? {}) as Record<string, unknown>;
    const topologyEvents = Array.isArray(metadata.topologyEvents) ? metadata.topologyEvents : [];
    const handoffs = Array.isArray(metadata.handoffs) ? metadata.handoffs : [];
    const redirects = Array.isArray(metadata.redirects) ? metadata.redirects : [];
    const stateTransitions = Array.isArray(metadata.stateTransitions) ? metadata.stateTransitions : [];

    return {
      topologyEvents,
      handoffs,
      redirects,
      stateTransitions,
      replay: {
        sourceRunId: typeof metadata.sourceRunId === 'string' ? metadata.sourceRunId : undefined,
        replayType: run.trigger?.type?.startsWith('replay:') ? run.trigger.type : undefined,
      },
    };
  }

  // ── Operations ─────────────────────────────────────────────────────────────

  replayRun(id: string): RunSpec {
    const original = runRepository.findById(id);
    if (!original) throw new Error(`Run not found: ${id}`);
    if (original.status !== 'completed' && original.status !== 'failed') {
      throw new Error('Can only replay completed or failed runs');
    }
    return this.startRun(original.flowId, { ...original.trigger, type: `replay:${original.trigger.type}` });
  }

  compareRuns(ids: string[]) {
    const runs = ids.map((id) => {
      const run = runRepository.findById(id);
      if (!run) throw new Error(`Run not found: ${id}`);
      return run;
    });

    const summaries = runs.map((run) => {
      const totalCost = run.steps.reduce((sum: number, s: { costUsd?: number }) => sum + (s.costUsd ?? 0), 0);
      const totalTokens = run.steps.reduce(
        (acc: { input: number; output: number }, s: { tokenUsage?: { input: number; output: number } }) => ({
          input: acc.input + (s.tokenUsage?.input ?? 0),
          output: acc.output + (s.tokenUsage?.output ?? 0),
        }),
        { input: 0, output: 0 },
      );
      return {
        id: run.id,
        flowId: run.flowId,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        totalCost,
        totalTokens,
        stepCount: run.steps.length,
      };
    });

    const diffs: Array<{ field: string; values: Record<string, unknown> }> = [];
    for (const field of ['status', 'stepCount', 'totalCost'] as const) {
      const values: Record<string, unknown> = {};
      summaries.forEach((s) => { values[s.id] = s[field]; });
      const unique = new Set(Object.values(values).map(String));
      if (unique.size > 1) diffs.push({ field, values });
    }

    return { runs: summaries, diffs };
  }

  getRunCost(id: string) {
    const run = runRepository.findById(id);
    if (!run) return null;

    const steps = run.steps.map((s: { id: string; nodeId: string; nodeType: string; agentId?: string; costUsd?: number; tokenUsage?: { input: number; output: number } }) => ({
      stepId: s.id,
      nodeId: s.nodeId,
      nodeType: s.nodeType,
      agentId: s.agentId,
      costUsd: s.costUsd ?? 0,
      tokenUsage: s.tokenUsage ?? { input: 0, output: 0 },
    }));

    const totalCost = steps.reduce((sum: number, s: { costUsd: number }) => sum + s.costUsd, 0);
    const totalTokens = steps.reduce(
      (acc: { input: number; output: number }, s: { tokenUsage: { input: number; output: number } }) => ({
        input: acc.input + s.tokenUsage.input,
        output: acc.output + s.tokenUsage.output,
      }),
      { input: 0, output: 0 },
    );

    return { runId: run.id, totalCost, totalTokens, steps };
  }

  getUsage(filters?: { from?: string; to?: string; groupBy?: string }) {
    let runs = runRepository.findAll();

    if (filters?.from) {
      const fromDate = new Date(filters.from).getTime();
      runs = runs.filter((r: RunSpec) => new Date(r.startedAt).getTime() >= fromDate);
    }
    if (filters?.to) {
      const toDate = new Date(filters.to).getTime();
      runs = runs.filter((r: RunSpec) => new Date(r.startedAt).getTime() <= toDate);
    }

    const groupBy = filters?.groupBy ?? 'flow';
    const groupMap = new Map<string, { cost: number; tokens: { input: number; output: number }; runs: number }>();

    for (const run of runs) {
      const key = groupBy === 'agent' ? 'by-agent'
        : groupBy === 'model' ? 'by-model'
        : run.flowId;

      if (!groupMap.has(key)) groupMap.set(key, { cost: 0, tokens: { input: 0, output: 0 }, runs: 0 });
      const entry = groupMap.get(key)!;

      for (const step of run.steps) {
        entry.cost += (step as { costUsd?: number }).costUsd ?? 0;
        entry.tokens.input += (step as { tokenUsage?: { input: number; output: number } }).tokenUsage?.input ?? 0;
        entry.tokens.output += (step as { tokenUsage?: { input: number; output: number } }).tokenUsage?.output ?? 0;
      }
      entry.runs += 1;
    }

    const groups = Array.from(groupMap.entries())
      .map(([key, data]) => ({ key, ...data }))
      .sort((a, b) => b.cost - a.cost);

    const totalCost = groups.reduce((s, g) => s + g.cost, 0);
    const totalTokens = groups.reduce(
      (acc, g) => ({ input: acc.input + g.tokens.input, output: acc.output + g.tokens.output }),
      { input: 0, output: 0 },
    );

    return { totalCost, totalTokens, totalRuns: runs.length, groups };
  }

  getUsageByAgent() {
    const runs = runRepository.findAll();
    const agentMap = new Map<string, { cost: number; tokens: { input: number; output: number }; steps: number }>();

    for (const run of runs) {
      for (const step of run.steps) {
        const agentId = (step as { agentId?: string }).agentId ?? 'unassigned';
        if (!agentMap.has(agentId)) agentMap.set(agentId, { cost: 0, tokens: { input: 0, output: 0 }, steps: 0 });
        const entry = agentMap.get(agentId)!;
        entry.cost += (step as { costUsd?: number }).costUsd ?? 0;
        entry.tokens.input += (step as { tokenUsage?: { input: number; output: number } }).tokenUsage?.input ?? 0;
        entry.tokens.output += (step as { tokenUsage?: { input: number; output: number } }).tokenUsage?.output ?? 0;
        entry.steps += 1;
      }
    }

    return Array.from(agentMap.entries())
      .map(([agentId, data]) => ({ agentId, ...data }))
      .sort((a, b) => b.cost - a.cost);
  }
}
