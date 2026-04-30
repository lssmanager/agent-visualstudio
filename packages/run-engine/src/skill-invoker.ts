/**
 * skill-invoker.ts
 *
 * Dispatches LLM tool_calls to the correct Skill row in the database.
 * Called by LlmStepExecutor during the agentic tool_calls loop.
 *
 * Skill types handled:
 *   'builtin'     — imported directly from @agent-vs/skills (not yet implemented, throws)
 *   'n8n_webhook' — HTTP POST/GET to the webhook URL configured in Skill.config
 *   'openapi'     — HTTP request to operationId endpoint in the OpenAPI spec
 *   'mcp'         — spawns the MCP server process via McpProcessPool + stdio JSON-RPC
 *   'function'    — eval-safe handler (disabled in production; use n8n_webhook instead)
 *
 * All invocations are time-bounded by SKILL_TIMEOUT_MS (default: 30 000).
 *
 * F1b-01 improvements:
 *   ✅ AbortController per-fetch guarantees socket closure on timeout
 *   ✅ Auth: none | headerAuth | basicAuth
 *   ✅ GET / DELETE serialize args as query-string (not body)
 *   ✅ Retry up to 2× on 5xx (except 501) with exponential backoff
 *   ✅ n8n envelope parse: [{ json: {...} }] → {...}
 *   ✅ invokeWebhookDirect() for inline tool nodes (no DB lookup)
 *
 * F1b-02 improvements:
 *   ✅ McpProcessPool — one process per (command, args, env), reused across calls
 *   ✅ Full MCP handshake: initialize → notifications/initialized → tools/call
 *   ✅ Static imports: child_process + readline (no dynamic import per call)
 *   ✅ MCP response envelope parse: { content:[{type:'text',text}] } → JSON | string
 *   ✅ toolName override via config.toolName (falls back to skillName)
 *
 * Security notes:
 *   - authValue / authPassword are NEVER logged.
 *   - invokeN8nWebhook() stays private; external callers use invokeWebhookDirect().
 */

import type { PrismaClient }  from '@prisma/client';
import { spawn, type ChildProcess } from 'child_process';
import { createInterface }          from 'readline';

const SKILL_TIMEOUT_MS = Number(process.env.SKILL_TIMEOUT_MS ?? 30_000);

export interface SkillInvokeResult {
  ok: boolean;
  result: unknown;
  error?: string;
  /** Wall-clock milliseconds the invocation took */
  durationMs: number;
}

// ─── McpProcessPool ──────────────────────────────────────────────────────────────

interface McpProcessEntry {
  proc:        ChildProcess;
  rl:          ReturnType<typeof createInterface>;
  initialized: boolean;
  pendingById: Map<number, {
    resolve: (v: unknown) => void;
    reject:  (e: Error)   => void;
  }>;
  nextId: number;
}

/**
 * Pool de procesos MCP — un proceso por (command, args, env).
 *
 * Los procesos se mantienen vivos entre invocaciones para evitar el costo
 * de arranque (~2-5 s para npx / Python / Go servers).
 * Se reemplazan automticamente cuando mueren (exitCode !== null).
 * Se destruyen al shutdown del worker Node.js (beforeExit / SIGTERM).
 *
 * Es un singleton de módulo: múltiples instancias de SkillInvoker comparten
 * los mismos procesos del pool.
 */
class McpProcessPool {
  private readonly pool = new Map<string, McpProcessEntry>();

  private poolKey(
    command: string,
    args:    string[],
    env:     Record<string, string>,
  ): string {
    return JSON.stringify({ command, args, env });
  }

  /**
   * Obtiene un proceso existente del pool o crea uno nuevo.
   * Si el proceso murió (exitCode !== null), lo reemplaza.
   */
  async getOrCreate(
    command: string,
    cmdArgs: string[],
    env:     Record<string, string>,
  ): Promise<McpProcessEntry> {
    const key      = this.poolKey(command, cmdArgs, env);
    const existing = this.pool.get(key);

    // Reusar si el proceso sigue vivo
    if (existing && existing.proc.exitCode === null) {
      return existing;
    }

    const proc = spawn(command, cmdArgs, {
      env:   { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const pendingById = new Map<number, {
      resolve: (v: unknown) => void;
      reject:  (e: Error)   => void;
    }>();

    // readline parsea stdout línea a línea — cada línea es un JSON-RPC message
    const rl = createInterface({ input: proc.stdout! });

    rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(trimmed) as Record<string, unknown>; }
      catch { return; }

      const id = msg['id'] as number | undefined;
      if (id === undefined) return; // notification — ignorar

      const pending = pendingById.get(id);
      if (!pending) return;
      pendingById.delete(id);

      if (msg['error']) {
        pending.reject(new Error(
          typeof msg['error'] === 'object'
            ? JSON.stringify(msg['error'])
            : String(msg['error']),
        ));
      } else {
        pending.resolve(msg['result']);
      }
    });

    proc.on('exit', () => {
      this.pool.delete(key);
      // Rechazar todos los pendientes en vuelo
      for (const p of pendingById.values()) {
        p.reject(new Error('MCP process exited unexpectedly'));
      }
      pendingById.clear();
    });

    const entry: McpProcessEntry = {
      proc, rl, initialized: false, pendingById, nextId: 1,
    };
    this.pool.set(key, entry);
    return entry;
  }

