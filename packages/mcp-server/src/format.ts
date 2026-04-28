/**
 * Response formatters for MCP tool results.
 * Adapted from lssmanager/paperclip packages/mcp-server/src/format.ts.
 */

export type McpTextContent = { type: 'text'; text: string };
export type McpToolResult = { content: McpTextContent[] };

export function formatTextResponse(data: unknown): McpToolResult {
  return {
    content: [
      {
        type: 'text',
        text:
          typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function formatErrorResponse(error: unknown): McpToolResult {
  const message =
    error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
  };
}
