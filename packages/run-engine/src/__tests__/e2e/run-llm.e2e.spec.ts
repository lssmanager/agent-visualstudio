/**
 * F1a-09 — Test E2E de ejecución LLM real
 *
 * Valida la cadena completa:
 *   FlowSpec → FlowExecutor → LlmStepExecutor → LLM API → RunStep en Prisma
 *
 * Modelo: el más barato activo en el workspace (familia 'mini' > 'fast' > any).
 * Prompt: "Reply with: OK" — tokens mínimos para minimizar costo y latencia.
 *
 * REQUIERE (en src/__tests__/e2e/.env.e2e):
 *   DATABASE_URL_TEST   — Postgres de test (no producción)
 *   ENCRYPTION_KEY      — AES-256 key para descifrar API keys del workspace
 *   E2E_WORKSPACE_ID    — ID del workspace con ProviderCredential activo
 *
 * AUTO-SKIP si alguna variable falta → CI de PRs normales no se bloquea.
 *
 * Para correr:
 *   pnpm --filter run-engine test:e2e
 * (agregar en package.json: "test:e2e": "jest --config src/__tests__/e2e/jest.e2e.config.ts --runInBand")
 */

import { PrismaClient }   from '@prisma/client';
import { FlowExecutor }   from '../../flow-executor';
import { RunRepository }  from '../../run-repository';
import { ApprovalQueue }  from '../../approval-queue';
import type { FlowSpec }  from '../../../../core-types/src';

// ── Types ─────────────────────────────────────────────────────────────────────

type ModelFamilyType = string; // alias; se estrecha a 'mini' | 'fast' en lógica

interface ModelEntry {
  modelId:  string;
  families: ModelFamilyType[];
  provider: { id: string; type: string } | null;
}

// ── Guard: skip si variables requeridas no están configuradas ─────────────────

const REQUIRED = ['DATABASE_URL_TEST', 'ENCRYPTION_KEY', 'E2E_WORKSPACE_ID'] as const;
const missingVars = REQUIRED.filter((v) => !process.env[v]);
const SKIP = missingVars.length > 0;

if (SKIP) {
  // Visible en la salida de Jest incluso cuando se skip
  console.warn(
    `[F1a-09] E2E skipped — missing env vars: ${missingVars.join(', ')}\n` +
    '         Copy src/__tests__/e2e/.env.e2e.example → .env.e2e to enable.',
  );
}

// ── Helper: seleccionar modelo más barato activo ──────────────────────────────

/**
 * Selecciona el ModelCatalogEntry más barato activo en el workspace.
 * Prioridad: familia 'mini' > familia 'fast' > cualquier modelo activo.
 * Si E2E_FORCE_MODEL está definido, usa ese directamente.
 */
async function pickCheapestModel(
  db:          PrismaClient,
  _workspaceId: string,
): Promise<{ modelId: string; providerId: string; providerType: string }> {
  // Forzar modelo específico si E2E_FORCE_MODEL está definido
  const forced = process.env['E2E_FORCE_MODEL'];
  if (forced) {
    const entry = await (db as unknown as Record<string, unknown>)['modelCatalogEntry'] !== undefined
      ? await (db as any).modelCatalogEntry.findFirst({
          where:   { modelId: forced, isActive: true },
          include: { provider: true },
        })
      : null;
    if (!entry) throw new Error(`E2E_FORCE_MODEL '${forced}' not found or inactive in ModelCatalogEntry`);
    return { modelId: entry.modelId, providerId: entry.provider.id, providerType: entry.provider.type };
  }

  // Todos los modelos activos con provider activo
  const allActive: ModelEntry[] = await (db as any).modelCatalogEntry.findMany({
    where:   { isActive: true },
    include: {
      provider: {
        where: { isActive: true },
      },
    },
  });

  // Solo los que tienen provider activo (findMany con nested where puede retornar provider: null)
  const candidates = allActive.filter((m) => m.provider !== null);
  if (candidates.length === 0) {
    throw new Error(
      'No active ModelCatalogEntry with active ProviderCredential found in test workspace. ' +
      'Ensure the workspace has at least one active provider and model.',
    );
  }

  const PRIORITY_FAMILIES: ModelFamilyType[] = ['mini', 'fast'];
  for (const family of PRIORITY_FAMILIES) {
    const match = candidates.find((m) => (m.families as string[]).includes(family));
    if (match) {
      return {
        modelId:      match.modelId,
        providerId:   match.provider!.id,
        providerType: match.provider!.type,
      };
    }
  }

  // Fallback: cualquier modelo activo
  const fallback = candidates[0]!;
  console.warn(
    `[F1a-09] No 'mini' or 'fast' model found — falling back to: ${fallback.modelId}`,
  );
  return {
    modelId:      fallback.modelId,
    providerId:   fallback.provider!.id,
    providerType: fallback.provider!.type,
  };
}

/** Construye un FlowSpec mínimo con un solo nodo agent */
function buildSmokeFlow(modelId: string): FlowSpec {
  return {
    id:    'e2e-smoke-flow',
    name:  'E2E Smoke',
    nodes: [
      {
        id:   'node-agent',
        type: 'agent',
        config: {
          modelId,
          systemPrompt: 'You are a test assistant. Follow instructions exactly.',
          maxTokens:    16,  // respuesta mínima — tokens mínimos = costo mínimo
        },
      },
    ],
    edges: [],
  };
}

