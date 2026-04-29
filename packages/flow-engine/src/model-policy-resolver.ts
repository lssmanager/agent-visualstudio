/**
 * ModelPolicyResolver
 *
 * Resuelve qué modelo, provider, temperature y maxTokens usar
 * para un LLM step dado, siguiendo la jerarquía de prioridad:
 *
 *   flow_node  (más específico)  ← node.config.model / node.config.provider
 *       ↓
 *   agent      ModelPolicy scope=agent  (targetId = agentId)
 *       ↓
 *   workspace  ModelPolicy scope=workspace
 *       ↓
 *   hardcoded fallback  gpt-4o-mini / openai
 *
 * La jerarquía de DB sigue el modelo del schema:
 *   ModelPolicy.scope  ∈  { workspace | agent | flow_node }
 *   ModelPolicy.targetId = agentId | nodeId | null
 *
 * Uso:
 *   const resolver = new ModelPolicyResolver(prisma)
 *   const resolved = await resolver.resolve({ workspaceId, agentId, nodeId, nodeConfig })
 *   // → { provider, model, temperature, maxTokens, policyId }
 */

import type { PrismaClient } from '@prisma/client'

// ── Tipos públicos ──────────────────────────────────────────────────────

export interface ResolveModelInput {
  workspaceId: string
  /** agentId al que pertenece el Run — undefined para runs sin agente */
  agentId?: string
  /** nodeId del FlowNode que se está ejecutando */
  nodeId?: string
  /** config cruda del nodo — tiene precedencia sobre ModelPolicy si define model/provider */
  nodeConfig: Record<string, unknown>
}

export interface ResolvedModel {
  /** Slug del provider (e.g. "openai", "qwen", "deepseek") */
  provider: string
  /** Nombre del modelo (e.g. "gpt-4o-mini", "qwen-plus") */
  model: string
  /** Temperature 0-2 */
  temperature: number
  /** Max tokens de completion */
  maxTokens: number
  /** ID de la ModelPolicy que ganó la resolución (undefined = fallback hardcoded) */
  policyId: string | undefined
  /** Nivel donde se resolvió (para logging/trazabilidad) */
  resolvedAt: 'node_config' | 'flow_node_policy' | 'agent_policy' | 'workspace_policy' | 'fallback'
}

// ── Fallback global ─────────────────────────────────────────────────────

const GLOBAL_FALLBACK: Omit<ResolvedModel, 'policyId' | 'resolvedAt'> = {
  provider:    'openai',
  model:       'gpt-4o-mini',
  temperature: 0.7,
  maxTokens:   4096,
}

// ── ModelPolicyResolver ─────────────────────────────────────────────────

export class ModelPolicyResolver {
  constructor(private readonly prisma: PrismaClient) {}

  async resolve(input: ResolveModelInput): Promise<ResolvedModel> {
    const { workspaceId, agentId, nodeId, nodeConfig } = input

    // ── Nivel 1: node.config explícito ─────────────────────────────────
    // Si el nodo tiene model Y provider definidos directamente en su config,
    // tienen precedencia total sobre cualquier policy de DB.
    if (
      typeof nodeConfig.model === 'string' && nodeConfig.model.length > 0 &&
      typeof nodeConfig.provider === 'string' && nodeConfig.provider.length > 0
    ) {
      return {
        provider:    nodeConfig.provider as string,
        model:       nodeConfig.model as string,
        temperature: typeof nodeConfig.temperature === 'number' ? nodeConfig.temperature : GLOBAL_FALLBACK.temperature,
        maxTokens:   typeof nodeConfig.maxTokens   === 'number' ? nodeConfig.maxTokens   : GLOBAL_FALLBACK.maxTokens,
        policyId:    undefined,
        resolvedAt:  'node_config',
      }
    }

    // ── Nivel 2: ModelPolicy scope=flow_node ───────────────────────────
    if (nodeId) {
      const policy = await this.prisma.modelPolicy.findFirst({
        where: {
          workspaceId,
          scope:    'flow_node',
          targetId: nodeId,
          enabled:  true,
        },
      })
      if (policy) {
        return {
          provider:    policy.provider,
          model:       policy.model,
          temperature: Number(policy.temperature),
          maxTokens:   policy.maxTokens,
          policyId:    policy.id,
          resolvedAt:  'flow_node_policy',
        }
      }
    }

    // ── Nivel 3: ModelPolicy scope=agent ───────────────────────────────
    if (agentId) {
      const policy = await this.prisma.modelPolicy.findFirst({
        where: {
          workspaceId,
          scope:    'agent',
          targetId: agentId,
          enabled:  true,
        },
      })
      if (policy) {
        return {
          provider:    policy.provider,
          model:       policy.model,
          temperature: Number(policy.temperature),
          maxTokens:   policy.maxTokens,
          policyId:    policy.id,
          resolvedAt:  'agent_policy',
        }
      }
    }

    // ── Nivel 4: ModelPolicy scope=workspace ───────────────────────────
    const workspacePolicy = await this.prisma.modelPolicy.findFirst({
      where: {
        workspaceId,
        scope:   'workspace',
        enabled: true,
      },
    })
    if (workspacePolicy) {
      return {
        provider:    workspacePolicy.provider,
        model:       workspacePolicy.model,
        temperature: Number(workspacePolicy.temperature),
        maxTokens:   workspacePolicy.maxTokens,
        policyId:    workspacePolicy.id,
        resolvedAt:  'workspace_policy',
      }
    }

    // ── Nivel 5: fallback hardcoded ─────────────────────────────────────
    return {
      ...GLOBAL_FALLBACK,
      policyId:   undefined,
      resolvedAt: 'fallback',
    }
  }

  /**
   * Versión sin DB — resuelve solo desde nodeConfig.
   * Útil en tests unitarios o cuando no hay acceso a Prisma.
   */
  static resolveFromConfig(
    nodeConfig: Record<string, unknown>,
  ): Pick<ResolvedModel, 'provider' | 'model' | 'temperature' | 'maxTokens'> {
    return {
      provider:    typeof nodeConfig.provider    === 'string' ? nodeConfig.provider    : GLOBAL_FALLBACK.provider,
      model:       typeof nodeConfig.model        === 'string' ? nodeConfig.model        : GLOBAL_FALLBACK.model,
      temperature: typeof nodeConfig.temperature  === 'number' ? nodeConfig.temperature  : GLOBAL_FALLBACK.temperature,
      maxTokens:   typeof nodeConfig.maxTokens    === 'number' ? nodeConfig.maxTokens    : GLOBAL_FALLBACK.maxTokens,
    }
  }
}
