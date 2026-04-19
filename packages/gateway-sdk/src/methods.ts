import crypto from 'node:crypto';

import { GatewayRequest } from './protocol';

export function buildRequest(method: string, params?: Record<string, unknown>): GatewayRequest {
  return {
    id: crypto.randomUUID(),
    method,
    params,
  };
}

export const gatewayMethods = {
  health: 'health',
  status: 'status',
  diagnostics: 'diagnostics',
  agentsList: 'agents.list',
  agentsSpawn: 'agents.spawn',
  agentsSend: 'agents.send',
  agentsCancel: 'agents.cancel',
  sessionsList: 'sessions.list',
  usageCost: 'usage.cost',
} as const;
