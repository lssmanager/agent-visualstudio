import fs from 'node:fs';
import path from 'node:path';

import { studioConfig } from '../../config';

export interface McpServer {
  id: string;
  name: string;
  url: string;
  protocol: 'stdio' | 'sse' | 'http';
  description?: string;
  enabled: boolean;
  createdAt: string;
}

const MCP_FILE = () => path.join(studioConfig.workspaceRoot, '.openclaw-studio', 'mcp-servers.json');

export class McpService {
  private read(): McpServer[] {
    const file = MCP_FILE();
    if (!fs.existsSync(file)) return [];
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8')) as McpServer[];
    } catch {
      return [];
    }
  }

  private write(servers: McpServer[]): void {
    const file = MCP_FILE();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(servers, null, 2), 'utf-8');
  }

  findAll(): McpServer[] {
    return this.read();
  }

  create(input: Omit<McpServer, 'id' | 'createdAt'> & { id?: string }): McpServer {
    const server: McpServer = {
      id: input.id ?? `mcp-${Date.now()}`,
      name: input.name,
      url: input.url,
      protocol: input.protocol ?? 'http',
      description: input.description,
      enabled: input.enabled ?? true,
      createdAt: new Date().toISOString(),
    };
    const servers = this.read();
    servers.push(server);
    this.write(servers);
    return server;
  }

  remove(id: string): boolean {
    const servers = this.read();
    const next = servers.filter((s) => s.id !== id);
    if (next.length === servers.length) return false;
    this.write(next);
    return true;
  }
}