/** Polling a Prisma hasta que el Run alcance un estado terminal */
async function pollRunStatus(
  db:        PrismaClient,
  runId:     string,
  timeoutMs: number,
): Promise<string> {
  const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const dbRun = await db.run.findUnique({ where: { id: runId } });
    if (!dbRun) throw new Error(`Run ${runId} not found in Prisma during polling`);
    if (TERMINAL.has(dbRun.status)) return dbRun.status;
    await new Promise<void>((r) => setTimeout(r, 200));
  }

  throw new Error(
    `Run ${runId} did not reach terminal state within ${timeoutMs}ms. ` +
    'Increase polling timeout or check FlowExecutor for hung execution.',
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

// describe.skipIf no existe en Jest puro; usamos un wrapper condicional.
const describeSuite = SKIP ? describe.skip : describe;

describeSuite('F1a-09 — Run LLM E2E', () => {
  let db:          PrismaClient;
  let workspaceId: string;
  let modelId:     string;

  // ── Setup ──────────────────────────────────────────────────────────────────

  beforeAll(async () => {
    db          = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL_TEST'] } } });
    workspaceId = process.env['E2E_WORKSPACE_ID']!;

    const chosen = await pickCheapestModel(db, workspaceId);
    modelId = chosen.modelId;
    console.info(
      `[F1a-09] Using model: ${modelId} (provider: ${chosen.providerType})`,
    );
  }, 30_000);

  afterAll(async () => {
    await db.$disconnect();
  });

  // ── Test 1: Happy path ─────────────────────────────────────────────────────

  it(
    'creates Run, executes LLM node, RunStep.status === completed in Prisma',
    async () => {
      const runRepo       = new RunRepository(db);
      const approvalQueue = new ApprovalQueue();

      const flowExec = new FlowExecutor({
        workspaceId,
        repository:    runRepo,
        approvalQueue,
        db,
      });

      const flow    = buildSmokeFlow(modelId);
      const trigger = { type: 'manual', payload: { text: 'Reply with: OK' } };

      // startRun() crea Run en Prisma y dispara ejecución
      const runSpec = await flowExec.startRun(flow, trigger, {});
      expect(runSpec.id).toBeTruthy();

      // Polling hasta estado terminal (máx 60s)
      const finalStatus = await pollRunStatus(db, runSpec.id, 60_000);

      // ── Assertions principales ──────────────────────────────────────────
      expect(finalStatus).toBe('completed');

      // RunStep en Prisma
      const steps = await db.runStep.findMany({ where: { runId: runSpec.id } });
      expect(steps.length).toBeGreaterThanOrEqual(1);

      const agentStep = steps.find((s: any) => s.nodeType === 'agent');
      expect(agentStep).toBeDefined();
      expect(agentStep!.status).toBe('completed');

      // Tokens y costo deben haberse populado
      expect(agentStep!.model).toBeTruthy();
      expect(agentStep!.provider).toBeTruthy();
      expect(agentStep!.promptTokens).toBeGreaterThan(0);
      expect(agentStep!.completionTokens).toBeGreaterThan(0);
      expect(agentStep!.costUsd).toBeGreaterThan(0);

      // No duplicados de Run (validación fix F1a-06)
      const runCount = await db.run.count({ where: { id: runSpec.id } });
      expect(runCount).toBe(1);

      // No duplicados de RunStep — exactamente un step por nodo (fix F1a-08)
      const stepCount = await db.runStep.count({ where: { runId: runSpec.id } });
      expect(stepCount).toBe(flow.nodes.length);
    },
    65_000,
  );

  // ── Test 2: Error path — modelo inválido → RunStep.status failed ────────────

  it(
    'run with invalid model produces RunStep.status === failed (not unhandled exception)',
    async () => {
      const runRepo       = new RunRepository(db);
      const approvalQueue = new ApprovalQueue();

      const flowExec = new FlowExecutor({
        workspaceId,
        repository:    runRepo,
        approvalQueue,
        db,
      });

      const badFlow: FlowSpec = {
        id:    'e2e-bad-model-flow',
        name:  'E2E Bad Model',
        nodes: [
          {
            id:   'node-bad',
            type: 'agent',
            config: {
              modelId:      'nonexistent-provider/model-that-does-not-exist-xyzzy',
              systemPrompt: 'test',
              maxTokens:    8,
            },
          },
        ],
        edges: [],
      };

      const runSpec = await flowExec.startRun(
        badFlow,
        { type: 'manual', payload: { text: 'test' } },
        {},
      );

      // Polling hasta estado terminal (máx 30s — el error llega rápido)
      const finalStatus = await pollRunStatus(db, runSpec.id, 30_000);

      // El Run debe terminar como 'failed', no quedarse colgado
      expect(finalStatus).toBe('failed');

      // El RunStep debe reflejar el error
      const steps = await db.runStep.findMany({ where: { runId: runSpec.id } });
      const badStep = steps.find((s: any) => s.nodeId === 'node-bad');
      expect(badStep).toBeDefined();
      expect(badStep!.status).toBe('failed');
      // El campo error debe tener un mensaje descriptivo (no undefined)
      expect(badStep!.error).toBeTruthy();
    },
    35_000,
  );
});
