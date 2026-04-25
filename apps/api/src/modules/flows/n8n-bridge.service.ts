/**
 * n8n-bridge.service.ts
 * Translates a FlowSpec canvas into an n8n workflow JSON structure.
 *
 * Mapping logic inspired by:
 *  - n8n WorkflowRepository serialization (packages/cli/src/databases/)
 *  - Flowise INodeData → ChatFlow serialization
 *  - LangGraph StateGraph → compiled graph adjacency list
 */

import type { FlowSpec } from '../../../../../packages/core-types/src';
import type { N8nWorkflow } from '../n8n/n8n.service';

const GRID = 200; // pixels between nodes in n8n canvas

/** Deterministic node ID for cross-referencing */
function n8nNodeId(canvasNodeId: string): string {
  return `openclaw_${canvasNodeId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
}

/** Map canvas node type → n8n node type string */
function mapNodeType(type: string): string {
  const MAP: Record<string, string> = {
    trigger:       'n8n-nodes-base.manualTrigger',
    agent:         'n8n-nodes-base.executeWorkflow',   // placeholder until custom node
    subagent:      'n8n-nodes-base.executeWorkflow',
    supervisor:    'n8n-nodes-base.executeWorkflow',
    skill:         'n8n-nodes-base.function',
    tool:          'n8n-nodes-base.httpRequest',
    condition:     'n8n-nodes-base.if',
    handoff:       'n8n-nodes-base.set',
    loop:          'n8n-nodes-base.splitInBatches',
    approval:      'n8n-nodes-base.wait',
    end:           'n8n-nodes-base.noOp',
    n8n_webhook:   'n8n-nodes-base.webhook',
    n8n_workflow:  'n8n-nodes-base.executeWorkflow',
  };
  return MAP[type] ?? 'n8n-nodes-base.noOp';
}

/** Build node parameters from canvas config */
function mapParameters(type: string, config: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case 'trigger':
      if (config.triggerType === 'schedule') {
        return { rule: { interval: [{ field: 'cronExpression', expression: config.schedule ?? '0 * * * *' }] } };
      }
      return {};

    case 'n8n_webhook':
      return {
        path:           config.webhookPath ?? '/hook',
        httpMethod:     config.method ?? 'POST',
        responseMode:   config.waitForResponse ? 'lastNode' : 'onReceived',
        options:        {},
      };

    case 'tool':
      return {
        url:            config.url ?? '',
        method:         'POST',
        sendBody:       true,
        bodyParameters: { parameters: [{ name: 'payload', value: '={{ $json }}' }] },
      };

    case 'condition':
      return {
        conditions: {
          string: [{ value1: '={{ $json.result }}', operation: 'isNotEmpty' }],
        },
      };

    case 'approval':
      return {
        resume: 'webhook',
        options: { webhookSuffix: `/approval/${config.approvalRole ?? 'operator'}` },
      };

    default:
      return {};
  }
}

export class N8nBridgeService {
  /**
   * Convert a FlowSpec canvas to an n8n workflow object ready to POST to n8n API.
   */
  flowSpecToN8nWorkflow(flow: FlowSpec): Partial<N8nWorkflow> {
    const nodes = flow.nodes.map((node, idx) => ({
      id:         n8nNodeId(node.id),
      name:       (node.config?.label as string) ?? `${node.type} ${idx + 1}`,
      type:       mapNodeType(node.type),
      typeVersion: 1,
      position:   [
        (node.position?.x ?? idx * GRID),
        (node.position?.y ?? 100),
      ],
      parameters: mapParameters(node.type, (node.config ?? {}) as Record<string, unknown>),
      credentials: {},
    }));

    // Build connections: each FlowEdge → n8n connections.main
    const connections: Record<string, { main: Array<Array<{ node: string; type: string; index: number }>> }> = {};

    for (const edge of flow.edges) {
      const sourceId = n8nNodeId(edge.from);
      const targetId = n8nNodeId(edge.to);

      if (!connections[sourceId]) {
        connections[sourceId] = { main: [[]] };
      }
      connections[sourceId].main[0].push({ node: targetId, type: 'main', index: 0 });
    }

    return {
      name:   flow.name ?? flow.id ?? 'openclaw-flow',
      active: false,
      nodes,
      connections,
      settings: {
        executionOrder: 'v1',
        saveManualExecutions: true,
        callerPolicy: 'workflowsFromSameOwner',
      },
    };
  }

  /**
   * Returns a map of canvasNodeId → n8nNodeId.
   * Used by the frontend to cross-reference run steps with n8n executions.
   */
  buildNodeIdMap(flow: FlowSpec): Map<string, string> {
    const map = new Map<string, string>();
    for (const node of flow.nodes) {
      map.set(node.id, n8nNodeId(node.id));
    }
    return map;
  }
}
