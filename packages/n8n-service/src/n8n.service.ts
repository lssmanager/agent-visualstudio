/**
 * n8n.service.ts
 *
 * Orchestrates three concerns:
 *
 * 1. triggerWorkflow() — Canvas orchestrator path
 *    Uses the n8n REST API (POST /api/v1/workflows/:id/execute).
 *    Returns executionId then polls for the final result.
 *    Credentials are provided at construction time via N8nServiceConfig.
 *
 * 2. syncWorkflows() — Sync / discovery path (F1b-06)
 *    Reads N8nConnection from Prisma, decrypts the API key (AES-256-GCM),
 *    fetches the workflow list from n8n, and upserts N8nWorkflow + Skill rows.
 *    Credentials come from the DB per connectionId — not from constructor config.
 *
 * 3. getWorkflowsAsSkills() / getAllWorkflowsAsSkills() — Adapter path (F1b-07)
 *    Reads N8nWorkflow rows already synced in DB and maps them to BridgedSkillSpec[]
 *    so that skillsToMcpTools() can mount them as LLM tools.
 *    No n8n API call — pure DB read + type mapping.
 *
 * ── Architectural distinction from skill-invoker.invokeN8nWebhook() ──
 *
 *   invokeN8nWebhook()            N8nService
 *   ──────────────────────────    ─────────────────────────────────────
 *   Skill webhook URL             Internal n8n workflow ID
 *   HTTP POST → immediate resp    REST API → executionId → polling
 *   No API key required           X-N8N-API-KEY required
 *   LLM tool-call path            Canvas orchestrator / sync path
 *
 * ── Encrypted secret format (shared with GatewayService) ──
 *
 *   AES-256-GCM stored as hex:
 *   [12 bytes IV][16 bytes auth tag][N bytes ciphertext]
 *   Key: process.env.N8N_SECRET ?? process.env.CHANNEL_SECRET (64 hex chars = 32 bytes)
 *
 * ── Tool name pattern (skill-bridge.ts line 38) ──
 *
 *   skill__{skill.id}__{fn.name}
 *   → skill__n8n_{n8nWorkflowId}__invoke
 */

import { createDecipheriv }                    from 'crypto';
import { N8nClient, type N8nClientConfig, type N8nExecutionResult } from './n8n-client';
import type {
  BridgedSkillSpec,
  N8nApiListResponse,
  N8nPrismaClient,
  N8nWorkflowDto,
  SyncResult,
}                                              from './n8n.types';

// ── Private constants ─────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS   = 2_000;   // 2 s between polls
const DEFAULT_MAX_WAIT_MS        = 120_000; // 2 min maximum wait
const DEFAULT_MAX_RETRIES        = 2;       // network-error retries on trigger
const SYNC_FETCH_TIMEOUT_MS      = 10_000;  // 10 s timeout for n8n API calls in sync

/** Execution statuses that mean the workflow has finished (success or failure). */
const TERMINAL_STATUSES = new Set<N8nExecutionResult['status']>([
  'success', 'error', 'canceled',
]);

// ── Public types ───────────────────────────────────────────────────────────

export type { SyncResult, N8nPrismaClient, BridgedSkillSpec } from './n8n.types';

export interface TriggerWorkflowOptions {
  /** Internal n8n workflow ID */
  workflowId:      string;
  /** Input data forwarded to the workflow trigger node. Default: {} */
  inputData?:      Record<string, unknown>;
  /**
   * When true: fire the workflow and return immediately with status:'pending'.
   * No polling is performed. Useful for long-running or webhook-waiting workflows.
   * Default: false
   */
  fireAndForget?:  boolean;
  /** Override the service-level maxWaitMs for this single invocation. */
  maxWaitMs?:      number;
  /** Override the service-level pollIntervalMs for this single invocation. */
  pollIntervalMs?: number;
}

export interface TriggerWorkflowResult {
  /** n8n execution ID returned by the trigger call */
  executionId:  string;
  /** Terminal status, or 'pending' in fireAndForget mode, or 'running'/'new' on timeout */
  status:       N8nExecutionResult['status'] | 'pending';
  /** Workflow output data — undefined when fireAndForget=true or on error/timeout */
  outputData?:  Record<string, unknown>;
  /** Error message when status === 'error' or trigger failed */
  error?:       string;
  /** true when polling stopped because maxWaitMs elapsed before a terminal status */
  timedOut?:    boolean;
  /** Wall-clock duration of the entire triggerWorkflow() call in ms */
  durationMs:   number;
}

