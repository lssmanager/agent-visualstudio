/**
 * hierarchy-orchestrator.test.ts
 *
 * Unit tests for HierarchyOrchestrator — F1a-03
 *
 * Verifica:
 *  1. executorFn debe devolver AgentExecutionResult (no string).
 *  2. executeWithRetry() persiste model/tokens/costUsd en completeStep().
 *  3. SubtaskResult.output es el string de respuesta, no el objeto completo.
 *  4. Si executorFn lanza, el RunStep queda en 'failed'.
 *  5. No se crean RunSteps con id='orchestrated-*' ni id=''.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentExecutionResult, AgentExecutorFn, SupervisorFn } from '../hierarchy-orchestrator.js';
import { HierarchyOrchestrator } from '../hierarchy-orchestrator.js';

// ─── Mock RunRepository ──────────────────────────────────────────────────────

const mockStep = { id: 'step-real-id-001' };

const mockRepo = {
  createRun:        vi.fn().mockResolvedValue({ id: 'run-001' }),
  startRun:         vi.fn().mockResolvedValue(undefined),
  failRun:          vi.fn().mockResolvedValue(undefined),
  completeRun:      vi.fn().mockResolvedValue(undefined),
  pauseRun:         vi.fn().mockResolvedValue(undefined),
  createStep:       vi.fn().mockResolvedValue(mockStep),
  completeStep:     vi.fn().mockResolvedValue(undefined),
  failStep:         vi.fn().mockResolvedValue(undefined),
  skipStep:         vi.fn().mockResolvedValue(undefined),
  createApproval:   vi.fn().mockResolvedValue({ id: 'approval-001' }),
  waitForApproval:  vi.fn().mockResolvedValue('approved'),
};

// Patch constructor to inject mockRepo instead of real PrismaClient
vi.mock('../../run-engine/src/run-repository.js', () => ({
  RunRepository: vi.fn().mockImplementation(() => mockRepo),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const singleAgentHierarchy = {
  id:    'agent-alpha',
  name:  'Alpha',
  level: 'agent' as const,
};

const twoAgentHierarchy = {
  id:       'workspace-root',
  name:     'Root',
  level:    'workspace' as const,
  children: [
    { id: 'agent-a', name: 'Agent A', level: 'agent' as const },
    { id: 'agent-b', name: 'Agent B', level: 'agent' as const },
  ],
};

const makePrisma = () => ({} as unknown as import('@prisma/client').PrismaClient);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeExecutorFn(partial?: Partial<AgentExecutionResult>): AgentExecutorFn {
  return vi.fn().mockResolvedValue({
    response:          'task done',
    model:             'openai/gpt-4o-mini',
    provider:          'openai',
    promptTokens:      120,
    completionTokens:  80,
    totalTokens:       200,
    costUsd:           0.00023,
    ...partial,
  } satisfies AgentExecutionResult);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.createRun.mockResolvedValue({ id: 'run-001' });
  mockRepo.createStep.mockResolvedValue(mockStep);
});

describe('HierarchyOrchestrator — AgentExecutionResult contract', () => {

  it('executorFn signature accepts Promise<AgentExecutionResult>', async () => {
    const executorFn = makeExecutorFn();
    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      executorFn,
      makePrisma(),
    );
    const result = await orch.orchestrate('ws-001', 'Do something');

    expect(result.status).toBe('completed');
    // The mock was called with the correct signature
    expect(executorFn).toHaveBeenCalledWith(
      'agent-alpha',
      expect.any(String),
      'Do something',
      undefined,
    );
  });

  it('completeStep() receives all LLM metadata from AgentExecutionResult', async () => {
    const executorFn = makeExecutorFn({
      model:             'anthropic/claude-3-haiku',
      provider:          'anthropic',
      promptTokens:      500,
      completionTokens:  300,
      totalTokens:       800,
      costUsd:           0.00112,
    });

    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      executorFn,
      makePrisma(),
    );
    await orch.orchestrate('ws-001', 'Summarize data');

    expect(mockRepo.completeStep).toHaveBeenCalledOnce();
    expect(mockRepo.completeStep).toHaveBeenCalledWith({
      stepId:           'step-real-id-001',
      output:           'task done',
      model:            'anthropic/claude-3-haiku',
      provider:         'anthropic',
      promptTokens:     500,
      completionTokens: 300,
      totalTokens:      800,
      costUsd:          0.00112,
    });
  });

  it('SubtaskResult.output is the response string, not the whole AgentExecutionResult object', async () => {
    const executorFn = makeExecutorFn({ response: 'final answer text' });
    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      executorFn,
      makePrisma(),
    );
    const result = await orch.orchestrate('ws-001', 'Task');

    const subtask = result.subtaskResults[0];
    expect(subtask).toBeDefined();
    expect(subtask.output).toBe('final answer text');       // string, not object
    expect(typeof subtask.output).toBe('string');
    // Verify it is NOT the full AgentExecutionResult shape
    expect(subtask.output).not.toHaveProperty('response');
    expect(subtask.output).not.toHaveProperty('promptTokens');
  });

  it('stepId in SubtaskResult matches the real Prisma RunStep id', async () => {
    const executorFn = makeExecutorFn();
    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      executorFn,
      makePrisma(),
    );
    const result = await orch.orchestrate('ws-001', 'Task');
    expect(result.subtaskResults[0].stepId).toBe('step-real-id-001');
  });

  it('RunStep status = failed when executorFn throws', async () => {
    const failingExecutor: AgentExecutorFn = vi.fn().mockRejectedValue(
      new Error('LLM unavailable'),
    );
    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      failingExecutor,
      makePrisma(),
      undefined,
      { maxRetries: 0 },  // no retries to keep test fast
    );
    const result = await orch.orchestrate('ws-001', 'Fail task');

    expect(result.status).toBe('failed');
    const subtask = result.subtaskResults[0];
    expect(subtask.status).toBe('failed');
    expect(subtask.error).toContain('LLM unavailable');

    // failStep must be called, completeStep must NOT
    expect(mockRepo.failStep).toHaveBeenCalledWith({
      stepId: 'step-real-id-001',
      error: 'LLM unavailable',
    });
    expect(mockRepo.completeStep).not.toHaveBeenCalled();
  });

  it('retries up to maxRetries times before failing', async () => {
    let calls = 0;
    const flakyExecutor: AgentExecutorFn = vi.fn().mockImplementation(() => {
      calls++;
      if (calls < 3) throw new Error(`attempt ${calls} failed`);
      return Promise.resolve({
        response: 'recovered',
        model: 'openai/gpt-4o-mini',
        provider: 'openai',
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
        costUsd: 0.000012,
      } satisfies AgentExecutionResult);
    });

    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      flakyExecutor,
      makePrisma(),
      undefined,
      { maxRetries: 3, retryBaseMs: 0 },
    );
    const result = await orch.orchestrate('ws-001', 'Flaky task');

    expect(result.status).toBe('completed');
    expect(calls).toBe(3);  // failed twice, succeeded on third
    expect(mockRepo.completeStep).toHaveBeenCalledOnce();
    expect(mockRepo.failStep).not.toHaveBeenCalled();
    expect(result.subtaskResults[0].retries).toBe(2); // attempt index starts at 0
  });

  it('parallel execution: each agent gets its own RunStep with real metadata', async () => {
    let stepCounter = 0;
    mockRepo.createStep.mockImplementation(() =>
      Promise.resolve({ id: `step-${++stepCounter}` })
    );

    const executorFn = makeExecutorFn();
    const orch = new HierarchyOrchestrator(
      twoAgentHierarchy,
      executorFn,
      makePrisma(),
      undefined,
      { parallel: true },
    );
    const result = await orch.orchestrate('ws-001', 'Parallel task');

    expect(result.status).toBe('completed');
    expect(result.subtaskResults).toHaveLength(2);

    // Both steps got real IDs (step-1, step-2), none is empty or 'orchestrated-*'
    const stepIds = result.subtaskResults.map((r) => r.stepId);
    expect(stepIds).not.toContain('');
    expect(stepIds.some((id) => id.startsWith('orchestrated-'))).toBe(false);

    // completeStep called twice, once per agent
    expect(mockRepo.completeStep).toHaveBeenCalledTimes(2);
  });

  it('optional LLM metadata fields (model/tokens) are passed through correctly when present', async () => {
    const executorFn = makeExecutorFn({
      model:             undefined,
      provider:          undefined,
      promptTokens:      undefined,
      completionTokens:  undefined,
      totalTokens:       undefined,
      costUsd:           undefined,
    });

    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      executorFn,
      makePrisma(),
    );
    await orch.orchestrate('ws-001', 'Minimal task');

    expect(mockRepo.completeStep).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId:  'step-real-id-001',
        output:  'task done',
        model:   undefined,
        costUsd: undefined,
      }),
    );
  });

  it('supervisor-guided decomposition routes tasks by agent id', async () => {
    // F2a-05c: decomposeTask() now uses parseDelegateBlocks() — mock must emit
    // ---DELEGATE--- blocks, not raw JSON. Detection covers both the legacy
    // 'Decompose' keyword (used in the task string) and 'Available agents'
    // (present in every decomposeTask() prompt after F2a-05b).
    const supervisorFn: SupervisorFn = vi.fn().mockImplementation(async (prompt: string) => {
      if (prompt.includes('Decompose') || prompt.includes('Available agents')) {
        return [
          '---DELEGATE---',
          'TO: agent-a',
          'TASK: Handle part A',
          '---END---',
          '---DELEGATE---',
          'TO: agent-b',
          'TASK: Handle part B',
          '---END---',
        ].join('\n');
      }
      return 'Consolidated result from supervisor';
    });

    let stepCounter = 0;
    mockRepo.createStep.mockImplementation(() =>
      Promise.resolve({ id: `step-${++stepCounter}` })
    );

    const executorFn = makeExecutorFn();
    const orch = new HierarchyOrchestrator(
      twoAgentHierarchy,
      executorFn,
      makePrisma(),
      supervisorFn,
    );
    const result = await orch.orchestrate('ws-001', 'Decompose: complex task');

    expect(result.status).toBe('completed');
    // Supervisor returned decomposed tasks for two agents
    expect(executorFn).toHaveBeenCalledTimes(2);
    const calledAgents = (executorFn as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(calledAgents).toContain('agent-a');
    expect(calledAgents).toContain('agent-b');
  });
});
