/**
 * n8n.service.ts
 * Bridge hacia la API REST de n8n para crear/disparar workflows.
 *
 * Patrones tomados de:
 *   - n8n WorkflowRunner.runWorkflow()
 *   - n8n IWorkflowExecuteAdditionalData
 *   - Flowise ICommonObject.nodeData
 */

import fetch, { RequestInit } from 'node-fetch';

export interface N8nWorkflowMeta {
  id: string;
  name: string;
  active: boolean;
  nodes: unknown[];
  connections: unknown;
  createdAt?: string;
  updatedAt?: string;
}

export interface N8nExecutionResult {
  id: string;
  workflowId: string;
  status: 'new' | 'running' | 'success' | 'error' | 'waiting';
  startedAt?: string;
  stoppedAt?: string;
  data?: unknown;
  error?: string;
}

export interface N8nWebhookTriggerOptions {
  webhookUrl: string;
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export class N8nService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = (process.env.N8N_BASE_URL ?? 'http://localhost:5678').replace(/\/$/, '');
    this.apiKey = process.env.N8N_API_KEY ?? '';
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { 'X-N8N-API-KEY': this.apiKey } : {}),
      ...extra,
    };
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const res = await fetch(url, {
      ...options,
      headers: this.headers(options?.headers as Record<string, string>),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`n8n API ${res.status} – ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async listWorkflows(): Promise<N8nWorkflowMeta[]> {
    const resp = await this.request<{ data: N8nWorkflowMeta[] }>('/workflows');
    return resp.data ?? [];
  }

  async getWorkflow(id: string): Promise<N8nWorkflowMeta> {
    return this.request<N8nWorkflowMeta>(`/workflows/${id}`);
  }

  async createWorkflow(
    name: string,
    nodes: unknown[],
    connections: unknown,
  ): Promise<N8nWorkflowMeta> {
    return this.request<N8nWorkflowMeta>('/workflows', {
      method: 'POST',
      body: JSON.stringify({ name, nodes, connections, active: false }),
    });
  }

  async activateWorkflow(id: string): Promise<void> {
    await this.request(`/workflows/${id}/activate`, { method: 'POST' });
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.request(`/workflows/${id}`, { method: 'DELETE' });
  }

  /**
   * Dispara un workflow via la API de ejecución de n8n.
   * Patrón: n8n WorkflowRunner.runWorkflow({ startNodes: [...] })
   */
  async executeWorkflow(
    workflowId: string,
    inputData?: Record<string, unknown>,
  ): Promise<N8nExecutionResult> {
    return this.request<N8nExecutionResult>(`/workflows/${workflowId}/run`, {
      method: 'POST',
      body: JSON.stringify({ startNodes: [], runData: inputData ?? {} }),
    });
  }

  async getExecution(executionId: string): Promise<N8nExecutionResult> {
    return this.request<N8nExecutionResult>(`/executions/${executionId}`);
  }

  async listExecutions(workflowId?: string): Promise<N8nExecutionResult[]> {
    const qs = workflowId ? `?workflowId=${workflowId}` : '';
    const resp = await this.request<{ data: N8nExecutionResult[] }>(`/executions${qs}`);
    return resp.data ?? [];
  }

  /**
   * Llama al webhook URL de un nodo Webhook de n8n.
   * Patrón: n8n IWebhookResponseCallbackData + node-fetch
   */
  async triggerWebhook(options: N8nWebhookTriggerOptions): Promise<unknown> {
    const { webhookUrl, method = 'POST', body = {}, headers = {}, timeoutMs = 30_000 } = options;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(webhookUrl, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method !== 'GET' ? JSON.stringify(body) : undefined,
        signal: controller.signal as NodeJS.AbortSignal,
      });
      const text = await res.text();
      try { return JSON.parse(text); } catch { return text; }
    } finally {
      clearTimeout(timeout);
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.request('/workflows?limit=1');
      return true;
    } catch {
      return false;
    }
  }
}
