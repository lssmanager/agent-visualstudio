/**
 * McpServer — wraps @modelcontextprotocol/sdk Server.
 * Registers both core LSS tools and skill-bridge tools.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
} from '@modelcontextprotocol/sdk/types.js';
import { LssApiClient } from './client';
import { createToolDefinitions, type McpToolDefinition } from './tools';
import { skillsToMcpTools, type BridgedSkillSpec } from './skill-bridge';

export interface McpServerOptions {
  name?: string;
  version?: string;
  /** Extra skill specs to mount as MCP tools (from skill-registry) */
  skills?: BridgedSkillSpec[];
}

export class McpServer {
  private readonly server: Server;
  private readonly toolMap = new Map<string, McpToolDefinition>();

  constructor(
    private readonly client: LssApiClient,
    options: McpServerOptions = {},
  ) {
    this.server = new Server(
      {
        name: options.name ?? 'lss-mcp-server',
        version: options.version ?? '0.1.0',
      },
      { capabilities: { tools: {} } },
    );

    // Register core LSS tools
    for (const tool of createToolDefinitions(client)) {
      this.toolMap.set(tool.name, tool);
    }

    // Mount skill-bridge tools
    if (options.skills?.length) {
      for (const tool of skillsToMcpTools(options.skills)) {
        this.toolMap.set(tool.name, tool);
      }
    }

    this._setupHandlers();
  }

  private _setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [...this.toolMap.values()].map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.schema,
      })),
    }));

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        const tool = this.toolMap.get(request.params.name);
        if (!tool) {
          throw new Error(`Unknown tool: ${request.params.name}`);
        }
        return tool.execute(
          (request.params.arguments as Record<string, unknown>) ?? {},
        );
      },
    );
  }

  /** Add extra tools at runtime (e.g., from a freshly-updated skill registry) */
  addTools(tools: McpToolDefinition[]) {
    for (const tool of tools) {
      this.toolMap.set(tool.name, tool);
    }
  }

  get rawServer(): Server {
    return this.server;
  }

  async connect(transport: Parameters<Server['connect']>[0]) {
    return this.server.connect(transport);
  }
}
