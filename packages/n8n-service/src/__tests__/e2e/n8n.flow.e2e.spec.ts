/**
 * n8n.flow.e2e.spec.ts
 *
 * F4a-07 — Test E2E: Flow con nodo n8n_webhook ejecuta workflow real
 *
 * Este test valida el camino completo extremo a extremo:
 *   Flow (nodo n8n_webhook) → N8nService.triggerWorkflow() → n8n real → result.status === 'success'
 *
 * Es la prueba de cierre del milestone F4a — Integración N8N Completa.
 * NO usa mocks de N8nService, N8nClient ni fetch para los happy-path tests.
 *
 * Variables de entorno requeridas (leer de process.env, nunca hardcodear):
 *   N8N_BASE_URL           — e.g. http://localhost:5678
 *   N8N_API_KEY            — X-N8N-API-KEY para la REST API de n8n
 *   DATABASE_URL           — PostgreSQL con el schema canónico de F0
 *   SECRETS_ENCRYPTION_KEY — 64 hex chars para AES-256-GCM
 *
 * Si N8N_BASE_URL o N8N_API_KEY no están configuradas, todos los tests
 * hacen skip automático con mensaje claro.
 *
 * Setup:
 *   beforeAll — crea N8nConnection en BD + workflow mínimo en n8n via createWorkflow()
 * Teardown:
 *   afterAll  — borra workflow en n8n + limpia N8nWorkflow, Skill, N8nConnection en Prisma
 */

import { encrypt }      from '@lss/crypto';
import { PrismaClient } from '@prisma/client';
import { N8nService }   from '../../n8n.service';

// ── Skip guard ────────────────────────────────────────────────────────────────

const E2E_SKIP = !process.env.N8N_BASE_URL || !process.env.N8N_API_KEY;

// ── Suite principal ───────────────────────────────────────────────────────────

