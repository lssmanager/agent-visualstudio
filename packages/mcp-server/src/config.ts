/**
 * MCP Server config — adapted from lssmanager/paperclip packages/mcp-server/src/config.ts
 * Env vars renamed from PAPERCLIP_* → LSS_MCP_* for agent-visualstudio namespace.
 */
export interface McpServerConfig {
  /** Base URL of the LSS API (e.g. https://api.example.com) */
  apiUrl: string;
  /** Bearer token for the LSS API */
  apiKey: string;
  /** Default workspace/tenant ID to scope requests */
  workspaceId: string | null;
  /** Agent ID injected by the runtime when running inside a flow step */
  agentId: string | null;
  /** Run ID injected by run-engine for idempotency and traceability */
  runId: string | null;
}

function nonEmpty(value: string | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function normalizeApiUrl(apiUrl: string): string {
  const trimmed = stripTrailingSlash(apiUrl.trim());
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export function readConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): McpServerConfig {
  const apiUrl = nonEmpty(env.LSS_MCP_API_URL ?? env.PAPERCLIP_API_URL);
  if (!apiUrl) {
    throw new Error(
      'Missing LSS_MCP_API_URL (or legacy PAPERCLIP_API_URL)',
    );
  }
  const apiKey = nonEmpty(env.LSS_MCP_API_KEY ?? env.PAPERCLIP_API_KEY);
  if (!apiKey) {
    throw new Error(
      'Missing LSS_MCP_API_KEY (or legacy PAPERCLIP_API_KEY)',
    );
  }

  return {
    apiUrl: normalizeApiUrl(apiUrl),
    apiKey,
    workspaceId: nonEmpty(
      env.LSS_MCP_WORKSPACE_ID ?? env.PAPERCLIP_COMPANY_ID,
    ),
    agentId: nonEmpty(env.LSS_MCP_AGENT_ID ?? env.PAPERCLIP_AGENT_ID),
    runId: nonEmpty(env.LSS_MCP_RUN_ID ?? env.PAPERCLIP_RUN_ID),
  };
}