  /**
   * Envía un JSON-RPC request y devuelve una Promise que resuelve
   * con result o rechaza con el error del servidor.
   */
  sendRequest(
    entry:   McpProcessEntry,
    method:  string,
    params?: unknown,
  ): Promise<unknown> {
    const id = entry.nextId++;
    return new Promise((resolve, reject) => {
      entry.pendingById.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      entry.proc.stdin!.write(msg);
    });
  }

  /**
   * Envía una JSON-RPC notification (sin id, sin respuesta esperada).
   * Usado para notifications/initialized.
   */
  sendNotification(entry: McpProcessEntry, method: string): void {
    const msg = JSON.stringify({ jsonrpc: '2.0', method }) + '\n';
    entry.proc.stdin!.write(msg);
  }

  /** Mata todos los procesos del pool — llamar en shutdown */
  destroyAll(): void {
    for (const entry of this.pool.values()) {
      entry.proc.kill();
    }
    this.pool.clear();
  }
}

/** Singleton de módulo — compartido por todas las instancias de SkillInvoker */
const mcpPool = new McpProcessPool();

// Limpiar al apagar el proceso Node.js
process.once('beforeExit', () => mcpPool.destroyAll());
process.once('SIGTERM',     () => mcpPool.destroyAll());

// ─── SkillInvoker ──────────────────────────────────────────────────────────────────

export class SkillInvoker {
  constructor(private readonly db: PrismaClient) {}

  // ─── Public API ────────────────────────────────────────────────────

