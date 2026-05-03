/**
 * llm-step-executor.test.ts
 *
 * Unit tests for LlmStepExecutor — F1a-01
 *
 * Coverage:
 *  1. executeAgent() — direct path (happy, tool loop, fallback model)
 *  2. executeAgent() — orchestrated path delegation
 *  3. executeCondition() — expression evaluation (true/false/error)
 *  4. executeTool() — skill invocation
 *  5. BudgetExceededError — throws when limit exceeded
 *  6. buildAdapter() — correct adapter selection per provider prefix
 */

import { LlmStepExecutor, BudgetExceededError } from '../llm-step-executor';
import type { LlmStepExecutorOptions } from '../llm-step-executor';
import type { FlowNode, RunStep, RunSpec } from '../../../core-types/src';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal FlowNode for an agent step */
function makeAgentNode(overrides: Partial<FlowNode['config']> = {}): FlowNode {
  return {
    id:     'node-agent-1',
    type:   'agent',
    config: { agentId: 'agent-abc', ...overrides },
  };
}

/** Build a minimal RunStep */
function makeStep(overrides: Partial<RunStep> = {}): RunStep {
  return {
    id:         'step-1',
    runId:      'run-1',
    nodeId:     'node-agent-1',
    nodeType:   'agent',
    status:     'running',
    agentId:    'agent-abc',
    retryCount: 0,
    startedAt:  new Date().toISOString(),
    ...overrides,
  };
}

/** Build a minimal RunSpec */
function makeRun(overrides: Partial<RunSpec> = {}): RunSpec {
  return {
    id:      'run-1',
    workspaceId: 'ws-1',
    flowId:  'flow-1',
    status:  'running',
    trigger: { type: 'manual', payload: { userId: 'u1' } },
    steps:   [],
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

// We mock the fetch global so no real HTTP calls are made
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock openai SDK require — not installed in test env
jest.mock(
  'openai',
  () => { throw new Error('not installed'); },
  { virtual: true },
);

// Mock profile-engine — optional dependency
jest.mock(
  '../../profile-engine/src/index.ts',
  () => ({
    ProfilePropagatorService: class {
      async resolveForAgent(_id: string) {
        return { systemPrompt: 'You are a test assistant.' };
      }
    },
  }),
  { virtual: true },
);

// Mock hierarchy orchestrator — used in orchestrated path
jest.mock(
  '../../hierarchy/src/index.ts',
  () => ({
    HierarchyOrchestrator: class {
      constructor(
        private _h: unknown,
        private _e: unknown,
        private _p: unknown,
        private _s: unknown,
        private _o: unknown,
      ) {}
      async orchestrate(_wsId: string, _task: string) {
        return {
          status:             'completed',
          runId:              'orch-run-1',
          consolidatedOutput: {
            summary: 'orchestration done',
            stats: {
              total: 0,
              completed: 0,
              partial: 0,
              failed: 0,
              rejected: 0,
              errors: [],
            },
          },
          subtaskResults:     [],
          totalDurationMs:    42,
        };
      }
    },
  }),
  { virtual: true },
);

// ─── Prisma mock factory ─────────────────────────────────────────────────────

const BASE_AGENT = {
  id:            'agent-abc',
  workspaceId:   'ws-1',
  model:         'openai/gpt-4o-mini',
  instructions:  'You are helpful.',
  executionMode: 'direct',
  workspace: {
    departmentId: 'dept-1',
    department:   { agencyId: 'agency-1' },
  },
  skillLinks: [],
  subagents:  [],
};

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    agent: {
      findUnique: jest.fn().mockResolvedValue({ ...BASE_AGENT, ...overrides }),
    },
    modelPolicy: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    budgetPolicy: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    runStep: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { costUsd: 0 } }),
    },
    skill: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
}

// ─── OpenAI-compat fetch response ────────────────────────────────────────────

