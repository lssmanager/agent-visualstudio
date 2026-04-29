/**
 * n8n.service.ts
 *
 * Orchestrates the execution of complete n8n workflows via the REST API.
 *
 * Architectural distinction from skill-invoker.invokeN8nWebhook():
 *
 *   invokeN8nWebhook()          N8nService.triggerWorkflow()
 *   ──────────────────────   ───────────────────────────
 *   Skill webhook URL           Internal n8n workflow ID
 *   HTTP POST → immediate resp  REST API → executionId → polling
 *   No API key required         X-N8N-API-KEY required
 *   LLM tool-call path          Canvas orchestrator path
 *
 * Execution flow:
 *  1. POST /api/v1/workflows/:id/execute  → obtain executionId
 *     (with retry on network errors, NOT on 4xx)
 *  2. Poll GET /api/v1/executions/:id     → until terminal status
 *     (network errors in polling are ignored; loop continues to timeout)
 *  3. Return structured TriggerWorkflowResult
 *
 * If fireAndForget=true: only step 1, returns status:'pending' immediately.
 */

import { N8nClient, type N8nClientConfig, type N8nExecutionResult } from './n8n-client';

// ── Private constants ─────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 2_000;    // 2 s between polls
const DEFAULT_MAX_WAIT_MS      = 120_000;  // 2 min maximum wait
const DEFAULT_MAX_RETRIES      = 2;        // network-error retries on trigger

/** Execution statuses that mean the workflow has finished (success or failure). */
const TERMINAL_STATUSES = new Set<N8nExecutionResult['status']>([
  'success', 'error', 'canceled',
]);

// ── Public types ───────────────────────────────────────────────────────────

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
  /**
   * Override the service-level maxWaitMs for this single invocation.
   */
  maxWaitMs?:      number;
  /**
   * Override the service-level pollIntervalMs for this single invocation.
   */
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
}

// ── N8nService ────────────────────────────────────────────────────────────────

export class N8nService {
  private readonly client:          N8nClient;
  private readonly pollIntervalMs:  number;
  private readonly maxWaitMs:       number;
  private readonly maxRetries:      number;

  constructor(config: N8nServiceConfig) {
    this.client          = new N8nClient(config);
    this.pollIntervalMs  = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxWaitMs       = config.maxWaitMs      ?? DEFAULT_MAX_WAIT_MS;
    this.maxRetries      = config.maxRetries      ?? DEFAULT_MAX_RETRIES;
  }

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

    // ── Step 1: trigger with retry on network errors ──────────────────────
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

    // ── Step 2: fire and forget ──────────────────────────────────────────
    if (options.fireAndForget) {
      return {
        executionId,
        status:    'pending',
        durationMs: Date.now() - t0,
      };
    }

    // ── Step 3: poll until terminal status or timeout ─────────────────────
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

      if (TERMINAL_STATUSES.has(lastExecution.status)) {
        break;
      }
    }

    // ── Step 4: check if we timed out ───────────────────────────────────
    if (!lastExecution || !TERMINAL_STATUSES.has(lastExecution.status)) {
      return {
        executionId,
        status:    lastExecution?.status ?? 'running',
        timedOut:  true,
        error:     `Workflow execution did not complete within ${maxWaitMs}ms`,
        durationMs: Date.now() - t0,
      };
    }

    // ── Step 5: build final result ─────────────────────────────────────
    return {
      executionId,
      status:     lastExecution.status,
      outputData: lastExecution.data,
      error:      lastExecution.status === 'error' ? lastExecution.error : undefined,
      durationMs: Date.now() - t0,
    };
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}