  /**
   * Invoke a skill by name (as registered in the Skill table).
   * Signature must NOT change — called from the agentic tool_calls loop.
   *
   * @param skillName  The skill/tool name from a tool_call (matches Skill.name)
   * @param args       Parsed JSON arguments from the tool_call
   */
  async invoke(
    skillName: string,
    args: Record<string, unknown>,
  ): Promise<SkillInvokeResult> {
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
        this.dispatch(skill.type, skill.config as Record<string, unknown>, args, skillName),
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

  /**
   * Invokes an n8n webhook with ad-hoc config — no DB lookup required.
   * Used by LlmStepExecutor.executeInlineWebhook() for "tool inline" nodes
   * where webhookUrl is specified directly in node.config.
   *
   * @param config  Webhook config (same shape as Skill.config for n8n_webhook)
   * @param args    Tool call arguments passed as body (POST) or query (GET)
   */
  async invokeWebhookDirect(
    config: Record<string, unknown>,
    args: Record<string, unknown>,
  ): Promise<SkillInvokeResult> {
    const t0 = Date.now();
    try {
      const result = await withTimeout(
        this.invokeN8nWebhook(config, args),
        SKILL_TIMEOUT_MS,
        `Inline webhook timed out after ${SKILL_TIMEOUT_MS}ms`,
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

  // ─── Dispatcher ──────────────────────────────────────────────────

  private async dispatch(
    type:      string,
    config:    Record<string, unknown>,
    args:      Record<string, unknown>,
    skillName: string,
  ): Promise<unknown> {
    switch (type) {
      case 'n8n_webhook': return this.invokeN8nWebhook(config, args);
      case 'openapi':     return this.invokeOpenApi(config, args);
      case 'mcp':         return this.invokeMcp(config, args, skillName);
      case 'builtin':     throw new Error('Builtin skill dispatch not yet implemented. Use n8n_webhook.');
      default:            throw new Error(`Unknown skill type: '${type}'`);
    }
  }

  // ─── n8n webhook (F1b-01 production-ready) ────────────────────────────

  private async invokeN8nWebhook(
    config: Record<string, unknown>,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const rawUrl = config.webhookUrl as string;
    if (!rawUrl) throw new Error('n8n_webhook skill missing webhookUrl in config');

    const method    = ((config.method as string) ?? 'POST').toUpperCase();
    const authType  = (config.authType as string | undefined) ?? 'none';
    const maxRetries = 2;

    // ── Build URL + body ──────────────────────────────────────────────────
    let url = rawUrl;
    let bodyPayload: string | undefined;

    if (method === 'GET' || method === 'DELETE') {
      const qs = Object.entries(args)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (qs) url = `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}${qs}`;
    } else {
      bodyPayload = JSON.stringify(args);
    }

    // ── Build auth headers ───────────────────────────────────────────────
    const authHeaders: Record<string, string> = {};
    if (authType === 'headerAuth') {
      const headerName  = (config.authHeader  as string) ?? 'Authorization';
      const headerValue =  config.authValue   as string;
      if (!headerValue) {
        throw new Error('n8n_webhook headerAuth requires authValue in config');
      }
      authHeaders[headerName] = headerValue;
    } else if (authType === 'basicAuth') {
      const user = config.authUser     as string;
      const pass = config.authPassword as string;
      if (!user || !pass) {
        throw new Error('n8n_webhook basicAuth requires authUser and authPassword in config');
      }
      // authPassword never logged — only sent in header
      authHeaders['Authorization'] =
        'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
    }
    // authType === 'none' → no additional headers

    // ── Retry loop with AbortController per attempt ─────────────────────
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // One controller per attempt — abort() closes the socket cleanly
      const controller  = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), SKILL_TIMEOUT_MS);

      try {
        const res = await fetch(url, {
          method,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: bodyPayload,
        });

        clearTimeout(fetchTimeout);

        // Retry on transient server errors (5xx ≠ 501)
        if (res.status >= 500 && res.status !== 501 && attempt < maxRetries) {
          lastError = new Error(
            `n8n webhook ${res.status} (attempt ${attempt + 1}/${maxRetries + 1})`,
          );
          await delay(attempt * 500); // 0 ms / 500 ms / 1 000 ms
          continue;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`n8n webhook returned ${res.status}: ${text.slice(0, 300)}`);
        }

        // ── Parse response ───────────────────────────────────────────────
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) return res.text();

        const json = (await res.json()) as unknown;

        // n8n can return an array of items: [{ json: {...} }, ...]
        // Unwrap to the first item's .json payload when present.
        if (
          Array.isArray(json) &&
          json.length > 0 &&
          typeof json[0] === 'object' &&
          json[0] !== null &&
          'json' in (json[0] as object)
        ) {
          return (json[0] as Record<string, unknown>)['json'];
        }

        return json;
      } catch (err) {
        clearTimeout(fetchTimeout);

        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new Error(
            `n8n webhook fetch aborted (timeout ${SKILL_TIMEOUT_MS}ms)`,
          );
          if (attempt < maxRetries) {
            await delay(attempt * 500);
            continue;
          }
          throw lastError;
        }

        if (attempt >= maxRetries) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
        await delay(attempt * 500);
      }
    }

    throw lastError ?? new Error('n8n_webhook: all retry attempts failed');
  }

  // ─── OpenAPI ──────────────────────────────────────────────────────────────────
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
    const spec = (await specRes.json()) as Record<string, unknown>;

    const { method, path: opPath, operation } = findOperation(spec, operationId);
    const serverBase = baseUrl ?? extractFirstServer(spec);
    if (!serverBase) throw new Error(`Cannot determine base URL for OpenAPI spec at ${specUrl}`);

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

  // ─── MCP (stdio) ───────────────────────────────────────────────────────────
  // F1b-02: full MCP handshake via McpProcessPool.
  // Proceso reutilizado entre llamadas — el handshake solo se ejecuta una vez.

  private async invokeMcp(
    config:   Record<string, unknown>,
    args:     Record<string, unknown>,
    toolName: string,
  ): Promise<unknown> {
    const command = config['command'] as string;
    const cmdArgs = (config['args'] as string[])               ?? [];
    const env     = (config['env']  as Record<string, string>) ?? {};

    if (!command) throw new Error('mcp skill requires command in config');

    // config.toolName tiene prioridad si está definido
    // (útil cuando el skill.name del LLM difiere del nombre real del MCP tool)
    const mcpToolName = (config['toolName'] as string) ?? toolName;

    const entry = await mcpPool.getOrCreate(command, cmdArgs, env);

    // ── Handshake MCP (solo en la primera invocación para este proceso) ───
    if (!entry.initialized) {
      await withTimeout(
        mcpPool.sendRequest(entry, 'initialize', {
          protocolVersion: '2024-11-05',
          capabilities:    {},
          clientInfo:      { name: 'agent-visualstudio', version: '1.0.0' },
        }),
        10_000,
        'MCP initialize timed out (10s)',
      );

      // notifications/initialized — sin id, sin respuesta esperada
      mcpPool.sendNotification(entry, 'notifications/initialized');
      entry.initialized = true;
    }

    // ── Llamada al tool ───────────────────────────────────────────────────
    const result = await withTimeout(
      mcpPool.sendRequest(entry, 'tools/call', {
        name:      mcpToolName,
        arguments: args,
      }),
      SKILL_TIMEOUT_MS,
      `MCP tools/call '${mcpToolName}' timed out after ${SKILL_TIMEOUT_MS}ms`,
    );

    // ── Parse del resultado MCP ──────────────────────────────────────────
    // El resultado MCP tiene la forma: { content: [{ type, text }] }
    // Extraer texto si hay un solo item de tipo 'text';
    // de lo contrario devolver el resultado raw para que el LLM lo procese.
    const res = result as Record<string, unknown> | null;
    const content = res?.['content'] as Array<{ type: string; text?: string }> | undefined;
    if (content?.length === 1 && content[0].type === 'text') {
      // Muchos MCP servers devuelven texto serializado como JSON
      try {
        return JSON.parse(content[0].text!);
      } catch {
        return content[0].text;
      }
    }
    return result;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────────────

/** Safety-net timeout wrapper (AbortController is the primary protection for HTTP). */
function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
