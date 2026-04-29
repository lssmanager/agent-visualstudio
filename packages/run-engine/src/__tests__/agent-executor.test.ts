/**
 * Unit tests para AgentExecutor — F1a-05 + F1a-06
 */
import { AgentExecutor } from '../agent-executor.service';

// Mock de PrismaClient
const mockUpdate = jest.fn().mockResolvedValue({});
const mockFindUniqueOrThrow = jest.fn();
const mockFindMany = jest.fn().mockResolvedValue([]);

const prisma = {
  runStep: {
    update: mockUpdate,
    findUniqueOrThrow: mockFindUniqueOrThrow,
    findMany: mockFindMany,
  },
} as any;

const mockResult = { output: { text: 'Hello' }, tokensUsed: 100, costUsd: 0.001 };
const mockLLMExecutor = { executeStep: jest.fn().mockResolvedValue(mockResult) };

const baseRunStep = {
  id: 'step-1',
  runId: 'run-1',
  nodeType: 'agent',
  status: 'pending',
  startedAt: null,
  run: { flow: { spec: {} } },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFindUniqueOrThrow.mockResolvedValue(baseRunStep);
});

describe('AgentExecutor', () => {
  let executor: AgentExecutor;

  beforeEach(() => {
    executor = new AgentExecutor({ prisma, llmStepExecutor: mockLLMExecutor as any });
  });

  describe('execute() — happy path', () => {
    it('marks RunStep as running before execution', async () => {
      await executor.execute('step-1');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-1' },
          data: expect.objectContaining({ status: 'running' }),
        }),
      );
    });

    it('calls llmStepExecutor.executeStep with the runStep', async () => {
      await executor.execute('step-1');
      expect(mockLLMExecutor.executeStep).toHaveBeenCalledWith(baseRunStep);
    });

    it('marks RunStep as completed on success', async () => {
      await executor.execute('step-1');
      const lastCall = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1][0];
      expect(lastCall.data.status).toBe('completed');
      expect(lastCall.data.tokensUsed).toBe(100);
      expect(lastCall.data.costUsd).toBe(0.001);
    });

    it('returns the StepExecutionResult', async () => {
      const result = await executor.execute('step-1');
      expect(result).toEqual(mockResult);
    });
  });

  describe('execute() — failure path', () => {
    it('marks RunStep as failed when LLMStepExecutor throws', async () => {
      mockLLMExecutor.executeStep.mockRejectedValueOnce(new Error('LLM timeout'));
      await expect(executor.execute('step-1')).rejects.toThrow('LLM timeout');
      const lastCall = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1][0];
      expect(lastCall.data.status).toBe('failed');
      expect(lastCall.data.error).toBe('LLM timeout');
    });

    it('marks RunStep as failed when runStep not found', async () => {
      mockFindUniqueOrThrow.mockRejectedValueOnce(new Error('Record not found'));
      await expect(executor.execute('step-1')).rejects.toThrow('Record not found');
      const lastCall = mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1][0];
      expect(lastCall.data.status).toBe('failed');
    });
  });

  describe('toFn()', () => {
    it('returns a function that calls execute()', async () => {
      const fn = executor.toFn();
      const result = await fn('step-1');
      expect(result).toEqual(mockResult);
    });
  });

  describe('condition node', () => {
    it('evaluates condition and sets branch in result', async () => {
      const conditionStep = { ...baseRunStep, nodeType: 'condition', conditionExpr: 'true' };
      mockFindUniqueOrThrow.mockResolvedValueOnce(conditionStep);
      const result = await executor.execute('step-1');
      expect((result.output as any).conditionResult).toBe(true);
      expect(result.tokensUsed).toBe(0);
    });
  });
});
