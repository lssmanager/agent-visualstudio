/**
 * n8n-studio-helper.ts
 *
 * N8nStudioHelper — cerebro del AgentBuilder para n8n.
 *
 * Recibe una descripción en lenguaje natural, usa el LLM resuelto por
 * ModelPolicy (cascada agent→workspace→dept→agency, D-09) para generar
 * un spec JSON de nodos/conexiones válido para n8n, materializa el workflow
 * en n8n real via N8nService, y registra el resultado como un Skill de
 * tipo n8n_webhook en Prisma.
 *
 * Bloquea: F4b-02, F4b-03, F4b-04
 * Issue:   #76 (F4b-01)
 */

import { Injectable } from '@nestjs/common';

import { N8nService }         from '../n8n/n8n.service';
import { PrismaService }      from '../../lib/prisma.service';
import { resolveModelPolicy } from '../../../../../packages/run-engine/src/policy-resolver';
import { buildLLMClient }     from '../../../../../packages/run-engine/src/llm-client';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MODEL   = 'openai/gpt-4o';
const LLM_TEMPERATURE = 0.2;
const LLM_MAX_TOKENS  = 2048;

const N8N_SYSTEM_PROMPT = `
You are an expert n8n workflow architect.
Your task: given a description, generate a valid n8n workflow spec as JSON.

Rules:
- Output ONLY valid JSON. No markdown, no explanation, no backticks.
- The JSON must have exactly these top-level keys: "name", "nodes", "connections"
- Every node must have: id (string), name (string), type (string),
  typeVersion (number), position ([x, y]), parameters (object)
- Include at least one trigger node (webhook, schedule, or manual)
- Use n8n-nodes-base.* types only (no community nodes)
- connections maps sourceNodeName → { main: [[{ node, type, index }]] }
- webhookUrl path should be a short slug derived from the workflow name

n8n node types reference (use these exact type strings):
  n8n-nodes-base.webhook          → HTTP webhook trigger
  n8n-nodes-base.emailSend        → Send email (requires SMTP credentials)
  n8n-nodes-base.httpRequest      → HTTP request to external API
  n8n-nodes-base.set              → Set/transform data
  n8n-nodes-base.if               → Conditional branch
  n8n-nodes-base.code             → Execute JavaScript code
  n8n-nodes-base.respondToWebhook → Send response back to webhook caller
  n8n-nodes-base.noOp             → No operation (passthrough)
`.trim();

// ─── Types ────────────────────────────────────────────────────────────────────

