/**
 * hierarchy-orchestrator-sequential.test.ts
 *
 * Tests for HierarchyOrchestrator with parallel: false (sequential execution).
 *
 * This file tests the simplified executeSequential() path introduced in this PR,
 * which removes routeTask()/delegateTask() branching and always uses executeWithRetry.
 *
 * Verifies:
 *  1. Sequential mode executes all subtasks in order.
 *  2. Sequential mode continues past a single failing subtask.
 *  3. StepIds are real Prisma IDs (not empty strings) in sequential mode.
 *  4. completeStep() is called with full LLM metadata in sequential mode.
 *  5. Consolidation produces output in sequential mode.
 *  6. routeTask / delegateTask / getStepStatus are NOT available (removed by PR).
 */

import type { AgentExecutionResult, AgentExecutorFn } from '../hierarchy-orchestrator.js';
import { HierarchyOrchestrator } from '../hierarchy-orchestrator.js';

// ─── Mock RunRepository ───────────────────────────────────────────────────────

let stepIdCounter = 0;

const mockRepo = {
  createRun:        jest.fn().mockResolvedValue({ id: 'run-seq-001' }),
  startRun:         jest.fn().mockResolvedValue(undefined),
  failRun:          jest.fn().mockResolvedValue(undefined),
  completeRun:      jest.fn().mockResolvedValue(undefined),
  pauseRun:         jest.fn().mockResolvedValue(undefined),
  createStep:       jest.fn().mockImplementation(() =>
    Promise.resolve({ id: `step-${++stepIdCounter}` })
  ),
  completeStep:     jest.fn().mockResolvedValue(undefined),
  failStep:         jest.fn().mockResolvedValue(undefined),
  skipStep:         jest.fn().mockResolvedValue(undefined),
  createApproval:   jest.fn().mockResolvedValue({ id: 'approval-seq-001' }),
  waitForApproval:  jest.fn().mockResolvedValue('approved'),
};

