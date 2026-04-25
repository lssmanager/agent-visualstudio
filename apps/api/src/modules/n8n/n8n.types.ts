/**
 * n8n integration types for the Studio backend.
 *
 * n8n is used as an optional workflow automation layer that can trigger
 * Studio flows, post events to agents, or receive callbacks from them.
 *
 * Reference: https://docs.n8n.io/api/
 */

// ── Inbound: n8n → Studio ─────────────────────────────────────────────────

/**
 * Payload sent by an n8n Webhook node to the Studio webhook endpoint.
 */
export interface N8nWebhookPayload {
  /** The n8n workflow ID that triggered this event. */
  workflowId: string;
  /** The n8n execution ID for traceability. */
  executionId: string;
  /** Studio entity this event is directed at. */
  target: {
    /** "flow" | "agent" | "workspace" */
    type: 'flow' | 'agent' | 'workspace';
    id: string;
  };
  /** Event data passed from n8n into the Studio flow trigger. */
  data: Record<string, unknown>;
  /** ISO-8601 timestamp when n8n dispatched the webhook. */
  triggeredAt: string;
}

/**
 * Response body returned by Studio to the n8n webhook caller.
 */
export interface N8nWebhookResponse {
  ok: boolean;
  /** Studio run ID that was started, if applicable. */
  runId?: string;
  /** Studio agent ID that was targeted, if applicable. */
  agentId?: string;
  message: string;
}

// ── Outbound: Studio → n8n ────────────────────────────────────────────────

/**
 * Options for calling an n8n workflow from Studio.
 */
export interface N8nWorkflowTriggerOptions {
  /** Base URL of the n8n instance (e.g. "https://n8n.example.com"). */
  baseUrl: string;
  /** n8n API key for authentication. */
  apiKey: string;
  /** n8n workflow ID to trigger. */
  workflowId: string;
  /** Payload to pass as the workflow input data. */
  data: Record<string, unknown>;
}

/**
 * Response from the n8n workflow execution trigger API.
 */
export interface N8nWorkflowTriggerResponse {
  ok: boolean;
  executionId?: string;
  status?: 'running' | 'success' | 'error' | 'unknown';
  message?: string;
}

// ── n8n workflow definition subset ───────────────────────────────────────

/**
 * Minimal n8n workflow descriptor used for listing/registration.
 * Mirrors the fields returned by GET /api/v1/workflows.
 */
export interface N8nWorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  tags?: Array<{ id: string; name: string }>;
}