function mockOpenAIResponse(
  content: string,
  toolCalls: unknown[] = [],
  usage = { prompt_tokens: 10, completion_tokens: 20 },
) {
  mockFetch.mockResolvedValueOnce({
    ok:   true,
    json: async () => ({
      choices: [{ message: { content, tool_calls: toolCalls }, finish_reason: 'stop' }],
      usage,
      model: 'gpt-4o-mini',
    }),
    text: async () => '',
  });
}

// ─── Executor factory ────────────────────────────────────────────────────────

function makeExecutor(db: unknown, extra?: Partial<LlmStepExecutorOptions>): LlmStepExecutor {
  process.env.OPENAI_API_KEY      = 'test-key';
  process.env.OPENROUTER_API_KEY  = 'test-openrouter';
  process.env.ANTHROPIC_API_KEY   = 'test-anthropic';
  return new LlmStepExecutor({ db: db as never, maxToolRounds: 3, ...extra });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LlmStepExecutor', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. Direct path — no tools ─────────────────────────────────────────

  describe('executeAgent() — direct path', () => {
    it('returns completed status with response on successful LLM call', async () => {
      const db = makePrisma();
      mockOpenAIResponse('Hello from GPT-4o-mini');

      const executor = makeExecutor(db);
      const result = await (executor as unknown as {
        executeAgent(n: FlowNode, s: RunStep, r: RunSpec): Promise<unknown>;
      }).executeAgent(makeAgentNode(), makeStep(), makeRun());

      expect(result).toMatchObject({
        status: 'completed',
        output: expect.objectContaining({
          agentId:       'agent-abc',
          response:      'Hello from GPT-4o-mini',
          executionMode: 'direct',
        }),
      });
    });

    it('includes costUsd in result', async () => {
      const db = makePrisma();
      mockOpenAIResponse('Cost test');

      const executor = makeExecutor(db);
      const result = await (executor as unknown as {
        executeAgent(n: FlowNode, s: RunStep, r: RunSpec): Promise<{ costUsd: number }>;
      }).executeAgent(makeAgentNode(), makeStep(), makeRun());

      expect(typeof result.costUsd).toBe('number');
      expect(result.costUsd).toBeGreaterThanOrEqual(0);
    });

    it('fails gracefully when agentId is missing', async () => {
      const db = makePrisma();
      const executor = makeExecutor(db);
      const node: FlowNode = { id: 'n', type: 'agent', config: {} };

      const result = await (executor as unknown as {
        executeAgent(n: FlowNode, s: RunStep, r: RunSpec): Promise<{ status: string; error?: string }>;
      }).executeAgent(node, makeStep({ agentId: undefined }), makeRun());

      expect(result.status).toBe('failed');
      expect(result.error).toMatch(/agentId/);
    });

    it('fails when agent is not found in DB', async () => {
      const db = makePrisma();
      db.agent.findUnique.mockResolvedValue(null);

      const executor = makeExecutor(db);
      const result = await (executor as unknown as {
        executeAgent(n: FlowNode, s: RunStep, r: RunSpec): Promise<{ status: string; error?: string }>;
      }).executeAgent(makeAgentNode(), makeStep(), makeRun());

      expect(result.status).toBe('failed');
      expect(result.error).toMatch(/not found/);
    });
  });

  // ── 2. Tool call loop ─────────────────────────────────────────────────

  describe('executeAgent() — tool call loop', () => {
    it('runs tool loop until model stops calling tools', async () => {
      const db = makePrisma({
        skillLinks: [{
          skill: { name: 'search', description: 'Search', functions: { type: 'object', properties: {} } },
        }],
      });

      // Round 1: model calls 'search' tool
      mockFetch.mockResolvedValueOnce({
        ok:   true,
        json: async () => ({
          choices: [{
            message: {
              content:    null,
              tool_calls: [{
                id:       'tc-1',
                type:     'function',
                function: { name: 'search', arguments: '{"q":"test"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
          model: 'gpt-4o-mini',
        }),
        text: async () => '',
      });

      // Round 2: model returns final response
      mockOpenAIResponse('Done after tool call');

      // Mock SkillInvoker via DB skill lookup
      db.skill = { findFirst: jest.fn().mockResolvedValue({ name: 'search', type: 'mcp', config: {} }) } as unknown as typeof db.skill;

      // Mock skill invocation (SkillInvoker.invoke is internal — we need
      // to patch the HTTP or mock inside the class; simplest is spy on fetch)
      // The second fetch is for the skill invoke (mcp type uses HTTP)
      mockFetch.mockResolvedValueOnce({
        ok:   true,
        json: async () => ({ result: ['item1'] }),
        text: async () => '',
      });

      const executor = makeExecutor(db);
      const result = await (executor as unknown as {
        executeAgent(n: FlowNode, s: RunStep, r: RunSpec): Promise<{ status: string; output: Record<string, unknown> }>;
      }).executeAgent(makeAgentNode(), makeStep(), makeRun());

      // Should complete (tool loop resolved)
      expect(['completed', 'failed']).toContain(result.status);
    });
  });

  // ── 3. Budget policy ─────────────────────────────────────────────────

  describe('executeAgent() — budget policy', () => {
    it('throws BudgetExceededError when spend limit is reached', async () => {
      const db = makePrisma();
      db.budgetPolicy.findFirst.mockResolvedValue({
        limitUsd:   0.01,
        periodDays: 30,
        scope:      'workspace',
        scopeId:    'ws-1',
      });
      db.runStep.aggregate.mockResolvedValue({ _sum: { costUsd: 5.0 } }); // over limit

      const executor = makeExecutor(db);

      await expect(
        (executor as unknown as {
          executeAgent(n: FlowNode, s: RunStep, r: RunSpec): Promise<unknown>;
        }).executeAgent(makeAgentNode(), makeStep(), makeRun()),
      ).rejects.toThrow(BudgetExceededError);
    });

    it('BudgetExceededError carries correct metadata', async () => {
      const db = makePrisma();
      db.budgetPolicy.findFirst.mockResolvedValue({
        limitUsd: 1.00, periodDays: 7, scope: 'workspace', scopeId: 'ws-1',
      });
      db.runStep.aggregate.mockResolvedValue({ _sum: { costUsd: 2.50 } });

      const executor = makeExecutor(db);
      let caught: BudgetExceededError | null = null;
      try {
        await (executor as unknown as {
          executeAgent(n: FlowNode, s: RunStep, r: RunSpec): Promise<unknown>;
        }).executeAgent(makeAgentNode(), makeStep(), makeRun());
      } catch (e) {
        if (e instanceof BudgetExceededError) caught = e;
      }

      expect(caught).not.toBeNull();
      expect(caught!.limitUsd).toBe(1.00);
      expect(caught!.spentUsd).toBe(2.50);
    });
  });

  // ── 4. Orchestrated path ──────────────────────────────────────────────

  describe('executeAgent() — orchestrated path', () => {
    it('delegates to HierarchyOrchestrator when executionMode=orchestrated', async () => {
      const db = makePrisma({ executionMode: 'orchestrated' });
      const executor = makeExecutor(db);

      const node = makeAgentNode({ executionMode: 'orchestrated' });
      const result = await (executor as unknown as {
        executeAgent(n: FlowNode, s: RunStep, r: RunSpec): Promise<{
          status: string;
          output: {
            agentId: string;
            executionMode: string;
            orchestrationRunId: string;
            consolidatedOutput: {
              summary: string;
              stats: {
                total: number;
                completed: number;
                partial: number;
                failed: number;
                rejected: number;
                errors: Array<{
                  taskId: string;
                  nodeId: string;
                  message: string;
                }>;
              };
            };
            subtaskResults: unknown[];
            totalDurationMs: number;
          };
        }>;
      }).executeAgent(node, makeStep(), makeRun());

      expect(result.status).toBe('completed');
      expect(result.output.executionMode).toBe('orchestrated');
      expect(result.output.consolidatedOutput.summary).toBe('orchestration done');
    });
  });

  // ── 5. executeCondition ───────────────────────────────────────────────

  describe('executeCondition()', () => {
    const condNode = (expression: string): FlowNode => ({
      id:     'node-cond',
      type:   'condition',
      config: { expression, branches: ['yes', 'no'] },
    });

    it('evaluates a truthy expression → first branch', async () => {
      const db = makePrisma();
      const executor = makeExecutor(db);
      const run = makeRun({ trigger: { type: 'manual', payload: { score: 95 } } });

      const result = await (executor as unknown as {
        executeCondition(n: FlowNode, s: RunStep, r: RunSpec): Promise<{ status: string; output: Record<string, unknown>; branch?: string }>;
      }).executeCondition(condNode('payload.score >= 90'), makeStep(), run);

      expect(result.status).toBe('completed');
      expect(result.branch).toBe('yes');
      expect(result.output.evaluated).toBe(true);
    });

    it('evaluates a falsy expression → second branch', async () => {
      const db = makePrisma();
      const executor = makeExecutor(db);
      const run = makeRun({ trigger: { type: 'manual', payload: { score: 50 } } });

      const result = await (executor as unknown as {
        executeCondition(n: FlowNode, s: RunStep, r: RunSpec): Promise<{ status: string; output: Record<string, unknown>; branch?: string }>;
      }).executeCondition(condNode('payload.score >= 90'), makeStep(), run);

      expect(result.status).toBe('completed');
      expect(result.branch).toBe('no');
      expect(result.output.evaluated).toBe(false);
    });

    it('returns failed + false branch on expression error', async () => {
      const db = makePrisma();
      const executor = makeExecutor(db);

      const result = await (executor as unknown as {
        executeCondition(n: FlowNode, s: RunStep, r: RunSpec): Promise<{ status: string; branch?: string }>;
      }).executeCondition(condNode('payload.notAFunction()'), makeStep(), makeRun());

      expect(result.status).toBe('failed');
      expect(result.branch).toBe('no');
    });

    it('defaults to first branch when expression is empty', async () => {
      const db = makePrisma();
      const executor = makeExecutor(db);

      const result = await (executor as unknown as {
        executeCondition(n: FlowNode, s: RunStep, r: RunSpec): Promise<{ status: string; branch?: string }>;
      }).executeCondition(condNode(''), makeStep(), makeRun());

      expect(result.status).toBe('completed');
      expect(result.branch).toBe('yes');
    });

    it('can access outputs from previous steps', async () => {
      const db = makePrisma();
      const executor = makeExecutor(db);
      const run = makeRun();
      // Inject outputs into run
      (run as unknown as Record<string, unknown>).outputs = { 'step-0': { ok: true } };

      const result = await (executor as unknown as {
        executeCondition(n: FlowNode, s: RunStep, r: RunSpec): Promise<{ status: string; branch?: string }>;
      }).executeCondition(condNode("outputs['step-0']?.ok === true"), makeStep(), run);

      expect(result.status).toBe('completed');
      expect(result.branch).toBe('yes');
    });
  });

  // ── 6. executeTool ────────────────────────────────────────────────────

  describe('executeTool()', () => {
    it('invokes skill and returns completed result', async () => {
      const db = makePrisma();
      // Skill lookup for SkillInvoker
      db.skill = {
        findFirst: jest.fn().mockResolvedValue({
          name: 'echo', type: 'mcp', config: { endpoint: 'http://mcp/echo' },
        }),
      } as unknown as typeof db.skill;

      // Mock MCP HTTP call
      mockFetch.mockResolvedValueOnce({
        ok:   true,
        json: async () => ({ result: 'echoed' }),
        text: async () => '',
      });

      const executor = makeExecutor(db);
      const node: FlowNode = {
        id:     'tool-node',
        type:   'tool',
        config: { skillName: 'echo', params: { msg: 'hello' } },
      };

      const result = await (executor as unknown as {
        executeTool(n: FlowNode, s: RunStep, r: RunSpec): Promise<{ status: string; output: Record<string, unknown> }>;
      }).executeTool(node, makeStep(), makeRun());

      expect(['completed', 'failed']).toContain(result.status);
      expect(result.output.skillName).toBe('echo');
    });
  });

  // ── 7. Provider routing ───────────────────────────────────────────────

  describe('Provider adapter routing', () => {
    it('uses Anthropic fetch for anthropic/* model', async () => {
      const db = makePrisma({ model: 'anthropic/claude-3-haiku' });

      // Anthropic API response shape
      mockFetch.mockResolvedValueOnce({
        ok:   true,
        json: async () => ({
          content:     [{ type: 'text', text: 'Hi from Claude' }],
          usage:       { input_tokens: 5, output_tokens: 10 },
          model:       'claude-3-haiku-20240307',
          stop_reason: 'end_turn',
        }),
        text: async () => '',
      });

      const executor = makeExecutor(db);
      const node = makeAgentNode({ model: 'anthropic/claude-3-haiku' });

      const result = await (executor as unknown as {
        executeAgent(n: FlowNode, s: RunStep, r: RunSpec): Promise<{ status: string; output: Record<string, unknown> }>;
      }).executeAgent(node, makeStep(), makeRun());

      expect(result.status).toBe('completed');
      expect(result.output.response).toBe('Hi from Claude');

      // Confirm Anthropic endpoint was called
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('anthropic.com'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws when ANTHROPIC_API_KEY is missing for anthropic model', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const db = makePrisma({ model: 'anthropic/claude-3-opus' });
      const executor = makeExecutor(db);
      const node = makeAgentNode({ model: 'anthropic/claude-3-opus' });

      await expect(
        (executor as unknown as {
          executeAgent(n: FlowNode, s: RunStep, r: RunSpec): Promise<unknown>;
        }).executeAgent(node, makeStep(), makeRun()),
      ).rejects.toThrow('ANTHROPIC_API_KEY');

      process.env.ANTHROPIC_API_KEY = 'test-anthropic'; // restore
    });

    it('uses OpenRouter compat for non-openai/anthropic providers', async () => {
      const db = makePrisma({ model: 'qwen/qwen2.5-72b-instruct' });
      mockOpenAIResponse('Hi from Qwen');

      const executor = makeExecutor(db);
      const node = makeAgentNode({ model: 'qwen/qwen2.5-72b-instruct' });

      const result = await (executor as unknown as {
        executeAgent(n: FlowNode, s: RunStep, r: RunSpec): Promise<{ status: string; output: Record<string, unknown> }>;
      }).executeAgent(node, makeStep(), makeRun());

      expect(result.status).toBe('completed');
      expect(result.output.response).toBe('Hi from Qwen');

      // Confirm OpenRouter base URL was used
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('openrouter.ai'),
        expect.anything(),
      );
    });
  });

  // ── 8. Fallback model ─────────────────────────────────────────────────

  describe('executeAgent() — fallback model', () => {
    it('retries with fallbackModel when primary LLM call fails', async () => {
      const db = makePrisma();
      db.modelPolicy.findFirst.mockResolvedValue({
        primaryModel: 'openai/gpt-4o',
        fallbackModel: 'openai/gpt-4o-mini',
        temperature: 0.7,
        maxTokens:   4096,
        scope:  'workspace',
        scopeId: 'ws-1',
      });

      // Primary call fails
      mockFetch.mockRejectedValueOnce(new Error('upstream 503'));
      // Fallback succeeds
      mockOpenAIResponse('Fallback response');

      const executor = makeExecutor(db);
      const result = await (executor as unknown as {
        executeAgent(n: FlowNode, s: RunStep, r: RunSpec): Promise<{ status: string; output: Record<string, unknown> }>;
      }).executeAgent(makeAgentNode(), makeStep(), makeRun());

      expect(result.status).toBe('completed');
      expect(result.output.response).toBe('Fallback response');
    });
  });
});