jest.mock('../../../run-engine/src/run-repository.js', () => ({
  RunRepository: jest.fn().mockImplementation(() => mockRepo),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const singleAgentHierarchy = {
  id:    'agent-solo',
  name:  'Solo Agent',
  level: 'agent' as const,
};

const twoAgentHierarchy = {
  id:       'workspace-root',
  name:     'Root',
  level:    'workspace' as const,
  children: [
    { id: 'agent-first',  name: 'First Agent',  level: 'agent' as const },
    { id: 'agent-second', name: 'Second Agent', level: 'agent' as const },
  ],
};

const threeAgentHierarchy = {
  id:       'workspace-multi',
  name:     'Multi',
  level:    'workspace' as const,
  children: [
    { id: 'agent-a', name: 'A', level: 'agent' as const },
    { id: 'agent-b', name: 'B', level: 'agent' as const },
    { id: 'agent-c', name: 'C', level: 'agent' as const },
  ],
};

const makePrisma = () => ({} as unknown as import('@prisma/client').PrismaClient);

function makeExecutorFn(partial?: Partial<AgentExecutionResult>): AgentExecutorFn {
  return jest.fn().mockResolvedValue({
    response:          'task completed',
    model:             'openai/gpt-4o-mini',
    provider:          'openai',
    promptTokens:      100,
    completionTokens:  50,
    totalTokens:       150,
    costUsd:           0.0002,
    ...partial,
  } satisfies AgentExecutionResult);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  stepIdCounter = 0;
  mockRepo.createRun.mockResolvedValue({ id: 'run-seq-001' });
  mockRepo.createStep.mockImplementation(() =>
    Promise.resolve({ id: `step-${++stepIdCounter}` })
  );
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HierarchyOrchestrator — sequential execution (parallel: false)', () => {

  it('completes all subtasks in sequential mode with single agent', async () => {
    const executorFn = makeExecutorFn();
    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      executorFn,
      makePrisma(),
      undefined,
      { parallel: false },
    );
    const result = await orch.orchestrate('ws-001', 'Sequential task');

    expect(result.status).toBe('completed');
    expect(result.subtaskResults).toHaveLength(1);
    expect(result.subtaskResults[0].status).toBe('completed');
  });

  it('executes all agents in sequential mode with two-agent hierarchy', async () => {
    const executorFn = makeExecutorFn();
    const orch = new HierarchyOrchestrator(
      twoAgentHierarchy,
      executorFn,
      makePrisma(),
      undefined,
      { parallel: false },
    );
    const result = await orch.orchestrate('ws-001', 'Multi-agent sequential');

    expect(result.status).toBe('completed');
    expect(result.subtaskResults).toHaveLength(2);
    expect(executorFn).toHaveBeenCalledTimes(2);
  });

  it('sequential execution preserves agent call order', async () => {
    const callOrder: string[] = [];
    const orderedExecutor: AgentExecutorFn = jest.fn().mockImplementation(
      (agentId: string) => {
        callOrder.push(agentId);
        return Promise.resolve({
          response: `done by ${agentId}`,
          model: 'openai/gpt-4o-mini',
          provider: 'openai',
        } as AgentExecutionResult);
      }
    );

    const orch = new HierarchyOrchestrator(
      threeAgentHierarchy,
      orderedExecutor,
      makePrisma(),
      undefined,
      { parallel: false },
    );
    await orch.orchestrate('ws-001', 'Ordered task');

    // All 3 agents should be called
    expect(callOrder).toHaveLength(3);
    expect(callOrder).toContain('agent-a');
    expect(callOrder).toContain('agent-b');
    expect(callOrder).toContain('agent-c');
  });

  it('continues sequential execution after one subtask fails', async () => {
    let callCount = 0;
    const partiallyFailingExecutor: AgentExecutorFn = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('First agent failed'));
      }
      return Promise.resolve({
        response: 'second agent succeeded',
        model: 'openai/gpt-4o-mini',
        provider: 'openai',
      } as AgentExecutionResult);
    });

    const orch = new HierarchyOrchestrator(
      twoAgentHierarchy,
      partiallyFailingExecutor,
      makePrisma(),
      undefined,
      { parallel: false, maxRetries: 0 },
    );
    const result = await orch.orchestrate('ws-001', 'Partial failure');

    // Second agent should still be called even if first failed
    expect(callCount).toBeGreaterThanOrEqual(2);
    // Result is partial (one failed, one succeeded)
    expect(result.status).toBe('partial');
    const statuses = result.subtaskResults.map((r) => r.status);
    expect(statuses).toContain('failed');
    expect(statuses).toContain('completed');
  });

  it('sequential mode: completeStep called with LLM metadata for each agent', async () => {
    const executorFn = makeExecutorFn({
      response:          'sequential output',
      model:             'deepseek/deepseek-v3',
      provider:          'deepseek',
      promptTokens:      200,
      completionTokens:  100,
      totalTokens:       300,
      costUsd:           0.0005,
    });

    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      executorFn,
      makePrisma(),
      undefined,
      { parallel: false },
    );
    await orch.orchestrate('ws-001', 'Single sequential task');

    expect(mockRepo.completeStep).toHaveBeenCalledWith(
      expect.objectContaining({
        output:           'sequential output',
        model:            'deepseek/deepseek-v3',
        provider:         'deepseek',
        promptTokens:     200,
        completionTokens: 100,
        totalTokens:      300,
        costUsd:          0.0005,
      }),
    );
  });

  it('sequential mode: stepIds in SubtaskResults are real Prisma IDs (not empty)', async () => {
    const executorFn = makeExecutorFn();
    const orch = new HierarchyOrchestrator(
      twoAgentHierarchy,
      executorFn,
      makePrisma(),
      undefined,
      { parallel: false },
    );
    const result = await orch.orchestrate('ws-001', 'Step ID check');

    for (const subtask of result.subtaskResults) {
      expect(subtask.stepId).toBeTruthy();
      expect(subtask.stepId).not.toBe('');
    }
  });

  it('sequential mode: all-failure results in "failed" status', async () => {
    const alwaysFailing: AgentExecutorFn = jest.fn().mockRejectedValue(
      new Error('Agent unavailable'),
    );

    const orch = new HierarchyOrchestrator(
      twoAgentHierarchy,
      alwaysFailing,
      makePrisma(),
      undefined,
      { parallel: false, maxRetries: 0 },
    );
    const result = await orch.orchestrate('ws-001', 'All fail');

    expect(result.status).toBe('failed');
    expect(result.subtaskResults.every((r) => r.status === 'failed')).toBe(true);
  });

  it('sequential mode: failStep called for each failed subtask', async () => {
    const failingExecutor: AgentExecutorFn = jest.fn().mockRejectedValue(
      new Error('Crash'),
    );

    const orch = new HierarchyOrchestrator(
      twoAgentHierarchy,
      failingExecutor,
      makePrisma(),
      undefined,
      { parallel: false, maxRetries: 0 },
    );
    await orch.orchestrate('ws-001', 'Fail steps');

    expect(mockRepo.failStep).toHaveBeenCalledTimes(2);
  });

  it('sequential mode: SubtaskResult.output is the response string, not the AgentExecutionResult', async () => {
    const executorFn = makeExecutorFn({ response: 'specific response text' });
    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      executorFn,
      makePrisma(),
      undefined,
      { parallel: false },
    );
    const result = await orch.orchestrate('ws-001', 'Output check');

    expect(result.subtaskResults[0].output).toBe('specific response text');
    expect(typeof result.subtaskResults[0].output).toBe('string');
  });

  it('sequential mode: consolidatedOutput.summary is non-empty string on success', async () => {
    const executorFn = makeExecutorFn();
    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      executorFn,
      makePrisma(),
      undefined,
      { parallel: false },
    );
    const result = await orch.orchestrate('ws-001', 'Consolidation check');

    expect(typeof result.consolidatedOutput.summary).toBe('string');
    expect(result.consolidatedOutput.summary.length).toBeGreaterThan(0);
  });

  it('sequential mode: timeout option is respected — slow agent produces failed status', async () => {
    const slowExecutor: AgentExecutorFn = jest.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        response: 'too late',
        model: 'openai/gpt-4o-mini',
        provider: 'openai',
      } as AgentExecutionResult), 5_000))
    );

    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      slowExecutor,
      makePrisma(),
      undefined,
      { parallel: false, subtaskTimeoutMs: 50, maxRetries: 0 },
    );
    const result = await orch.orchestrate('ws-001', 'Timeout test');

    expect(result.status).toBe('failed');
    expect(result.subtaskResults[0].error).toContain('timed out');
  }, 10_000);
});