export interface N8nServiceConfig extends N8nClientConfig {
  /** Polling interval in ms. Default: 2000 */
  pollIntervalMs?: number;
  /** Maximum time to wait for polling in ms. Default: 120_000 */
  maxWaitMs?:      number;
  /** Retries on network errors when triggering. Default: 2 */
  maxRetries?:     number;
  /**
   * Prisma client instance — required for syncWorkflows() and getWorkflowsAsSkills().
   * Optional here to preserve backward compatibility with F1b-05 tests.
   * The generated PrismaClient satisfies N8nPrismaClient automatically.
   */
  prisma?:         N8nPrismaClient;
}

// ── N8nService ────────────────────────────────────────────────────────────

export class N8nService {
  private readonly client:          N8nClient;
  private readonly pollIntervalMs:  number;
  private readonly maxWaitMs:       number;
  private readonly maxRetries:      number;
  private readonly prisma?:         N8nPrismaClient;

  constructor(config: N8nServiceConfig) {
    this.client          = new N8nClient(config);
    this.pollIntervalMs  = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxWaitMs       = config.maxWaitMs      ?? DEFAULT_MAX_WAIT_MS;
    this.maxRetries      = config.maxRetries     ?? DEFAULT_MAX_RETRIES;
    this.prisma          = config.prisma;
  }

  // ── triggerWorkflow() ─────────────────────────────────────────────────