/** Nodo n8n tal como lo entiende la REST API de n8n. */
export interface N8nWorkflowNodeDefinition {
  id:          string;
  name:        string;
  type:        string;
  typeVersion: number;
  position:    [number, number];
  parameters:  Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

/** Estructura de conexiones n8n: sourceNodeName → { main: [[{node, type, index}]] } */
export type N8nWorkflowConnection = Record<
  string,
  { main: Array<Array<{ node: string; type: string; index: number }>> }
>;

/** El spec que el LLM genera y que se envía a N8nService. */
export interface N8nWorkflowSpec {
  name:        string;
  nodes:       N8nWorkflowNodeDefinition[];
  connections: N8nWorkflowConnection;
}

/** Opciones para createWorkflowFromDescription(). */
export interface CreateWorkflowFromDescriptionOptions {
  /** Descripción en lenguaje natural del workflow deseado. */
  description: string;
  /**
   * connectionId de N8nConnection en Prisma.
   * Se usa como parte del nombre canónico del Skill: `n8n:{connectionId}:{workflowId}`
   */
  connectionId: string;
  /**
   * agentId para resolveModelPolicy (cascada agent→workspace→dept→agency).
   * Requerido para seleccionar el LLM correcto según política D-09.
   */
  agentId: string;
  /** workspaceId del agente — requerido por PolicyResolverContext y por Skill.create. */
  workspaceId: string;
  /** departmentId del agente — requerido por PolicyResolverContext. */
  departmentId: string;
  /** agencyId del agente — requerido por PolicyResolverContext. */
  agencyId: string;
  /**
   * Si true, activa el workflow en n8n inmediatamente tras crearlo.
   * Default: false
   */
  activate?: boolean;
}

/** Resultado de createWorkflowFromDescription(). */
export interface CreateWorkflowFromDescriptionResult {
  /** n8n workflow ID asignado por n8n. */
  n8nWorkflowId: string;
  /** Nombre generado por el LLM para el workflow. */
  name: string;
  /** Skill.id creado/actualizado en Prisma. */
  skillId: string;
  /** Webhook URL del nodo trigger (si el workflow tiene nodo webhook). */
  webhookUrl?: string;
  /** true si el workflow quedó activo en n8n. */
  active: boolean;
  /** Spec JSON completo enviado a n8n (para auditoría/debug). */
  generatedSpec: N8nWorkflowSpec;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class N8nStudioHelper {
  constructor(
    private readonly n8nService: N8nService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Traduce una descripción en lenguaje natural a un workflow n8n real.
   *
   * Pasos:
   *   1. Resolver ModelPolicy via cascada agent→workspace→dept→agency (D-09)
   *   2. Construir prompt de sistema + usuario para el LLM
   *   3. Llamar al LLM con el modelo resuelto (temperatura 0.2)
   *   4. Parsear y validar el JSON devuelto
   *   5. Crear el workflow en n8n via N8nService.createWorkflowRaw()
   *   6. Hacer findFirst+update/create del Skill en Prisma con type='n8n_webhook'
   *   7. Retornar CreateWorkflowFromDescriptionResult
   */
  async createWorkflowFromDescription(
    options: CreateWorkflowFromDescriptionOptions,
  ): Promise<CreateWorkflowFromDescriptionResult> {
    const {
      description,
      connectionId,
      agentId,
      workspaceId,
      departmentId,
      agencyId,
      activate = false,
    } = options;

    // ── Paso 1: Resolver ModelPolicy ──────────────────────────────────────────
    let primaryModel = DEFAULT_MODEL;
    try {
      const modelPolicy = await resolveModelPolicy(this.prisma, {
        agentId,
        workspaceId,
        departmentId,
        agencyId,
      });
      if (modelPolicy?.primaryModel) {
        primaryModel = modelPolicy.primaryModel;
      }
    } catch {
      // Si falla la resolución de política, usamos el default. No es fatal.
      primaryModel = DEFAULT_MODEL;
    }

    // ── Paso 2-3: Llamar al LLM ───────────────────────────────────────────────
    // buildLLMClient devuelve un ProviderAdapter cuyo chat() acepta
    // (messages[], tools[], opts) y devuelve { content, toolCalls }.
    const llmClient = buildLLMClient(primaryModel);

    let rawContent: string;
    try {
      const response = await llmClient.chat(
        [
          { role: 'system', content: N8N_SYSTEM_PROMPT },
          { role: 'user',   content: `Create an n8n workflow for: ${description}` },
        ],
        [],   // tools: vacío — solo generamos JSON, no usamos tool calls
        {
          model:       primaryModel,
          temperature: LLM_TEMPERATURE,
          maxTokens:   LLM_MAX_TOKENS,
        },
      );
      // ProviderAdapter devuelve { content: string, toolCalls: ToolCall[] }
      rawContent = response.content ?? '';
      if (!rawContent) {
        throw new Error('[N8nStudioHelper] LLM returned empty content');
      }
    } catch (err: unknown) {
      throw new Error(
        `[N8nStudioHelper] LLM call failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    // ── Paso 4: Parsear y validar JSON ────────────────────────────────────────
    let spec: N8nWorkflowSpec;
    try {
      spec = JSON.parse(rawContent) as N8nWorkflowSpec;
    } catch {
      throw new Error(
        `[N8nStudioHelper] LLM returned invalid JSON: ${rawContent.slice(0, 200)}`,
      );
    }

    if (!spec.name || typeof spec.name !== 'string' || spec.name.trim() === '') {
      throw new Error('[N8nStudioHelper] LLM spec missing required field: name');
    }
    if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) {
      throw new Error('[N8nStudioHelper] LLM spec missing required field: nodes (must be non-empty array)');
    }
    if (!spec.connections || typeof spec.connections !== 'object') {
      // Conexiones vacías son válidas para un workflow de 1 nodo.
      spec.connections = {};
    }

    // ── Paso 5: Crear el workflow en n8n via N8nService.createWorkflowRaw() ───
    let createdWorkflow: { id: string; name: string; active: boolean };
    try {
      createdWorkflow = await this.n8nService.createWorkflowRaw({
        name:        spec.name,
        nodes:       spec.nodes,
        connections: spec.connections,
        active:      activate,
        settings:    { executionOrder: 'v1' },
      });
    } catch (err: unknown) {
      throw new Error(
        `[N8nStudioHelper] N8nService.createWorkflowRaw() failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const n8nWorkflowId = createdWorkflow.id;

    // ── Paso 6: Extraer webhookUrl del nodo webhook (si existe) ───────────────
    const webhookNode = spec.nodes.find(
      (n) => n.type === 'n8n-nodes-base.webhook',
    );
    const webhookPath = webhookNode?.parameters?.['path'] as string | undefined;
    const baseUrl     = process.env.N8N_BASE_URL?.replace(/\/$/, '') ?? '';
    const webhookUrl  = webhookPath ? `${baseUrl}/webhook/${webhookPath}` : undefined;

    // ── Paso 7: findFirst + update/create del Skill en Prisma ─────────────────
    //
    // Skill.name NO tiene @unique en el schema — no se puede usar upsert con
    // where: { name }. Estrategia: findFirst por name+workspaceId, luego
    // update (si existe) o create (si no existe).
    // workspaceId es NOT NULL en el schema — requerido en create.
    const skillName = `n8n:${connectionId}:${n8nWorkflowId}`;
    const skillConfig = {
      n8nWorkflowId,
      connectionId,
      webhookUrl: webhookUrl ?? null,
      generatedFromDescription: description,
    };

    let skill: { id: string };
    try {
      const existing = await this.prisma.skill.findFirst({
        where:  { name: skillName, workspaceId },
        select: { id: true },
      });

      if (existing) {
        skill = await this.prisma.skill.update({
          where:  { id: existing.id },
          data:   { config: skillConfig },
          select: { id: true },
        });
      } else {
        skill = await this.prisma.skill.create({
          data: {
            name:        skillName,
            type:        'n8n_webhook',
            workspaceId,
            config:      skillConfig,
          },
          select: { id: true },
        });
      }
    } catch (err: unknown) {
      throw new Error(
        `[N8nStudioHelper] Prisma skill persist failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return {
      n8nWorkflowId,
      name:          createdWorkflow.name,
      skillId:       skill.id,
      webhookUrl,
      active:        createdWorkflow.active,
      generatedSpec: spec,
    };
  }
}
