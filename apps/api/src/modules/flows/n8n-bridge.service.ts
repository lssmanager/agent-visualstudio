/**
 * n8n-bridge.service.ts
 * Traduce nodos FlowNode N8nWebhook / N8nWorkflow a ejecuciones reales
 * en n8n y mapea resultados de vuelta al contexto del Run.
 *
 * Patrones tomados de:
 *   - n8n  → WorkflowRunner + IExecuteData
 *   - Flowise → ICommonObject node execution
 *   - LangGraph → conditional edges + ToolNode
 */

import { N8nService } from '../n8n/n8n.service';
import type { FlowNode, N8nWebhookConfig, N8nWorkflowConfig } from './flow-node.types';

export interface N8nBridgeResult {
  nodeId: string;
  status: 'success' | 'error' | 'timeout';
  executionId?: string;
  data?: unknown;
  error?: string;
  durationMs: number;
}

export class N8nBridgeService {
  private readonly n8n = new N8nService();

  /**
   * Ejecuta un nodo N8nWebhook: llama al webhookUrl configurado.
   * Patrón: n8n WebhookNode execute() + waitForWebhook pattern.
   */
  async executeWebhookNode(
    node: FlowNode,
    runContext: Record<string, unknown>,
  ): Promise<N8nBridgeResult> {
    const start = Date.now();
    const cfg = node.config as N8nWebhookConfig;
    const body = this.interpolate(cfg.bodyTemplate ?? {}, runContext);

    try {
      let data: unknown;
      if (cfg.waitForResponse) {
        data = await this.n8n.triggerWebhook({
          webhookUrl: cfg.webhookUrl,
          method: cfg.method ?? 'POST',
          body,
          timeoutMs: cfg.responseTimeoutMs ?? 30_000,
        });
      } else {
        void this.n8n.triggerWebhook({
          webhookUrl: cfg.webhookUrl,
          method: cfg.method ?? 'POST',
          body,
        });
      }
      return { nodeId: node.id, status: 'success', data, durationMs: Date.now() - start };
    } catch (err: unknown) {
      const error = String(err);
      return {
        nodeId: node.id,
        status: error.includes('abort') ? 'timeout' : 'error',
        error,
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Ejecuta un nodo N8nWorkflow via API y hace poll hasta completar.
   * Patrón: n8n WorkflowRunner.runWorkflow + polling en executions API.
   */
  async executeWorkflowNode(
    node: FlowNode,
    runContext: Record<string, unknown>,
  ): Promise<N8nBridgeResult> {
    const start = Date.now();
    const cfg = node.config as N8nWorkflowConfig;
    const body = this.interpolate(cfg.bodyTemplate ?? {}, runContext);

    try {
      const execution = await this.n8n.executeWorkflow(cfg.n8nWorkflowId, body);
      let data: unknown = execution.data;

      if (cfg.waitForResponse) {
        data = await this.pollExecution(execution.id, cfg.responseTimeoutMs ?? 60_000);
      }

      return { nodeId: node.id, status: 'success', executionId: execution.id, data, durationMs: Date.now() - start };
    } catch (err: unknown) {
      return { nodeId: node.id, status: 'error', error: String(err), durationMs: Date.now() - start };
    }
  }

  /**
   * Genera un workflow básico en n8n a partir de nodos del canvas.
   * Patrón: n8n WorkflowHelpers.buildWorkflow().
   */
  async scaffoldWorkflow(
    name: string,
    n8nNodes: unknown[],
    connections: unknown,
  ): Promise<string> {
    const wf = await this.n8n.createWorkflow(name, n8nNodes, connections);
    return wf.id;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Interpolación simple: reemplaza {{key}} con valor del contexto.
   * Patrón: n8n ExpressionResolve.resolveSimpleParameterValue().
   */
  private interpolate(
    template: Record<string, unknown>,
    ctx: Record<string, unknown>,
  ): Record<string, unknown> {
    const json = JSON.stringify(template);
    const replaced = json.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
      ctx[key] !== undefined ? JSON.stringify(ctx[key]).replace(/^"|"$/g, '') : '',
    );
    try { return JSON.parse(replaced); } catch { return template; }
  }

  /**
   * Poll execution hasta terminal o timeout.
   * Patrón: n8n ActiveExecutions + waitForExecution().
   */
  private async pollExecution(executionId: string, timeoutMs: number): Promise<unknown> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const exec = await this.n8n.getExecution(executionId);
      if (exec.status === 'success') return exec.data;
      if (exec.status === 'error') throw new Error(exec.error ?? 'n8n execution failed');
      await new Promise((r) => setTimeout(r, 1_500));
    }
    throw new Error(`n8n execution ${executionId} timed out after ${timeoutMs}ms`);
  }
}