  /**
   * Triggers a complete n8n workflow and waits for its final result.
   *
   * Steps:
   *  1. POST /api/v1/workflows/:id/execute — get executionId
   *     Retries up to maxRetries times on network/timeout errors.
   *     Does NOT retry on 4xx (bad request, not found, etc.).
   *  2. Poll GET /api/v1/executions/:id — until terminal status or timeout.
   *     Network errors in polling are silently ignored; loop continues.
   *  3. Return TriggerWorkflowResult with status, outputData, and timing.
   *
   * If options.fireAndForget === true: only step 1 is performed.
   */
  async triggerWorkflow(options: TriggerWorkflowOptions): Promise<TriggerWorkflowResult> {
    const t0             = Date.now();
    const inputData      = options.inputData      ?? {};
    const maxWaitMs      = options.maxWaitMs      ?? this.maxWaitMs;
    const pollIntervalMs = options.pollIntervalMs ?? this.pollIntervalMs;

    // ── Step 1: trigger with retry on network errors ──────────────────
    let executionId:      string | undefined;
    let lastTriggerError: Error  | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const triggered = await this.client.executeWorkflow(
          options.workflowId,
          inputData,
        );
        executionId = triggered.executionId;
        break;
      } catch (err) {
        lastTriggerError = err instanceof Error ? err : new Error(String(err));
        // Only retry on network / timeout errors — not on 4xx Bad Request
        const isClientError = lastTriggerError.message.includes('failed (4');
        if (isClientError || attempt >= this.maxRetries) break;
        await sleep(500 * (attempt + 1)); // 500ms then 1000ms
      }
    }

    if (!executionId) {
      return {
        executionId: '',
        status:      'error',
        error:       lastTriggerError?.message ?? 'Failed to trigger workflow',
        durationMs:  Date.now() - t0,
      };
    }

    // ── Step 2: fire and forget ──────────────────────────────────────
    if (options.fireAndForget) {
      return {
        executionId,
        status:     'pending',
        durationMs: Date.now() - t0,
      };
    }

    // ── Step 3: poll until terminal status or timeout ─────────────────
    const deadline = Date.now() + maxWaitMs;
    let lastExecution: N8nExecutionResult | undefined;

    while (Date.now() < deadline) {
      await sleep(pollIntervalMs);
      try {
        lastExecution = await this.client.getExecution(executionId);
      } catch {
        // Network error during polling — ignore and keep waiting
        continue;
      }
      if (TERMINAL_STATUSES.has(lastExecution.status)) break;
    }

    // ── Step 4: check timeout ────────────────────────────────────────
    if (!lastExecution || !TERMINAL_STATUSES.has(lastExecution.status)) {
      return {
        executionId,
        status:     lastExecution?.status ?? 'running',
        timedOut:   true,
        error:      `Workflow execution did not complete within ${maxWaitMs}ms`,
        durationMs: Date.now() - t0,
      };
    }

    // ── Step 5: build final result ───────────────────────────────────
    return {
      executionId,
      status:     lastExecution.status,
      outputData: lastExecution.data,
      error:      lastExecution.status === 'error' ? lastExecution.error : undefined,
      durationMs: Date.now() - t0,
    };
  }

  // ── syncWorkflows() ───────────────────────────────────────────────────

  /**
   * Discovers and upserts all active workflows from an n8n connection.
   *
   * Steps:
   *  1. Load N8nConnection from Prisma — throws if not found or inactive.
   *  2. Decrypt the API key (AES-256-GCM) — throws if N8N_SECRET not set.
   *  3. Fetch GET /api/v1/workflows from n8n — non-2xx / network errors
   *     are captured in errors[] (not thrown), method returns early.
   *  4. For each workflow:
   *     a. Skip if active=false (increment skipped).
   *     b. Resolve webhook URL from the webhook node's path.
   *     c. Upsert N8nWorkflow using @@unique([connectionId, n8nWorkflowId]).
   *     d. Upsert Skill using name = 'n8n:{connectionId}:{workflowId}'.
   *     e. Errors per workflow are captured in errors[] — loop continues.
   *  5. Return SyncResult.
   *
   * @throws Error if N8nConnection is not found, inactive, or N8N_SECRET is missing.
   */
  async syncWorkflows(connectionId: string): Promise<SyncResult> {
    const result: SyncResult = {
      connectionId,
      upserted: 0,
      skipped:  0,
      errors:   [],
    };

    if (!this.prisma) {
      throw new Error('N8nService: prisma client is required for syncWorkflows()');
    }
    const prisma = this.prisma;

    // ── Step 1: load connection from Prisma ──────────────────────────
    const conn = await prisma.n8nConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });

    if (!conn.isActive) {
      throw new Error('N8nConnection is inactive');
    }

    // ── Step 2: decrypt API key ───────────────────────────────────────
    const secretKeyHex = process.env['N8N_SECRET'] ?? process.env['CHANNEL_SECRET'];
    if (!secretKeyHex) {
      throw new Error('N8N_SECRET not configured');
    }
    // Validate secret key is a valid hex string of 32 or 64 bytes (64 or 128 hex characters)
    if (!/^[0-9a-fA-F]{64}$|^[0-9a-fA-F]{128}$/.test(secretKeyHex)) {
      throw new Error('N8N_SECRET must be a valid hex string of 32 or 64 bytes');
    }
    // Validate apiKeyEncrypted is a non-empty string in expected format
    if (!conn.apiKeyEncrypted || typeof conn.apiKeyEncrypted !== 'string' || conn.apiKeyEncrypted.trim() === '') {
      throw new Error('apiKeyEncrypted malformed');
    }
    const apiKey = this.decryptApiKey(conn.apiKeyEncrypted, secretKeyHex);

    // ── Step 3: fetch workflow list from n8n ──────────────────────────
    let workflows: N8nWorkflowDto[];
    try {
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), SYNC_FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(
          `${conn.baseUrl.replace(/\/$/, '')}/api/v1/workflows`,
          {
            method:  'GET',
            signal:  controller.signal,
            headers: {
              'Content-Type':  'application/json',
              'X-N8N-API-KEY': apiKey,
            },
          },
        );
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        result.errors.push({
          workflowId: connectionId,
          reason:     `n8n API error: ${res.status}`,
        });
        return result;
      }

      const body = await res.json() as N8nApiListResponse;
      workflows = body.data ?? [];
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      result.errors.push({ workflowId: connectionId, reason });
      return result;
    }

    // ── Step 4: upsert each active workflow ───────────────────────────
    for (const wf of workflows) {
      // a. Skip inactive
      if (!wf.active) {
        result.skipped++;
        continue;
      }

      try {
        // b. Resolve webhook URL
        const webhookNode = wf.nodes?.find(
          (n) => n.type === 'n8n-nodes-base.webhook',
        );
        const webhookPath = webhookNode?.parameters?.path ?? wf.id;
        const webhookUrl  = `${conn.baseUrl.replace(/\/$/, '')}/webhook/${webhookPath}`;
        const method      = (webhookNode?.parameters?.httpMethod ?? 'POST').toUpperCase();

        // c. & d. Upsert N8nWorkflow and Skill atomically within a transaction
        const skillName = `n8n:${connectionId}:${wf.id}`;
        await prisma.$transaction(async (tx) => {
          // c. Upsert N8nWorkflow
          await tx.n8nWorkflow.upsert({
            where: {
              connectionId_n8nWorkflowId: { connectionId, n8nWorkflowId: wf.id },
            },
            create: {
              connectionId,
              n8nWorkflowId: wf.id,
              name:          wf.name,
              webhookUrl,
              isActive:      true,
            },
            update: {
              name:      wf.name,
              webhookUrl,
              isActive:  true,
              updatedAt: new Date(),
            },
          });

          // d. Upsert Skill
          //    Skill.name is @unique — use 'n8n:{connectionId}:{workflowId}' to avoid collisions.
          await tx.skill.upsert({
            where:  { name: skillName },
            create: {
              name:        skillName,
              description: wf.name,
              type:        'n8n_webhook',
              config:      { webhookUrl, method },
              schema:      null,
            },
            update: {
              description: wf.name,
              config:      { webhookUrl, method },
              updatedAt:   new Date(),
            },
          });
        });

        // e. Count success
        result.upserted++;
      } catch (err) {
        // f. Per-workflow error — do not abort the loop
        const reason = err instanceof Error ? err.message : String(err);
        result.errors.push({ workflowId: wf.id, reason });
      }
    }

    // ── Step 5: return ────────────────────────────────────────────────
    return result;
  }

  // ── getWorkflowsAsSkills() ────────────────────────────────────────────

  /**
   * Returns active N8nWorkflow rows for a connection mapped as BridgedSkillSpec[].
   *
   * This is a pure DB read + type mapping — no n8n API call is made.
   * The resulting specs can be passed directly to skillsToMcpTools() from
   * packages/mcp-server/src/skill-bridge.ts.
   *
   * Tool name generated downstream by skill-bridge:
   *   skill__n8n_{n8nWorkflowId}__invoke
   *
   * @param connectionId  ID of the N8nConnection to read workflows from.
   * @returns             Empty array if no active workflows with a webhookUrl exist.
   * @throws              Error if prisma client was not provided at construction.
   */
  async getWorkflowsAsSkills(connectionId: string): Promise<BridgedSkillSpec[]> {
    if (!this.prisma) {
      throw new Error('N8nService: prisma client is required for getWorkflowsAsSkills()');
    }

    // ── Step 1: query active workflows with a non-null webhookUrl ────
    const workflows = await this.prisma.n8nWorkflow.findMany({
      where: {
        connectionId,
        isActive:   true,
        webhookUrl: { not: null },
      },
    });

    if (workflows.length === 0) {
      return [];
    }

    // ── Step 2: map each row to BridgedSkillSpec ─────────────────────
    return workflows.map((wf) => {
      // inputSchema null → omit the field (undefined) so skill-bridge
      // falls back to z.object({}).passthrough() instead of receiving null.
      const inputSchema =
        wf.inputSchema != null
          ? (wf.inputSchema as Record<string, unknown>)
          : undefined;

      return {
        id:          `n8n_${wf.n8nWorkflowId}`,
        name:        wf.name,
        description: wf.description ?? wf.name,
        category:    'n8n',
        endpoint:    wf.webhookUrl!,   // non-null guaranteed by WHERE { not: null }
        functions: [
          {
            name:        'invoke',
            description: `Invoke n8n workflow: ${wf.name}`,
            ...(inputSchema !== undefined ? { inputSchema } : {}),
          },
        ],
      } satisfies BridgedSkillSpec;
    });
  }

  // ── getAllWorkflowsAsSkills() ──────────────────────────────────────────

  /**
   * Aggregates BridgedSkillSpec[] across ALL active N8nConnections.
   *
   * Useful for AgentExecutor when building the full tool context for an agent
   * that may have n8n_webhook skills from multiple connections.
   *
   * @returns  Flat array of BridgedSkillSpec from every active connection.
   *           Returns [] when no active connections or workflows exist.
   * @throws   Error if prisma client was not provided at construction.
   */
  async getAllWorkflowsAsSkills(): Promise<BridgedSkillSpec[]> {
    if (!this.prisma) {
      throw new Error('N8nService: prisma client is required for getAllWorkflowsAsSkills()');
    }

    const connections = await this.prisma.n8nConnection.findMany({
      where:  { isActive: true },
      select: { id: true },
    });

    if (connections.length === 0) {
      return [];
    }

    const perConnection = await Promise.all(
      connections.map((c) => this.getWorkflowsAsSkills(c.id)),
    );

    return perConnection.flat();
  }

  // ── Private helpers ───────────────────────────────────────────────────

  /**
   * Decrypts an AES-256-GCM encrypted hex string.
   *
   * Encrypted format (matches GatewayService):
   *   [12 bytes IV][16 bytes auth tag][N bytes ciphertext]  — all as a single hex string
   *
   * @param encryptedHex  Hex-encoded encrypted payload
   * @param keyHex        64-char hex string (32 bytes) master key
   */
  private decryptApiKey(encryptedHex: string, keyHex: string): string {
    const key     = Buffer.from(keyHex, 'hex');
    const buf     = Buffer.from(encryptedHex, 'hex');
    const iv      = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const cipher  = buf.subarray(28);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(cipher), decipher.final()]);
    return decrypted.toString('utf8');
  }
}

// ── Utility ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}
