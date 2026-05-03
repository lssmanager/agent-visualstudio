/**
 * n8n-studio-helper.spec.ts
 *
 * Tests unitarios para N8nStudioHelper.createWorkflowFromDescription().
 * LLM, N8nService y PrismaService mockeados — sin llamadas reales.
 *
 * Criterio de aceptación F4b-05:
 *   Dado prompt "crea workflow que envíe email cuando llegue un lead"
 *   → LLM llamado con 3 args posicionales (messages, tools, opts)
 *   → N8nService.createWorkflowRaw() llamado con spec válido
 *   → Skill registrado en BD con type='n8n_webhook' y nombre canónico
 *
 * Patrón del proyecto: jest.fn() manuales + new Service() directo.
 * Ver: apps/api/src/modules/n8n/__tests__/n8n-connections.spec.ts
 */

import { N8nStudioHelper } from '../n8n-studio-helper';
import type { N8nService } from '../../n8n/n8n.service';
import type { PrismaService } from '../../lib/prisma.service';

// ── Mocks de dependencias externas ────────────────────────────────────────────

// Mock de resolveModelPolicy
const mockResolveModelPolicy = jest.fn().mockResolvedValue({ primaryModel: 'openai/gpt-4o' });
jest.mock('../../../../../packages/run-engine/src/policy-resolver', () => ({
  resolveModelPolicy: (...args: unknown[]) => mockResolveModelPolicy(...args),
}));

// Mock de buildLLMClient — devuelve cliente con chat() en la firma correcta
const mockChatFn = jest.fn();
jest.mock('../../../../../packages/run-engine/src/llm-client', () => ({
  buildLLMClient: jest.fn(() => ({ chat: mockChatFn })),
}));

// ── Fixtures de datos ─────────────────────────────────────────────────────────

const VALID_SPEC = {
  name: 'Lead Email Workflow',
  nodes: [
    {
      id:          'webhook-1',
      name:        'Webhook',
      type:        'n8n-nodes-base.webhook',
      typeVersion: 1,
      position:    [200, 200] as [number, number],
      parameters:  { path: 'lead-capture', httpMethod: 'POST' },
    },
    {
      id:          'email-1',
      name:        'Send Email',
      type:        'n8n-nodes-base.emailSend',
      typeVersion: 1,
      position:    [400, 200] as [number, number],
      parameters:  { toEmail: '={{ $json.email }}' },
    },
  ],
  connections: {
    Webhook: { main: [[{ node: 'Send Email', type: 'main', index: 0 }]] },
  },
};

const CREATED_WORKFLOW = {
  id:     'n8n-wf-abc123',
  name:   'Lead Email Workflow',
  active: false,
};

const SKILL_RECORD = {
  id: 'skill-uuid-1',
};

// ── Mocks de servicios ────────────────────────────────────────────────────────

// N8nService: Skill.name NO tiene @unique en el schema.
// El helper usa findFirst + update/create (ver n8n-studio-helper.ts paso 7).
const mockN8nService = {
  createWorkflowRaw: jest.fn().mockResolvedValue(CREATED_WORKFLOW),
} as unknown as N8nService;

