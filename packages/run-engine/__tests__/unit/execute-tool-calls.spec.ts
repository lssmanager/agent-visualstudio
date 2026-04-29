/**
 * execute-tool-calls.spec.ts
 *
 * Unit tests for LlmStepExecutor's agentic tool-call loop (F1b-04).
 *
 * Strategy: we cannot call the private executeToolCalls() method directly.
 * Instead we exercise it through executeDirect() by constructing a minimal
 * in-memory LlmStepExecutor with mocked collaborators (adapter, skillInvoker).
 *
 * All external I/O is mocked:
 *  - buildLLMClient  → jest.mock('./llm-client')
 *  - SkillInvoker    → jest.mock('./skill-invoker')
 *  - PolicyResolver  → jest.mock('./policy-resolver')  (resolves no policies)
 *  - PrismaClient    → manual mock with minimal shape
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Type-only imports (never executed in tests) ────────────────────────────
import type { ToolCallResult, ToolLoopResult } from '../../src/llm-step-executor';
import type { LlmResponse } from '../../src/llm-client';

// ── Re-export types under test so Jest can see them ───────────────────────
const MAX_TOOL_RESULT_CHARS   = 8_000;
const TOOL_RESULT_TRUNCATION_NOTICE =
  '\n\n[RESULT TRUNCATED — original exceeded MAX_TOOL_RESULT_CHARS limit]';

// ── Helpers ───────────────────────────────────────────────────────────────

/** Minimal LlmResponse with no tool_calls */
function makeTextResponse(content = 'done'): LlmResponse {
  return {
    content,
    tool_calls: [],
    usage: { input: 10, output: 20 },
    model: 'openai/gpt-4o-mini',
  };
}

/** LlmResponse that requests one tool call */
function makeToolCallResponse(toolName: string, callId = 'tc1'): LlmResponse {
  return {
    content: null,
    tool_calls: [{
      id:       callId,
      type:     'function',
      function: { name: toolName, arguments: '{}' },
    }],
    usage: { input: 15, output: 5 },
    model: 'openai/gpt-4o-mini',
  };
}

/** Build a minimal mock PrismaClient shape that executeDirect() needs */
function makeMockPrisma(agentOverrides: Record<string, unknown> = {}) {
  const agent = {
    id:            'agent-1',
    workspaceId:   'ws-1',
    model:         'openai/gpt-4o-mini',
    instructions:  'You are a test assistant.',
    executionMode: 'direct',
    workspace: {
      departmentId: 'dept-1',
      department:   { agencyId: 'agency-1' },
    },
    skillLinks: [],
    subagents:  [],
    ...agentOverrides,
  };

  return {
    agent: {
      findUnique: jest.fn().mockResolvedValue(agent),
    },
    runStep: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: 0 } }),
    },
  };
}

// ── Mock module factories (hoisted by Jest) ───────────────────────────────

let mockChat: ReturnType<typeof jest.fn>;
let mockInvoke: ReturnType<typeof jest.fn>;

jest.mock('../../src/llm-client', () => ({
  buildLLMClient: () => ({ chat: (...args: unknown[]) => mockChat(...args) }),
}));

jest.mock('../../src/skill-invoker', () => ({
  SkillInvoker: jest.fn().mockImplementation(() => ({
    invoke: (...args: unknown[]) => mockInvoke(...args),
    invokeWebhookDirect: jest.fn(),
  })),
}));

jest.mock('../../src/policy-resolver', () => ({
  PolicyResolver: jest.fn().mockImplementation(() => ({
    resolve: jest.fn().mockResolvedValue({
      budget: null,
      model:  null,
      budgetResolvedFrom: null,
    }),
  })),
}));

jest.mock('../../src/build-tool-definitions', () => ({
  buildToolDefinitions: () => [],
}));

// ── Import SUT after mocks are set up ─────────────────────────────────────
import { LlmStepExecutor } from '../../src/llm-step-executor';

// ── Fixtures ──────────────────────────────────────────────────────────────

const BASE_NODE = {
  id:     'node-1',
  type:   'agent' as const,
  config: { agentId: 'agent-1', prompt: 'Hello' },
};

const BASE_STEP = {
  id:         'step-1',
  runId:      'run-1',
  nodeId:     'node-1',
  nodeType:   'agent' as const,
  status:     'running' as const,
  agentId:    'agent-1',
  retryCount: 0,
  startedAt:  new Date().toISOString(),
};

