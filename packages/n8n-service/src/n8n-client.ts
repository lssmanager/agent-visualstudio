/**
 * n8n-client.ts
 *
 * HTTP client for the n8n REST API.
 * Only implements the endpoints required by N8nService.
 *
 * API reference: https://docs.n8n.io/api/api-reference/
 *
 * Design rules:
 *  - Authentication via X-N8N-API-KEY header only
 *    (the key is NEVER logged or included in error messages)
 *  - Every request uses AbortController for guaranteed socket closure
 *  - Error messages include HTTP status + first 300 chars of body
 */

export interface N8nClientConfig {
  /** Base URL of the n8n instance. Example: 'https://n8n.example.com' */
  baseUrl:    string;
  /** n8n API key. Sent in the X-N8N-API-KEY header. */
  apiKey:     string;
  /** Per-request HTTP timeout in ms. Default: 30_000 */
  timeoutMs?: number;
}

export interface N8nExecutionResult {
  id:          string;
  status:      'new' | 'running' | 'success' | 'error' | 'canceled' | 'waiting';
  data?:       Record<string, unknown>;
  error?:      string;
  startedAt?:  string;
  stoppedAt?:  string;
  workflowId:  string;
}

export interface N8nWorkflowExecuteResponse {
  /** ID of the created execution */
  executionId: string;
}

export class N8nClient {
  private readonly baseUrl:   string;
  private readonly apiKey:    string;
  private readonly timeoutMs: number;

  constructor(config: N8nClientConfig) {
    this.baseUrl   = config.baseUrl.replace(/\/$/, ''); // strip trailing slash
    this.apiKey    = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  /**
   * Triggers a workflow execution by its internal n8n ID.
   * POST /api/v1/workflows/:id/execute
   *
   * @param workflowId  Internal n8n workflow ID
   * @param inputData   Input data for the trigger node
   */
  async executeWorkflow(
    workflowId: string,
    inputData:  Record<string, unknown>,
  ): Promise<N8nWorkflowExecuteResponse> {
    const url = `${this.baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}/execute`;
    const res  = await this.request(url, {
      method: 'POST',
      body:   JSON.stringify({ workflowData: inputData }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `n8n executeWorkflow failed (${res.status}): ${text.slice(0, 300)}`,
      );
    }

    const json = await res.json() as { data?: { executionId?: string } };
    const executionId = json?.data?.executionId;
    if (!executionId) {
      throw new Error('n8n executeWorkflow: missing executionId in response');
    }
    return { executionId };
  }

  /**
   * Retrieves the status and result of an execution.
   * GET /api/v1/executions/:id
   */
  async getExecution(executionId: string): Promise<N8nExecutionResult> {
    const url = `${this.baseUrl}/api/v1/executions/${encodeURIComponent(executionId)}`;
    const res  = await this.request(url, { method: 'GET' });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `n8n getExecution failed (${res.status}): ${text.slice(0, 300)}`,
      );
    }

    const json = await res.json() as Record<string, unknown>;
    return this.parseExecutionResponse(json);
  }

  // ── Private helpers ───────────────────────────────────────────────────

  private parseExecutionResponse(raw: Record<string, unknown>): N8nExecutionResult {
    return {
      id:         String(raw['id'] ?? ''),
      status:     (raw['status'] as N8nExecutionResult['status']) ?? 'new',
      data:       raw['data'] as Record<string, unknown> | undefined,
      error:      raw['error'] as string | undefined,
      startedAt:  raw['startedAt'] as string | undefined,
      stoppedAt:  raw['stoppedAt'] as string | undefined,
      workflowId: String(raw['workflowId'] ?? ''),
    };
  }

  /**
   * fetch() wrapper with AbortController timeout.
   * Injects X-N8N-API-KEY on every call.
   * The API key is never included in error messages or logs.
   */
  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        signal:  controller.signal,
        headers: {
          'Content-Type':  'application/json',
          'X-N8N-API-KEY': this.apiKey,
          ...(init.headers as Record<string, string> | undefined ?? {}),
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `n8n API request timed out after ${this.timeoutMs}ms`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
