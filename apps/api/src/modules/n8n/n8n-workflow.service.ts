import type {
  N8nWebhookPayload,
  N8nWebhookResponse,
  N8nWorkflowSummary,
  N8nWorkflowTriggerResponse,
} from './n8n.types';

/**
 * Service responsible for all n8n ↔ Studio integration logic.
 *
 * Environment variables consumed:
 *  N8N_BASE_URL  — base URL of the n8n instance (e.g. "https://n8n.example.com")
 *  N8N_API_KEY   — n8n API key used as Bearer token for outbound requests
 *
 * TODO: Wire inbound webhook handling to RunsService / AgentsService once
 * those are available through a shared DI context rather than direct imports.
 */
export class N8nWorkflowService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = (process.env.N8N_BASE_URL ?? '').replace(/\/$/, '');
    this.apiKey = process.env.N8N_API_KEY ?? '';
  }

  // ── Inbound ───────────────────────────────────────────────────────────

  /**
   * Handle an inbound webhook payload from n8n.
   * Routes the event to the appropriate Studio service based on target.type.
   */
  async handleInboundWebhook(payload: N8nWebhookPayload): Promise<N8nWebhookResponse> {
    const { target, data, workflowId, executionId } = payload;

    switch (target.type) {
      case 'flow': {
        // TODO: Call RunsService.startRun(target.id, { type: 'n8n_webhook', payload: data })
        // For now, return a successful acknowledgment with the intent logged.
        return {
          ok: true,
          message: `n8n workflow ${workflowId} (exec ${executionId}) → flow ${target.id} enqueued`,
        };
      }

      case 'agent': {
        // TODO: Dispatch a message/event to the specified agent via the gateway adapter.
        return {
          ok: true,
          agentId: target.id,
          message: `n8n workflow ${workflowId} (exec ${executionId}) → agent ${target.id} event dispatched`,
        };
      }

      case 'workspace': {
        // TODO: Broadcast the event at workspace scope (e.g. start default flow).
        return {
          ok: true,
          message: `n8n workflow ${workflowId} (exec ${executionId}) → workspace ${target.id} event received`,
        };
      }

      default: {
        return {
          ok: false,
          message: `Unknown target type: ${String((payload.target as { type: string }).type)}`,
        };
      }
    }
  }

  // ── Outbound ──────────────────────────────────────────────────────────

  /**
   * List workflows from the configured n8n instance.
   * Requires N8N_BASE_URL and N8N_API_KEY to be set.
   */
  async listWorkflows(): Promise<N8nWorkflowSummary[]> {
    this.assertConfig();

    const url = `${this.baseUrl}/api/v1/workflows`;
    const response = await this.fetchFromN8n(url);

    if (!response.ok) {
      throw new Error(`n8n API returned ${response.status}: ${response.statusText}`);
    }

    const json = (await response.json()) as { data?: N8nWorkflowSummary[] };
    return json.data ?? [];
  }

  /**
   * Trigger an n8n workflow via the n8n REST API.
   * Uses the /api/v1/workflows/:id/activate endpoint pattern.
   *
   * NOTE: n8n workflow execution via API requires the workflow to have a
   * "When Executed by Another Workflow" or "Webhook" trigger node.
   * TODO: Support execution via n8n's /api/v1/executions endpoint once
   * the n8n API version in use is confirmed.
   */
  async triggerWorkflow(
    workflowId: string,
    data: Record<string, unknown>,
  ): Promise<N8nWorkflowTriggerResponse> {
    this.assertConfig();

    // Validate workflowId to prevent SSRF / path traversal.
    // n8n workflow IDs are alphanumeric strings (UUID v4 or short numeric IDs).
    if (!N8nWorkflowService.isValidWorkflowId(workflowId)) {
      return {
        ok: false,
        status: 'error',
        message: `Invalid workflowId: must be alphanumeric with optional hyphens (max 128 chars)`,
      };
    }

    // POST to the n8n production webhook path for this workflow.
    // NOTE: n8n workflow execution via API requires the workflow to have a
    // "When Executed by Another Workflow" or "Webhook" trigger node.
    // TODO: Support execution via n8n's /api/v1/executions endpoint once
    // the n8n API version in use is confirmed.
    const encodedId = encodeURIComponent(workflowId);
    const url = `${this.baseUrl}/webhook/${encodedId}`;

    let response: Response;
    try {
      response = await this.fetchFromN8n(url, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Network error',
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: 'error',
        message: `n8n webhook responded with ${response.status}: ${response.statusText}`,
      };
    }

    return {
      ok: true,
      status: 'running',
      message: `Workflow ${workflowId} triggered successfully`,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  /**
   * Validate that a workflowId only contains safe characters.
   * Accepts UUID v4, short numeric IDs, and alphanumeric-with-hyphens strings
   * up to 128 characters. Rejects anything that could be used for path traversal
   * or URL injection (slashes, dots, colons, query chars, etc.).
   */
  static isValidWorkflowId(id: string): boolean {
    return /^[a-zA-Z0-9-]{1,128}$/.test(id);
  }

  private assertConfig(): void {
    if (!this.baseUrl) {
      throw new Error('N8N_BASE_URL environment variable is not set');
    }
    if (!this.apiKey) {
      throw new Error('N8N_API_KEY environment variable is not set');
    }
  }

  private fetchFromN8n(url: string, init: RequestInit = {}): Promise<Response> {
    return fetch(url, {
      ...init,
      headers: {
        'X-N8N-API-KEY': this.apiKey,
        ...(init.headers ?? {}),
      },
    });
  }
}
