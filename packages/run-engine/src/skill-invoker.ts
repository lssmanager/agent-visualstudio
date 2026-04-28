/**
 * skill-invoker.ts
 *
 * Dispatches LLM tool_calls to the correct Skill row in the database.
 * Called by LlmStepExecutor during the agentic tool_calls loop.
 *
 * Skill types handled:
 *   'builtin'     — imported directly from @agent-vs/skills (not yet implemented, throws)
 *   'n8n_webhook' — HTTP POST to the webhook URL configured in Skill.config
 *   'openapi'     — HTTP request to operationId endpoint in the OpenAPI spec
 *   'mcp'         — spawns the MCP server process and calls the tool via stdio
 *   'function'    — eval-safe handler (disabled in production; use n8n_webhook instead)
 *
 * All invocations are time-bounded by SKILL_TIMEOUT_MS (default: 30 000).
 */

import type { PrismaClient } from '@prisma/client';

const SKILL_TIMEOUT_MS = Number(process.env.SKILL_TIMEOUT_MS ?? 30_000);

export interface SkillInvokeResult {
  ok:    boolean;
  result: unknown;
  error?: string;
  /** Wall-clock milliseconds the invocation took */
  durationMs: number;
}

export class SkillInvoker {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Invoke a skill by name (as registered in the Skill table).
   * @param skillName  The skill/tool name returned in a tool_call (matches Skill.name)
   * @param args       Parsed JSON arguments from the tool_call
   */
  async invoke(skillName: string, args: Record<string, unknown>): Promise<SkillInvokeResult> {
    const t0 = Date.now();

    const skill = await this.db.skill.findUnique({ where: { name: skillName } });
    if (!skill) {
      return {
        ok: false,
        result: null,
        error: `Skill '${skillName}' not found in registry`,
        durationMs: Date.now() - t0,
      };
    }

    try {
      const result = await withTimeout(
        this.dispatch(skill.type, skill.config as Record<string, unknown>, args),
        SKILL_TIMEOUT_MS,
        `Skill '${skillName}' timed out after ${SKILL_TIMEOUT_MS}ms`,
      );
      return { ok: true, result, durationMs: Date.now() - t0 };
    } catch (err) {
      return {
        ok: false,
        result: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
      };
    }
  }

  // ─── Dispatchers ───────────────────────────────────────────────────────────

  private async dispatch(
    type: string,
    config: Record<string, unknown>,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (type) {
      case 'n8n_webhook': return this.invokeN8nWebhook(config, args);
      case 'openapi':     return this.invokeOpenApi(config, args);
      case 'mcp':         return this.invokeMcp(config, args);
      case 'builtin':     throw new Error(`Builtin skill dispatch not yet implemented. Use n8n_webhook.`);
      default:            throw new Error(`Unknown skill type: '${type}'`);
    }
  }

  // ─── n8n webhook ─────────────────────────────────────────────────────

  private async invokeN8nWebhook(
    config: Record<string, unknown>,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const url = config.webhookUrl as string;
    if (!url) throw new Error('n8n_webhook skill missing webhookUrl in config');

    const method = ((config.method as string) ?? 'POST').toUpperCase();
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method !== 'GET' ? JSON.stringify(args) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`n8n webhook returned ${res.status}: ${text.slice(0, 200)}`);
    }

    const ct = res.headers.get('content-type') ?? '';
    return ct.includes('application/json') ? res.json() : res.text();
  }

  // ─── OpenAPI ────────────────────────────────────────────────────────────
  // Minimal implementation: fetches the spec, finds the operation by ID,
  // builds the request, executes it. Full parameter serialization TBD.

  private async invokeOpenApi(
    config: Record<string, unknown>,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const specUrl     = config.specUrl     as string;
    const operationId = config.operationId as string;
    const baseUrl     = config.baseUrl     as string | undefined;
    const apiKey      = config.apiKey      as string | undefined;

    if (!specUrl || !operationId) {
      throw new Error('openapi skill requires specUrl and operationId in config');
    }

    const specRes = await fetch(specUrl);
    if (!specRes.ok) throw new Error(`Failed to fetch OpenAPI spec from ${specUrl}`);
    const spec = await specRes.json() as Record<string, unknown>;

    // Find the operation
    const { method, path: opPath, operation } = findOperation(spec, operationId);
    const serverBase = baseUrl ?? extractFirstServer(spec);

    if (!serverBase) throw new Error(`Cannot determine base URL for OpenAPI spec at ${specUrl}`);

    // Build URL: substitute path params, append query params
    let url = serverBase.replace(/\/$/, '') + opPath;
    const queryParams: string[] = [];
    const bodyParams: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
      if (url.includes(`{${key}}`)) {
        url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
      } else if (method === 'GET' || method === 'DELETE') {
        queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      } else {
        bodyParams[key] = value;
      }
    }

    if (queryParams.length) url += '?' + queryParams.join('&');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(url, {
      method,
      headers,
      body: method !== 'GET' && method !== 'DELETE' ? JSON.stringify(bodyParams) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAPI ${operationId} returned ${res.status}: ${text.slice(0, 200)}`);
    }

    void operation; // suppress unused warning
    const ct = res.headers.get('content-type') ?? '';
    return ct.includes('application/json') ? res.json() : res.text();
  }

  // ─── MCP (stdio) ────────────────────────────────────────────────────────
  // Spawns the MCP server, sends a single tools/call request via
  // JSON-RPC over stdio, and kills the process after receiving the response.

  private async invokeMcp(
    config: Record<string, unknown>,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    // Dynamic import of child_process so this module remains isomorphic
    // in test environments that mock this method.
    const { spawn } = await import('child_process');

    const command = config.command as string;
    const cmdArgs = (config.args as string[]) ?? [];
    const env     = (config.env as Record<string, string>) ?? {};

    if (!command) throw new Error('mcp skill requires command in config');

    return new Promise((resolve, reject) => {
      const proc = spawn(command, cmdArgs, {
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      // Send JSON-RPC tools/call request
      const request = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: config.toolName ?? 'default', arguments: args },
      });
      proc.stdin.write(request + '\n');
      proc.stdin.end();

      proc.on('close', (code) => {
        if (code !== 0 && !stdout) {
          return reject(new Error(`MCP process exited ${code}: ${stderr.slice(0, 200)}`));
        }
        try {
          // The MCP server may emit multiple JSON lines; take the first
          // line that is a valid JSON-RPC response.
          for (const line of stdout.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parsed = JSON.parse(trimmed) as Record<string, unknown>;
            if (parsed.id === 1) {
              if (parsed.error) return reject(new Error(JSON.stringify(parsed.error)));
              return resolve(parsed.result);
            }
          }
          reject(new Error(`MCP server returned no matching response. stdout: ${stdout.slice(0, 200)}`));
        } catch {
          reject(new Error(`Failed to parse MCP response: ${stdout.slice(0, 200)}`));
        }
      });

      proc.on('error', reject);
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(msg)), ms),
    ),
  ]);
}

function findOperation(
  spec: Record<string, unknown>,
  operationId: string,
): { method: string; path: string; operation: Record<string, unknown> } {
  const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const operation = op as Record<string, unknown>;
      if (operation.operationId === operationId) {
        return { method: method.toUpperCase(), path, operation };
      }
    }
  }
  throw new Error(`Operation '${operationId}' not found in OpenAPI spec`);
}

function extractFirstServer(spec: Record<string, unknown>): string | undefined {
  const servers = spec.servers as Array<{ url: string }> | undefined;
  return servers?.[0]?.url;
}
