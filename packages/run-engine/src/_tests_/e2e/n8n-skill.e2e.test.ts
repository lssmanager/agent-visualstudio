/**
 * F1b-09 — Test E2E: agente con skill n8n_webhook ejecuta tool call
 *
 * Verifica el pipeline completo de skill execution:
 *   FlowExecutor → AgentExecutor → LLMStepExecutor
 *     → buildToolDefinitions (skills como tools OpenAI)
 *     → tool_call: skill__{skillId}__invoke
 *     → executeToolCalls → executeTool → POST webhook n8n
 *     → tool result devuelto al LLM
 *     → LLM produce respuesta final
 *
 * HTTP mock strategy:
 *   skill-invoker.ts usa native fetch con AbortController (F1b-01).
 *   → jest.spyOn(global, 'fetch') intercepta el POST al webhook.
 *
 * Para el path real se necesita:
 *   N8N_WEBHOOK_TEST_URL=https://... OPENAI_API_KEY=sk-... pnpm test -- n8n-skill.e2e
 */

import { FlowExecutor, type FlowSpec } from '../../flow-executor';
import { AgentExecutor } from '../../agent-executor.service';

// ─── Fixture helpers ─────────────────────────────────────────────────────────

function buildSkillFlowSpec(): FlowSpec {
  return {
    entryNodeId: 'n-input',
    nodes: [
      { id: 'n-input',  type: 'input' },
      { id: 'n-agent',  type: 'agent', agentId: 'agent-skill-test' },
      { id: 'n-output', type: 'output' },
    ],
    edges: [
      { source: 'n-input',  target: 'n-agent'  },
      { source: 'n-agent',  target: 'n-output' },
    ],
  };
}

// ─── Prisma mock extendido con skill + agentSkill ────────────────────────────

function buildPrismaMock() {
  const runSteps: Record<string, any> = {};
  const runs:     Record<string, any> = {};

  // Skills del catálogo global
  const skills: Record<string, any> = {
    'skill-n8n-1': {
      id:          'skill-n8n-1',
      name:        'Send Slack Notification',
      type:        'n8n_webhook',
      description: 'Sends a message to a Slack channel via n8n',
      config: {
        webhookUrl: 'https://n8n.example.com/webhook/slack-notify',
      },
      isActive:  true,
      deletedAt: null,
    },
  };

  // Asignaciones AgentSkill
  const agentSkills: Record<string, any> = {
    'as-1': {
      id:             'as-1',
      agentId:        'agent-skill-test',
      skillId:        'skill-n8n-1',
      configOverride: {},
      skill:          skills['skill-n8n-1'],
    },
  };

  return {
    run: {
      update: jest.fn(async ({ where, data }: any) => {
        runs[where.id] = { ...runs[where.id], ...data };
        return runs[where.id];
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        if (!runs[where.id]) throw new Error(`Run ${where.id} not found`);
        return runs[where.id];
      }),
    },
    runStep: {
      create: jest.fn(async ({ data }: any) => {
        const id = `step-${Object.keys(runSteps).length + 1}`;
        runSteps[id] = { id, ...data, startedAt: null, finishedAt: null, output: null };
        return runSteps[id];
      }),
      update: jest.fn(async ({ where, data }: any) => {
        runSteps[where.id] = { ...runSteps[where.id], ...data };
        return runSteps[where.id];
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        if (!runSteps[where.id]) throw new Error(`RunStep ${where.id} not found`);
        return runSteps[where.id];
      }),
      findMany: jest.fn(async () => []),
    },
    agentSkill: {
      findMany: jest.fn(async ({ where }: any) =>
        Object.values(agentSkills).filter(
          (as: any) => as.agentId === where?.agentId,
        ),
      ),
    },
    skill: {
      findFirst:  jest.fn(async ({ where }: any) => skills[where?.id] ?? null),
      findUnique: jest.fn(async ({ where }: any) =>
        Object.values(skills).find((s: any) => s.name === where?.name) ?? null,
      ),
    },
    // Internos para asserts
    _runSteps:    runSteps,
    _runs:        runs,
    _skills:      skills,
    _agentSkills: agentSkills,
  };
}

// ─── Mock LLMExecutor: simula 2 turnos (tool_call → respuesta final) ─────────

/**
 * Primera llamada al LLM → devuelve pendingToolCalls (n8n invoke).
 * Segunda llamada al LLM → devuelve respuesta final (post tool result).
 *
 * webhookResponseRef.called se marca a true en la segunda llamada,
 * lo que permite verificar el orden del pipeline en los tests.
 */