const mockPrisma = {
  skill: {
    findFirst: jest.fn().mockResolvedValue(null),  // no existe → crear
    create:    jest.fn().mockResolvedValue(SKILL_RECORD),
    update:    jest.fn().mockResolvedValue(SKILL_RECORD),
  },
} as unknown as PrismaService;

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Restaurar defaults después de cada test
  mockChatFn.mockResolvedValue({ content: JSON.stringify(VALID_SPEC) });
  mockResolveModelPolicy.mockResolvedValue({ primaryModel: 'openai/gpt-4o' });
  (mockN8nService.createWorkflowRaw as jest.Mock).mockResolvedValue(CREATED_WORKFLOW);
  (mockPrisma.skill.findFirst as jest.Mock).mockResolvedValue(null);
  (mockPrisma.skill.create    as jest.Mock).mockResolvedValue(SKILL_RECORD);
  (mockPrisma.skill.update    as jest.Mock).mockResolvedValue(SKILL_RECORD);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('N8nStudioHelper.createWorkflowFromDescription()', () => {

  const makeHelper = () => new N8nStudioHelper(
    mockN8nService,
    mockPrisma,
  );

  const DEFAULT_OPTIONS = {
    description:  'crea un workflow que envíe email cuando llegue un lead',
    connectionId: 'conn-test-1',
    agentId:      'agent-test-1',
    workspaceId:  'ws-test-1',
    departmentId: 'dept-test-1',
    agencyId:     'agency-test-1',
  };

  // ── Caso principal: happy path ─────────────────────────────────────────────

  it('happy path: genera spec, crea workflow, registra Skill en BD', async () => {
    const result = await makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS);

    expect(result.n8nWorkflowId).toBe('n8n-wf-abc123');
    expect(result.name).toBe('Lead Email Workflow');
    expect(result.skillId).toBe('skill-uuid-1');
    expect(result.active).toBe(false);
    expect(result.generatedSpec).toEqual(VALID_SPEC);
  });

  // ── LLM: firma correcta (3 args posicionales) ─────────────────────────────

  it('llama a llmClient.chat() con 3 args posicionales (messages, tools, opts)', async () => {
    await makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS);

    expect(mockChatFn).toHaveBeenCalledTimes(1);
    const [messages, tools, opts] = mockChatFn.mock.calls[0] as [
      Array<{ role: string; content: string }>,
      unknown[],
      { model: string; temperature: number; maxTokens: number },
    ];

    // Primer arg: array de mensajes con system + user
    expect(Array.isArray(messages)).toBe(true);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toContain(DEFAULT_OPTIONS.description);

    // Segundo arg: tools vacío
    expect(tools).toEqual([]);

    // Tercer arg: opts con maxTokens camelCase (no max_tokens)
    expect(opts).toMatchObject({
      temperature: expect.any(Number),
      maxTokens:   expect.any(Number),
    });
    expect(opts).not.toHaveProperty('max_tokens');
    expect(opts).not.toHaveProperty('response_format');
  });

  // ── ModelPolicy: cascada con fallback ─────────────────────────────────────

  it('usa el modelo resuelto por ModelPolicy', async () => {
    mockResolveModelPolicy.mockResolvedValueOnce({ primaryModel: 'anthropic/claude-3-5-sonnet' });

    await makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS);

    const [,, opts] = mockChatFn.mock.calls[0] as [unknown, unknown, { model: string }];
    expect(opts.model).toBe('anthropic/claude-3-5-sonnet');
  });

  it('usa gpt-4o como fallback cuando ModelPolicy no retorna modelo', async () => {
    mockResolveModelPolicy.mockResolvedValueOnce(null);

    await makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS);

    const [,, opts] = mockChatFn.mock.calls[0] as [unknown, unknown, { model: string }];
    expect(opts.model).toBe('openai/gpt-4o');
  });

  it('usa gpt-4o como fallback cuando resolveModelPolicy lanza error', async () => {
    mockResolveModelPolicy.mockRejectedValueOnce(new Error('DB unreachable'));

    // No debe lanzar — debe continuar con fallback
    await expect(
      makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS),
    ).resolves.toBeDefined();

    const [,, opts] = mockChatFn.mock.calls[0] as [unknown, unknown, { model: string }];
    expect(opts.model).toBe('openai/gpt-4o');
  });

  // ── N8nService: createWorkflowRaw llamado correctamente ───────────────────

  it('llama a N8nService.createWorkflowRaw() con spec completo y settings', async () => {
    await makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS);

    expect(mockN8nService.createWorkflowRaw).toHaveBeenCalledTimes(1);
    expect(mockN8nService.createWorkflowRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        name:        VALID_SPEC.name,
        nodes:       VALID_SPEC.nodes,
        connections: VALID_SPEC.connections,
        active:      false,   // activate no fue pasado → default false
        settings:    expect.objectContaining({ executionOrder: 'v1' }),
      }),
    );
  });

  it('pasa active:true a createWorkflowRaw() cuando options.activate=true', async () => {
    await makeHelper().createWorkflowFromDescription({ ...DEFAULT_OPTIONS, activate: true });
    expect(mockN8nService.createWorkflowRaw).toHaveBeenCalledWith(
      expect.objectContaining({ active: true }),
    );
  });

  // ── Skill en BD: nombre canónico + type correcto ──────────────────────────

  it('registra Skill con nombre canónico n8n:{connectionId}:{workflowId}', async () => {
    await makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS);

    const expectedName = `n8n:${DEFAULT_OPTIONS.connectionId}:${CREATED_WORKFLOW.id}`;

    // El helper usa findFirst (→ null) → create
    expect(mockPrisma.skill.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name:        expectedName,
          type:        'n8n_webhook',
          workspaceId: DEFAULT_OPTIONS.workspaceId,
        }),
      }),
    );
  });

  it('actualiza Skill existente si findFirst devuelve un registro', async () => {
    const existingSkill = { id: 'skill-existing-1' };
    (mockPrisma.skill.findFirst as jest.Mock).mockResolvedValueOnce(existingSkill);

    const result = await makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS);

    expect(mockPrisma.skill.create).not.toHaveBeenCalled();
    expect(mockPrisma.skill.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: existingSkill.id } }),
    );
    expect(result.skillId).toBe(SKILL_RECORD.id);
  });

  it('retorna skillId del Skill creado en BD', async () => {
    const result = await makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS);
    expect(result.skillId).toBe(SKILL_RECORD.id);
  });

  // ── webhookUrl: extraída del nodo webhook ─────────────────────────────────

  it('extrae webhookUrl del nodo n8n-nodes-base.webhook', async () => {
    // VALID_SPEC tiene nodo webhook con path: 'lead-capture'
    const result = await makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS);
    // La URL incluye /webhook/{path}
    expect(result.webhookUrl).toMatch(/\/webhook\/lead-capture$/);
  });

  it('webhookUrl es undefined si el spec no tiene nodo webhook', async () => {
    const specSinWebhook = {
      ...VALID_SPEC,
      nodes: VALID_SPEC.nodes.filter(n => n.type !== 'n8n-nodes-base.webhook'),
    };
    mockChatFn.mockResolvedValueOnce({ content: JSON.stringify(specSinWebhook) });
    const result = await makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS);
    expect(result.webhookUrl).toBeUndefined();
  });

  // ── Manejo de errores ─────────────────────────────────────────────────────

  it('lanza error descriptivo cuando el LLM devuelve JSON inválido', async () => {
    mockChatFn.mockResolvedValueOnce({ content: 'no es json {{{' });
    await expect(
      makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS),
    ).rejects.toThrow('[N8nStudioHelper] LLM returned invalid JSON');
  });

  it('lanza error cuando el spec no tiene nodes o nodes está vacío', async () => {
    mockChatFn.mockResolvedValueOnce({
      content: JSON.stringify({ name: 'X', nodes: [], connections: {} }),
    });
    await expect(
      makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS),
    ).rejects.toThrow(/nodes/i);
  });

  it('lanza error cuando el spec no tiene name', async () => {
    mockChatFn.mockResolvedValueOnce({
      content: JSON.stringify({ nodes: VALID_SPEC.nodes, connections: {} }),
    });
    await expect(
      makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS),
    ).rejects.toThrow(/name/i);
  });

  it('acepta spec sin connections y lo normaliza a {}', async () => {
    const specSinConnections = { name: VALID_SPEC.name, nodes: VALID_SPEC.nodes };
    mockChatFn.mockResolvedValueOnce({ content: JSON.stringify(specSinConnections) });
    await expect(
      makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS),
    ).resolves.toBeDefined();
    expect(mockN8nService.createWorkflowRaw).toHaveBeenCalledWith(
      expect.objectContaining({ connections: {} }),
    );
  });

  it('lanza error con prefijo [N8nStudioHelper] cuando createWorkflowRaw falla', async () => {
    (mockN8nService.createWorkflowRaw as jest.Mock).mockRejectedValueOnce(
      new Error('n8n API down'),
    );
    await expect(
      makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS),
    ).rejects.toThrow('[N8nStudioHelper]');
  });

  it('lanza error con prefijo [N8nStudioHelper] cuando el LLM call falla', async () => {
    mockChatFn.mockRejectedValueOnce(new Error('rate limit'));
    await expect(
      makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS),
    ).rejects.toThrow('[N8nStudioHelper] LLM call failed');
  });

  it('lanza error con prefijo [N8nStudioHelper] cuando el Skill persist falla', async () => {
    (mockPrisma.skill.create as jest.Mock).mockRejectedValueOnce(
      new Error('unique constraint'),
    );
    await expect(
      makeHelper().createWorkflowFromDescription(DEFAULT_OPTIONS),
    ).rejects.toThrow('[N8nStudioHelper] Prisma skill persist failed');
  });

});
