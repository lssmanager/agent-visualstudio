/**
 * n8n.service.ts
 * REST client towards a self-hosted n8n instance.
 * Inspired by n8n's own /packages/cli/src/WorkflowRunner.ts and
 * Flowise NodeExecutionService pattern.
 *
 * Env vars required:
 *   N8N_BASE_URL   – e.g. http://n8n:5678
 *   N8N_API_KEY    – n8n API key (Settings → API)
 */

import type { FlowSpec } from '../../../../../packages/core-types/src';
import { N8nBridgeService } from '../flows/n8n-bridge.service';

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes: unknown[];
  connections: unknown;
  settings?: Record<string, unknown>;
}

export interface N8nExecution {
  id: string;
  workflowId: string;
  finished: boolean;
  mode: string;
  startedAt: string;
  stoppedAt?: string;
  status: 'running' | 'success' | 'error' | 'waiting' | 'canceled';
  data?: Record<string, unknown>;
}

class N8nClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = (process.env.N8N_BASE_URL ?? 'http://localhost:5678').replace(/\/$/, '');
    this.apiKey  = process.env.N8N_API_KEY ?? '';
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`n8n ${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Workflows ───────────────────────────────────────────────────────────────
  async listWorkflows(): Promise<N8nWorkflow[]> {
    const resp = await this.request<{ data: N8nWorkflow[] }>('GET', '/workflows');
    return resp.data;
  }

  async getWorkflow(workflowId: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>('GET', `/workflows/${workflowId}`);
  }

  async createWorkflow(workflow: Partial<N8nWorkflow>): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>('POST', '/workflows', workflow);
  }

  async updateWorkflow(workflowId: string, workflow: Partial<N8nWorkflow>): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>('PATCH', `/workflows/${workflowId}`, workflow);
  }

  async activateWorkflow(workflowId: string): Promise<void> {
    await this.request('POST', `/workflows/${workflowId}/activate`);
  }

  async deactivateWorkflow(workflowId: string): Promise<void> {
    await this.request('POST', `/workflows/${workflowId}/deactivate`);
  }

  // ── Executions ──────────────────────────────────────────────────────────────
  async triggerWebhook(
    webhookPath: string,
    payload: Record<string, unknown>,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}/webhook${webhookPath.startsWith('/') ? webhookPath : `/${webhookPath}`}`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method !== 'GET' ? JSON.stringify(payload) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`n8n webhook ${webhookPath} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  async getExecution(executionId: string): Promise<N8nExecution> {
    return this.request<N8nExecution>('GET', `/executions/${executionId}`);
  }

  async listExecutions(workflowId?: string): Promise<N8nExecution[]> {
    const qs = workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';
    const resp = await this.request<{ data: N8nExecution[] }>('GET', `/executions${qs}`);
    return resp.data;
  }
}

export class N8nService {
  private readonly client = new N8nClient();
  private readonly bridge = new N8nBridgeService();

  // ── Workflow management ─────────────────────────────────────────────────────
  listWorkflows()         { return this.client.listWorkflows(); }
  getWorkflow(id: string) { return this.client.getWorkflow(id); }

  /** Create an n8n workflow from a FlowSpec.  Returns the created workflow. */
  async createWorkflowFromFlow(flow: FlowSpec): Promise<N8nWorkflow> {
    const n8nWorkflow = this.bridge.flowSpecToN8nWorkflow(flow);
    return this.client.createWorkflow(n8nWorkflow);
  }

  /** Update an existing n8n workflow from a FlowSpec. */
  async updateWorkflowFromFlow(flow: FlowSpec, workflowId: string): Promise<N8nWorkflow> {
    const n8nWorkflow = this.bridge.flowSpecToN8nWorkflow(flow);
    return this.client.updateWorkflow(workflowId, n8nWorkflow);
  }

  activateWorkflow(id: string)   { return this.client.activateWorkflow(id); }
  deactivateWorkflow(id: string) { return this.client.deactivateWorkflow(id); }

  // ── Execution ───────────────────────────────────────────────────────────────
  triggerWebhook(
    webhookPath: string,
    payload: Record<string, unknown>,
    method?: 'GET' | 'POST',
  ) {
    return this.client.triggerWebhook(webhookPath, payload, method);
  }

  getExecution(id: string)            { return this.client.getExecution(id); }
  listExecutions(workflowId?: string) { return this.client.listExecutions(workflowId); }

  // ── Bridge utilities ────────────────────────────────────────────────────────
  /** Returns the cross-reference map: canvas nodeId → n8n nodeId */
  getNodeIdMap(flow: FlowSpec): Map<string, string> {
    return this.bridge.buildNodeIdMap(flow);
  }

  /**
   * Crea un workflow directamente desde un spec raw (sin FlowSpec).
   * Usado por N8nStudioHelper para workflows generados por LLM.
   * Refs: F4b-01 (#76)
   */
  createWorkflowRaw(workflow: Partial<N8nWorkflow>): Promise<N8nWorkflow> {
    return this.client.createWorkflow(workflow);
  }
}