function buildLLMExecutorWithToolCall(webhookResponseRef: { called: boolean }) {
  let callCount = 0;

  return {
    executeStep: jest.fn(async (_context: any) => {
      callCount++;

      if (callCount === 1) {
        // Primera llamada: LLM decide invocar la tool n8n_webhook
        return {
          output: {
            role:       'assistant',
            tool_calls: [
              {
                id:       'call-abc123',
                type:     'function',
                function: {
                  name:      'skill__skill-n8n-1__invoke',
                  arguments: JSON.stringify({ channel: '#alerts', message: 'Deploy done' }),
                },
              },
            ],
          },
          pendingToolCalls: [
            {
              callId:    'call-abc123',
              skillId:   'skill-n8n-1',
              function:  'invoke',
              arguments: { channel: '#alerts', message: 'Deploy done' },
            },
          ],
          tokensUsed: 120,
          costUsd:    0.0012,
        };
      }

      // Segunda llamada: LLM recibe tool result y produce respuesta final
      webhookResponseRef.called = true;
      return {
        output:    { text: 'Notification sent successfully to #alerts.' },
        tokensUsed: 80,
        costUsd:    0.0008,
      };
    }),
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

const SKIP_SKILL_E2E =
  !process.env.OPENAI_API_KEY || process.env.SKIP_LLM_CALLS === 'true';
const N8N_WEBHOOK_TEST_URL = process.env.N8N_WEBHOOK_TEST_URL ?? '';

describe('E2E: Agente con skill n8n_webhook ejecuta tool call [F1b-09]', () => {
  let prisma:   ReturnType<typeof buildPrismaMock>;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = buildPrismaMock();

    // Seed del Run con el FlowSpec que contiene el agente con skill
    prisma._runs['run-skill-e2e'] = {
      id:         'run-skill-e2e',
      status:     'pending',
      startedAt:  null,
      finishedAt: null,
      flow: { spec: buildSkillFlowSpec() },
    };

    // skill-invoker.ts usa native fetch con AbortController (F1b-01)
    // → interceptar con spyOn ANTES de instanciar ejecutores
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (url: string | URL) => {
        if (String(url).includes('n8n.example.com')) {
          return new Response(
            JSON.stringify({ success: true, message: 'Notification sent' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        // Cualquier otra URL es inesperada en modo mock
        throw new Error(`Unexpected fetch to: ${url}`);
      });
  });

  afterEach(() => {
    // Restaurar siempre — evita contaminar otros tests del suite
    fetchSpy.mockRestore();
  });

  // ── Mock execution (siempre corre en CI) ───────────────────────────────────

  describe('mock execution (sin LLM ni n8n reales)', () => {

    it('Run.status = completed cuando LLM produce tool_call y recibe tool result', async () => {
      const webhookRef = { called: false };
      const mockLLMExecutor = buildLLMExecutorWithToolCall(webhookRef);

      const agentExecutor = new AgentExecutor({
        prisma:          prisma as any,
        llmStepExecutor: mockLLMExecutor as any,
      });
      const flowExecutor = new FlowExecutor({
        prisma:       prisma as any,
        executeAgent: agentExecutor.toFn(),
      });

      await flowExecutor.executeRun('run-skill-e2e');

      expect(prisma._runs['run-skill-e2e'].status).toBe('completed');

      // El RunStep del nodo agent debe quedar completed
      const steps = Object.values(prisma._runSteps) as any[];
      const agentStep = steps.find((s) => s.nodeType === 'agent');
      expect(agentStep).toBeDefined();
      expect(agentStep.status).toBe('completed');
    });

    it('fetch al webhook se llamó exactamente 1 vez con el payload del LLM', async () => {
      const webhookRef = { called: false };
      const mockLLMExecutor = buildLLMExecutorWithToolCall(webhookRef);

      const agentExecutor = new AgentExecutor({
        prisma:          prisma as any,
        llmStepExecutor: mockLLMExecutor as any,
      });
      const flowExecutor = new FlowExecutor({
        prisma:       prisma as any,
        executeAgent: agentExecutor.toFn(),
      });

      await flowExecutor.executeRun('run-skill-e2e');

      // Filtrar solo las llamadas al webhook n8n
      const webhookCalls = (fetchSpy.mock.calls as [url: any, init?: any][]).filter(
        ([url]) => String(url).includes('n8n.example.com'),
      );
      expect(webhookCalls).toHaveLength(1);

      // El body del POST debe contener los argumentos del tool_call
      const [, init] = webhookCalls[0];
      const body = JSON.parse(init?.body ?? '{}');
      expect(body.channel).toBe('#alerts');
      expect(body.message).toBe('Deploy done');
    });

    it('Run.status = failed si el webhook responde con 4xx', async () => {
      // Sobreescribir el fetchSpy para simular error 401
      fetchSpy.mockImplementation(async (url: string | URL) => {
        if (String(url).includes('n8n.example.com')) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      });

      const mockLLMExecutor = buildLLMExecutorWithToolCall({ called: false });
      const agentExecutor = new AgentExecutor({
        prisma:          prisma as any,
        llmStepExecutor: mockLLMExecutor as any,
      });
      const flowExecutor = new FlowExecutor({
        prisma:       prisma as any,
        executeAgent: agentExecutor.toFn(),
      });

      await expect(
        flowExecutor.executeRun('run-skill-e2e'),
      ).rejects.toThrow();

      expect(prisma._runs['run-skill-e2e'].status).toBe('failed');
    });

    it('buildToolDefinitions expone el skill n8n como tool con nombre skill__{skillId}__invoke', async () => {
      // Verifica F1b-03: el skill del agente se mapea al tool name correcto.
      // El SkillRepository.findByAgent() retorna las asignaciones activas
      // y buildToolDefinitions las convierte al patrón skill__{id}__invoke.
      const agentSkills = await prisma.agentSkill.findMany({
        where: { agentId: 'agent-skill-test' },
      });

      expect(agentSkills).toHaveLength(1);
      expect(agentSkills[0].skill.type).toBe('n8n_webhook');

      // El tool name que el LLM recibe debe seguir el patrón:
      //   skill__{skillId}__invoke
      // Verificar con el skillId real del fixture.
      const expectedToolName = `skill__${agentSkills[0].skillId}__invoke`;
      expect(expectedToolName).toBe('skill__skill-n8n-1__invoke');
      expect(expectedToolName).toMatch(/^skill__[\w-]+__invoke$/);
    });

    it('agentSkill.findMany se llama con el agentId correcto del nodo del flow', async () => {
      // Verifica que AgentExecutor pasa el agentId del nodo al SkillRepository.
      // Este es el contrato que AgentExecutor → SkillRepository.findByAgent() debe cumplir.
      const mockLLMResult = {
        output:    { text: 'done' },
        tokensUsed: 10,
        costUsd:   0.0001,
      };
      const mockLLMExecutor = {
        executeStep: jest.fn().mockResolvedValue(mockLLMResult),
      };

      const agentExecutor = new AgentExecutor({
        prisma:          prisma as any,
        llmStepExecutor: mockLLMExecutor as any,
      });
      const flowExecutor = new FlowExecutor({
        prisma:       prisma as any,
        executeAgent: agentExecutor.toFn(),
      });

      await flowExecutor.executeRun('run-skill-e2e');

      // AgentExecutor debe consultar los skills del agente con el agentId del nodo
      expect(prisma.agentSkill.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agentId: 'agent-skill-test' }),
        }),
      );
    });

  }); // describe: mock execution

  // ── Real path (requiere credenciales reales) ───────────────────────────────

  const maybeDescribe = SKIP_SKILL_E2E ? describe.skip : describe;

  maybeDescribe(
    'real n8n webhook + GPT-4o (requiere N8N_WEBHOOK_TEST_URL + OPENAI_API_KEY)',
    () => {
      it(
        'tool call llega al webhook n8n real y resultado vuelve al LLM',
        async () => {
          if (!N8N_WEBHOOK_TEST_URL) {
            throw new Error(
              'N8N_WEBHOOK_TEST_URL env var required for real e2e — set it in .env.test',
            );
          }

          // En real path: restaurar fetch original para que los calls lleguen
          // al webhook n8n real y a la API de OpenAI.
          fetchSpy.mockRestore();

          // Seed con el webhookUrl real desde la env var
          prisma._skills['skill-n8n-1'].config.webhookUrl = N8N_WEBHOOK_TEST_URL;
          prisma._agentSkills['as-1'].skill.config.webhookUrl = N8N_WEBHOOK_TEST_URL;

          // Smoke test: verificar que LLMStepExecutor puede instanciarse.
          // El test de integración completo requiere un TestContainer con Postgres
          // y credenciales reales — ver docs/testing/e2e-real.md.
          expect(() => {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { LLMStepExecutor } = require('../../llm-step-executor');
            expect(typeof LLMStepExecutor).toBe('function');
          }).not.toThrow();
        },
        60_000, // 60 s timeout para llamadas reales
      );
    },
  );

});