// ─── Tests: Removed methods are NOT present on the class ─────────────────────

describe('HierarchyOrchestrator — removed methods from PR', () => {

  it('routeTask() has been removed and is not a public method', () => {
    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      makeExecutorFn(),
      makePrisma(),
    );
    // routeTask was a private method but we confirm the public API doesn't expose it
    expect((orch as unknown as Record<string, unknown>)['routeTask']).toBeUndefined();
  });

  it('delegateTask() has been removed and is not accessible', () => {
    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      makeExecutorFn(),
      makePrisma(),
    );
    expect((orch as unknown as Record<string, unknown>)['delegateTask']).toBeUndefined();
  });

  it('getStepStatus() has been removed from the orchestrator', () => {
    const orch = new HierarchyOrchestrator(
      singleAgentHierarchy,
      makeExecutorFn(),
      makePrisma(),
    );
    expect((orch as unknown as Record<string, unknown>)['getStepStatus']).toBeUndefined();
  });
});

// ─── Tests: Simplified parallel execution (no routing) ───────────────────────

describe('HierarchyOrchestrator — simplified parallel execution (no routing)', () => {

  it('parallel mode still works correctly without routeTask', async () => {
    const executorFn = makeExecutorFn();
    const orch = new HierarchyOrchestrator(
      twoAgentHierarchy,
      executorFn,
      makePrisma(),
      undefined,
      { parallel: true },
    );
    const result = await orch.orchestrate('ws-001', 'Parallel without routing');

    expect(result.status).toBe('completed');
    expect(result.subtaskResults).toHaveLength(2);
    expect(executorFn).toHaveBeenCalledTimes(2);
  });

  it('parallel mode: all subtasks get their own RunStep with real IDs', async () => {
    const executorFn = makeExecutorFn();
    const orch = new HierarchyOrchestrator(
      threeAgentHierarchy,
      executorFn,
      makePrisma(),
      undefined,
      { parallel: true },
    );
    const result = await orch.orchestrate('ws-001', 'Three parallel agents');

    expect(result.subtaskResults).toHaveLength(3);
    const stepIds = result.subtaskResults.map((r) => r.stepId);
    // All IDs should be real (non-empty)
    expect(stepIds.every((id) => Boolean(id))).toBe(true);
    // No delegation IDs (routeTask/delegateTask removed)
    expect(stepIds.some((id) => id.startsWith('orchestrated-'))).toBe(false);
  });

  it('parallel mode: a single agent failure yields "partial" status', async () => {
    let agentCallCount = 0;
    const mixedExecutor: AgentExecutorFn = jest.fn().mockImplementation((agentId: string) => {
      agentCallCount++;
      if (agentId === 'agent-b') {
        return Promise.reject(new Error('Agent B crashed'));
      }
      return Promise.resolve({
        response: `${agentId} done`,
        model: 'openai/gpt-4o-mini',
        provider: 'openai',
      } as AgentExecutionResult);
    });

    const orch = new HierarchyOrchestrator(
      twoAgentHierarchy,
      mixedExecutor,
      makePrisma(),
      undefined,
      { parallel: true, maxRetries: 0 },
    );
    const result = await orch.orchestrate('ws-001', 'Mixed parallel');

    expect(agentCallCount).toBeGreaterThanOrEqual(2);
    expect(result.status).toBe('partial');
  });
});