const BASE_RUN = {
  id:      'run-1',
  flowId:  'flow-1',
  trigger: { type: 'manual', payload: {} },
  status:  'running' as const,
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('LlmStepExecutor → executeToolCalls()', () => {
  let executor: LlmStepExecutor;

  beforeEach(() => {
    mockChat   = jest.fn();
    mockInvoke = jest.fn();
    executor = new LlmStepExecutor({
      db: makeMockPrisma() as never,
      maxToolRounds: 10,
    });
  });

  // ── 1. No tool_calls in first response ──────────────────────────────

  it('no tool_calls: toolRoundsUsed=0, hitMaxRounds=false', async () => {
    mockChat.mockResolvedValue(makeTextResponse('Hello world'));

    const result = await (executor as never)['executeDirect'](
      BASE_NODE, BASE_STEP, BASE_RUN, null,
    );

    expect(result.status).toBe('completed');
    const out = result.output as Record<string, unknown>;
    expect(out.toolRoundsUsed).toBe(0);
    expect(out.hitMaxRounds).toBe(false);
    expect(out.failedToolCalls).toBeUndefined();
    expect(out.response).toBe('Hello world');
  });

  // ── 2. One round of tool_calls then final text response ──────────────

  it('one round of tool_calls followed by text response', async () => {
    mockChat
      .mockResolvedValueOnce(makeToolCallResponse('mySkill', 'tc1'))
      .mockResolvedValueOnce(makeTextResponse('All done'));

    mockInvoke.mockResolvedValue({ ok: true, result: { data: 42 }, durationMs: 5 });

    const result = await (executor as never)['executeDirect'](
      BASE_NODE, BASE_STEP, BASE_RUN, null,
    );

    const out = result.output as Record<string, unknown>;
    expect(out.toolRoundsUsed).toBe(1);
    expect(out.hitMaxRounds).toBe(false);
    expect(out.response).toBe('All done');
    // chat() called twice: once tool-call round, once final
    expect(mockChat).toHaveBeenCalledTimes(2);
    // skillInvoker.invoke called once for mySkill
    expect(mockInvoke).toHaveBeenCalledWith('mySkill', {});
  });

  // ── 3. Tool result truncation ────────────────────────────────────────

  it('tool result > MAX_TOOL_RESULT_CHARS is truncated with notice', async () => {
    mockChat
      .mockResolvedValueOnce(makeToolCallResponse('bigSkill', 'tc2'))
      .mockResolvedValueOnce(makeTextResponse('trimmed'));

    // Skill returns 10 000-char string — well above the 8 000-char limit
    const bigResult = 'x'.repeat(10_000);
    mockInvoke.mockResolvedValue({ ok: true, result: bigResult, durationMs: 1 });

    await (executor as never)['executeDirect'](
      BASE_NODE, BASE_STEP, BASE_RUN, null,
    );

    // Capture the messages passed in the second chat() call
    const secondCallMessages = mockChat.mock.calls[1][0] as Array<Record<string, unknown>>;
    const toolMsg = secondCallMessages.find(
      (m) => m['role'] === 'tool',
    ) as Record<string, unknown> | undefined;

    expect(toolMsg).toBeDefined();
    const content = toolMsg!['content'] as string;
    expect(content.length).toBeLessThanOrEqual(
      MAX_TOOL_RESULT_CHARS + TOOL_RESULT_TRUNCATION_NOTICE.length,
    );
    expect(content).toContain('[RESULT TRUNCATED');
  });

  // ── 4. hitMaxRounds when LLM keeps calling tools ─────────────────────

  it('hitMaxRounds=true when LLM keeps calling tools at maxRounds limit', async () => {
    // Always return a tool_call → forces the loop to exhaust maxRounds
    mockChat.mockResolvedValue(makeToolCallResponse('infiniteSkill', 'tc3'));
    mockInvoke.mockResolvedValue({ ok: true, result: 'ok', durationMs: 1 });

    const shortExecutor = new LlmStepExecutor({
      db: makeMockPrisma() as never,
      maxToolRounds: 2,
    });

    const result = await (shortExecutor as never)['executeDirect'](
      BASE_NODE, BASE_STEP, BASE_RUN, null,
    );

    const out = result.output as Record<string, unknown>;
    expect(out.hitMaxRounds).toBe(true);
    expect(out.toolRoundsUsed).toBe(2);
  });

  // ── 5. Failed tool call included in toolCallResults ──────────────────

  it('failed tool call: ok=false result visible in failedToolCalls output', async () => {
    mockChat
      .mockResolvedValueOnce(makeToolCallResponse('brokenSkill', 'tc4'))
      .mockResolvedValueOnce(makeTextResponse('handled error'));

    // Skill fails
    mockInvoke.mockResolvedValue({
      ok: false,
      error: 'Skill not found',
      durationMs: 2,
    });

    const result = await (executor as never)['executeDirect'](
      BASE_NODE, BASE_STEP, BASE_RUN, null,
    );

    const out = result.output as Record<string, unknown>;
    expect(out.failedToolCalls).toBeDefined();
    const failed = out.failedToolCalls as Array<{ toolName: string; error?: string }>;
    expect(failed).toHaveLength(1);
    expect(failed[0].toolName).toBe('brokenSkill');
    expect(failed[0].error).toBe('Skill not found');
    // Loop should have continued — LLM got the error as tool result
    expect(mockChat).toHaveBeenCalledTimes(2);
  });

  // ── 6. Fallback chain activates when primary model throws ────────────

  it('fallbackChain: activeModel switches to fallback when primary throws', async () => {
    // Override PolicyResolver to return a fallbackChain
    const { PolicyResolver } = await import('../../src/policy-resolver');
    (PolicyResolver as jest.Mock).mockImplementationOnce(() => ({
      resolve: jest.fn().mockResolvedValue({
        budget: null,
        model: {
          primaryModel:  'openai/gpt-4o',
          fallbackChain: ['openai/gpt-4o-mini'],
          temperature:   0.7,
          maxTokens:     4096,
        },
        budgetResolvedFrom: null,
      }),
    }));

    const fallbackExecutor = new LlmStepExecutor({
      db: makeMockPrisma() as never,
    });

    // Primary throws, fallback succeeds
    mockChat
      .mockRejectedValueOnce(new Error('rate limit'))   // primary gpt-4o
      .mockResolvedValueOnce(makeTextResponse('fallback response'));  // gpt-4o-mini

    const result = await (fallbackExecutor as never)['executeDirect'](
      BASE_NODE, BASE_STEP, BASE_RUN, null,
    );

    const out = result.output as Record<string, unknown>;
    expect(result.status).toBe('completed');
    // The active model must have switched to the fallback
    expect(out.model).toBe('openai/gpt-4o-mini');
    expect(out.provider).toBe('openai');
  });
});

// ── Type-check exports ────────────────────────────────────────────────────
// Ensures ToolCallResult and ToolLoopResult are properly exported
void (undefined as unknown as ToolCallResult);
void (undefined as unknown as ToolLoopResult);