describe('F4a-07 E2E: n8n_webhook flow executes real workflow', () => {
  let service:           N8nService;
  let prisma:            PrismaClient;
  let createdWorkflowId: string;
  let connectionId:      string;

  jest.setTimeout(60_000);

  // ── Setup ─────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    if (E2E_SKIP) return;

    prisma = new PrismaClient();

    service = new N8nService({
      baseUrl:        process.env.N8N_BASE_URL!,
      apiKey:         process.env.N8N_API_KEY!,
      pollIntervalMs: 1_000,
      maxWaitMs:      30_000,
      prisma,
    });

    // 1. Crear N8nConnection en BD (necesaria para syncWorkflows + createWorkflow)
    //    La apiKey se encripta con @lss/crypto para cumplir el contrato de la BD.
    const apiKeyEncrypted = encrypt(process.env.N8N_API_KEY!);

    const conn = await prisma.n8nConnection.create({
      data: {
        name:            'e2e-test-connection-F4a07',
        baseUrl:         process.env.N8N_BASE_URL!,
        apiKeyEncrypted,
        isActive:        true,
      },
    });
    connectionId = conn.id;

    // 2. Crear workflow mínimo en n8n:
    //    Un solo nodo Webhook que responde { result: 'ok' } inmediatamente.
    //    activate=true para que triggerWorkflow() pueda ejecutarlo.
    //    syncToSkills=true para que queden upsertadas las filas en Prisma.
    const created = await service.createWorkflow({
      connectionId,
      name: 'E2E Test Workflow F4a-07',
      nodes: [
        {
          id:          'webhook-node-1',
          name:        'Webhook',
          type:        'n8n-nodes-base.webhook',
          typeVersion: 2,
          position:    [0, 0],
          parameters:  {
            path:         'test-e2e-f4a07',
            httpMethod:   'POST',
            responseMode: 'lastNode',
          },
        },
      ],
      connections:  {},
      activate:     true,
      syncToSkills: true,
    });

    createdWorkflowId = created.n8nWorkflowId;
  });

  // ── Teardown ──────────────────────────────────────────────────────────────

  afterAll(async () => {
    if (E2E_SKIP || !createdWorkflowId) return;

    // Borrar workflow en n8n
    await fetch(
      `${process.env.N8N_BASE_URL}/api/v1/workflows/${createdWorkflowId}`,
      {
        method:  'DELETE',
        headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY! },
      },
    ).catch(() => {
      // Si ya fue borrado o n8n no está disponible, ignorar
    });

    // Limpiar Prisma — orden importa por foreign keys
    await prisma.n8nWorkflow
      .deleteMany({ where: { n8nWorkflowId: createdWorkflowId } })
      .catch(() => {});

    await prisma.skill
      .deleteMany({ where: { name: { contains: connectionId } } })
      .catch(() => {});

    await prisma.n8nConnection
      .deleteMany({ where: { id: connectionId } })
      .catch(() => {});

    await prisma.$disconnect();
  });

  // ── Tests ─────────────────────────────────────────────────────────────────

  it('triggerWorkflow returns status success and outputData from n8n', async () => {
    if (E2E_SKIP) {
      return test.skip(
        'N8N_BASE_URL or N8N_API_KEY not set — skipping e2e test',
      );
    }

    expect(createdWorkflowId).toBeTruthy();

    const result = await service.triggerWorkflow({
      workflowId:     createdWorkflowId,
      inputData:      { test: true, source: 'e2e-F4a07' },
      pollIntervalMs: 1_000,
      maxWaitMs:      30_000,
    });

    // El workflow debe terminar correctamente
    expect(result.status).toBe('success');
    expect(result.executionId).toBeTruthy();
    expect(typeof result.executionId).toBe('string');
    expect(result.executionId.length).toBeGreaterThan(0);

    // outputData debe existir con contenido
    expect(result.outputData).toBeDefined();
    expect(result.outputData).not.toBeNull();

    // Timing
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.timedOut).toBeFalsy();

    // No debe haber error en happy path
    expect(result.error).toBeUndefined();
  });

  it('triggerWorkflow with fireAndForget returns status pending immediately', async () => {
    if (E2E_SKIP) {
      return test.skip(
        'N8N_BASE_URL or N8N_API_KEY not set — skipping e2e test',
      );
    }

    expect(createdWorkflowId).toBeTruthy();

    const result = await service.triggerWorkflow({
      workflowId:    createdWorkflowId,
      inputData:     { test: true, mode: 'fireAndForget' },
      fireAndForget: true,
    });

    // En fireAndForget: retorna inmediatamente con status pending
    expect(result.status).toBe('pending');
    expect(result.executionId).toBeTruthy();

    // Debe ser rápido — no espera el polling
    expect(result.durationMs).toBeLessThan(5_000);

    // No hay outputData en fire-and-forget
    expect(result.outputData).toBeUndefined();
  });

  it('triggerWorkflow with invalid workflowId returns status error', async () => {
    if (E2E_SKIP) {
      return test.skip(
        'N8N_BASE_URL or N8N_API_KEY not set — skipping e2e test',
      );
    }

    // workflowId inválido — n8n retornará 404; N8nClient lanza error con texto 'failed (4'
    const result = await service.triggerWorkflow({
      workflowId: 'nonexistent-workflow-id-000',
      inputData:  { test: true },
    });

    // Debe capturar el error y retornar status=error
    expect(result.status).toBe('error');
    expect(result.error).toBeTruthy();
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);

    // executionId vacío porque el trigger falló
    expect(result.executionId).toBe('');
  });

  it('syncWorkflows upserts N8nWorkflow and Skill in Prisma after createWorkflow', async () => {
    if (E2E_SKIP) {
      return test.skip(
        'N8N_BASE_URL or N8N_API_KEY not set — skipping e2e test',
      );
    }

    expect(connectionId).toBeTruthy();
    expect(createdWorkflowId).toBeTruthy();

    // Llamar syncWorkflows para asegurar que los datos están en Prisma
    const syncResult = await service.syncWorkflows(connectionId);

    // SyncResult debe reportar al menos 1 workflow upsertado
    expect(syncResult.upserted).toBeGreaterThanOrEqual(1);
    expect(syncResult.errors).toHaveLength(0);
    expect(syncResult.connectionId).toBe(connectionId);

    // Verificar N8nWorkflow en BD
    const workflow = await prisma.n8nWorkflow.findFirst({
      where: { n8nWorkflowId: createdWorkflowId },
    });

    expect(workflow).not.toBeNull();
    expect(workflow!.webhookUrl).toMatch(/^http/);
    expect(workflow!.isActive).toBe(true);
    expect(workflow!.connectionId).toBe(connectionId);

    // Verificar Skill con type=n8n_webhook en BD
    //   name pattern: 'n8n:{connectionId}:{workflowId}' (ver n8n.service.ts syncWorkflows)
    const skill = await prisma.skill.findFirst({
      where: {
        type: 'n8n_webhook',
        name: { contains: connectionId },
      },
    });

    expect(skill).not.toBeNull();
    expect(skill!.type).toBe('n8n_webhook');

    // config.webhookUrl debe ser una URL http válida
    const skillConfig = skill!.config as Record<string, unknown>;
    expect(typeof skillConfig.webhookUrl).toBe('string');
    expect((skillConfig.webhookUrl as string)).toMatch(/^http/);

    // Verificar via prisma.skill.findFirst con path filter (patrón del issue)
    const skillByPath = await prisma.skill.findFirst({
      where: {
        type:   'n8n_webhook',
        config: { path: ['webhookUrl'] },
      },
    });
    expect(skillByPath).not.toBeNull();
  });
});
