/**
 * LLMStepExecutor — executes a single FlowNode of type
 * 'agent' | 'subagent' | 'skill' | 'tool'.
 *
 * Cambios respecto a la versión anterior:
 *   - Integra ModelPolicyResolver para resolver modelo con jerarquía
 *     flow_node > agent > workspace > fallback
 *   - Soporta providers OAuth via IOAuthService.getAccessToken()
 *   - Escribe CostEvent en DB al finalizar el step (async, no bloquea)
 *   - Mantiene backwards-compat: si no se inyecta prisma, funciona igual
 *     que antes (resolución por nodeConfig solamente)
 */
import type { FlowNode } from '../../core-types/src/flow-spec'
import type { RunStep, RunStepTokenUsage } from '../../core-types/src/run-spec'
import { OpenAILLMProvider } from './llm-provider'
import type { ILLMProvider } from './llm-provider'
import { runToolCallLoop } from './tool-call-loop'
import type { McpToolDefinition } from '../../mcp-server/src/tools'
import { skillsToMcpTools } from '../../mcp-server/src/skill-bridge'
import type { SkillSpec } from '../../core-types/src/skill-spec'
import { ModelPolicyResolver } from './model-policy-resolver'
import type { ResolvedModel } from './model-policy-resolver'
import type { PrismaClient } from '@prisma/client'

// ── Contrato mínimo de OAuthService ────────────────────────────────────────
/** Contrato mínimo de OAuthService usado por LLMStepExecutor.
 *  El servicio real (apps/api) lo implementa. Se inyecta en runtime. */
export interface IOAuthService {
  getAccessToken(llmProviderId: string): Promise<string>
}

// ── Config ───────────────────────────────────────────────────────────

export interface LLMStepExecutorConfig {
  providers: Map<string, ILLMProvider>
  defaultProvider?: ILLMProvider
  prisma?: PrismaClient
  oauthService?: IOAuthService
  estimateCost?: (model: string, usage: RunStepTokenUsage) => number
}

// ── Contexto de ejecución ──────────────────────────────────────────────

export interface StepExecutionContext {
  runId:       string
  workspaceId: string
  agentId?:    string
  availableSkills: SkillSpec[]
  extraTools?: McpToolDefinition[]
  state: Record<string, unknown>
}

export interface StepExecutionResult {
  step:  RunStep
  state: Record<string, unknown>
  resolvedModel: ResolvedModel
}

// ── LLMStepExecutor ───────────────────────────────────────────────────

export class LLMStepExecutor {
  private readonly resolver: ModelPolicyResolver | null

  constructor(private readonly config: LLMStepExecutorConfig) {
    this.resolver = config.prisma
      ? new ModelPolicyResolver(config.prisma)
      : null
  }

  async execute(
    node:    FlowNode,
    context: StepExecutionContext,
  ): Promise<StepExecutionResult> {
    const startedAt = new Date().toISOString()
    const stepId    = `${context.runId}::${node.id}`

    const resolved = this.resolver
      ? await this.resolver.resolve({
          workspaceId: context.workspaceId,
          agentId:     context.agentId,
          nodeId:      node.id,
          nodeConfig:  node.config as Record<string, unknown>,
        })
      : {
          ...ModelPolicyResolver.resolveFromConfig(node.config as Record<string, unknown>),
          policyId:   undefined as string | undefined,
          resolvedAt: 'node_config' as const,
        }

    const provider = await this.resolveProvider(resolved, context.workspaceId)

    const step: RunStep = {
      id:        stepId,
      runId:     context.runId,
      nodeId:    node.id,
      nodeType:  node.type,
      status:    'running',
      startedAt,
      input:     { ...context.state },
    }

    try {
      const systemPrompt =
        typeof node.config.systemPrompt === 'string'
          ? node.config.systemPrompt
          : buildDefaultSystemPrompt(node, context, resolved)

      const userContent =
        typeof node.config.input === 'string'
          ? interpolate(node.config.input as string, context.state)
          : JSON.stringify(context.state)

      const skillTools: McpToolDefinition[] = skillsToMcpTools(
        context.availableSkills.map((s) => ({
          ...s,
          endpoint:
            typeof (s as unknown as { endpoint?: string }).endpoint === 'string'
              ? (s as unknown as { endpoint: string }).endpoint
              : undefined,
        })),
      )
      const allTools: McpToolDefinition[] = [
        ...skillTools,
        ...(context.extraTools ?? []),
      ]

      const loopResult = await runToolCallLoop({
        provider,
        model:       resolved.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userContent  },
        ],
        tools:         allTools,
        maxIterations: typeof node.config.maxIterations === 'number' ? node.config.maxIterations : 12,
        temperature:   resolved.temperature,
        maxTokens:     resolved.maxTokens,
      })

      const tokenUsage: RunStepTokenUsage = {
        input:  loopResult.totalUsage.promptTokens,
        output: loopResult.totalUsage.completionTokens,
      }

      const costUsd = this.computeCost(provider, resolved.model, {
        promptTokens:    loopResult.totalUsage.promptTokens,
        completionTokens: loopResult.totalUsage.completionTokens,
        totalTokens:     loopResult.totalUsage.totalTokens,
      })

      this.writeCostEvent({
        runId:       context.runId,
        workspaceId: context.workspaceId,
        agentId:     context.agentId,
        provider:    resolved.provider,
        model:       resolved.model,
        promptTokens:     loopResult.totalUsage.promptTokens,
        completionTokens: loopResult.totalUsage.completionTokens,
        totalTokens:      loopResult.totalUsage.totalTokens,
        costUsd,
        policyId: resolved.policyId,
      })

      const output = {
        content:          loopResult.finalMessage.content,
        hitMaxIterations: loopResult.hitMaxIterations,
        iterations:       loopResult.iterations,
      }

      const outputKey =
        typeof node.config.outputKey === 'string'
          ? node.config.outputKey
          : node.id
      const nextState = { ...context.state, [outputKey]: output }

      step.status      = 'completed'
      step.completedAt = new Date().toISOString()
      step.output      = output
      step.tokenUsage  = tokenUsage
      step.costUsd     = costUsd

      return { step, state: nextState, resolvedModel: resolved }

    } catch (err) {
      step.status      = 'failed'
      step.completedAt = new Date().toISOString()
      step.error       = err instanceof Error ? err.message : String(err)
      return { step, state: context.state, resolvedModel: resolved }
    }
  }

  private async resolveProvider(
    resolved:    ResolvedModel,
    workspaceId: string,
  ): Promise<ILLMProvider> {
    const cached = this.config.providers.get(resolved.provider)
    if (cached) return cached

    if (this.config.prisma && this.config.oauthService) {
      const dbProvider = await this.config.prisma.llmProvider.findFirst({
        where:   { workspaceId, provider: resolved.provider },
        include: { catalog: true, oauthToken: true },
      })

      if (dbProvider) {
        let apiKey = ''

        if (dbProvider.catalog.authType === 'oauth') {
          apiKey = await this.config.oauthService.getAccessToken(dbProvider.id)
        } else if (dbProvider.apiKeyEnc) {
          apiKey = decryptApiKey(dbProvider.apiKeyEnc)
        }

        const instance = new OpenAILLMProvider({
          apiKey,
          baseUrl:      dbProvider.baseUrl ?? dbProvider.catalog.defaultBaseUrl ?? undefined,
          defaultModel: resolved.model,
        })

        this.config.providers.set(resolved.provider, instance)
        return instance
      }
    }

    if (this.config.defaultProvider) return this.config.defaultProvider

    throw new Error(
      `No ILLMProvider available for provider slug "${resolved.provider}". ` +
      `Add it to LLMStepExecutorConfig.providers or configure a LlmProvider in DB.`,
    )
  }

  private computeCost(
    provider: ILLMProvider,
    model:    string,
    usage:    { promptTokens: number; completionTokens: number; totalTokens: number },
  ): number | undefined {
    if (provider instanceof OpenAILLMProvider) {
      return provider.estimateCost(model, usage)
    }
    if (this.config.estimateCost) {
      return this.config.estimateCost(model, { input: usage.promptTokens, output: usage.completionTokens })
    }
    return undefined
  }

  private writeCostEvent(data: {
    runId:            string
    workspaceId:      string
    agentId?:         string
    provider:         string
    model:            string
    promptTokens:     number
    completionTokens: number
    totalTokens:      number
    costUsd:          number | undefined
    policyId?:        string
  }): void {
    if (!this.config.prisma) return
    const prisma = this.config.prisma

    prisma.costEvent.create({
      data: {
        runId:            data.runId,
        workspaceId:      data.workspaceId,
        agentId:          data.agentId,
        provider:         data.provider,
        model:            data.model,
        promptTokens:     data.promptTokens,
        completionTokens: data.completionTokens,
        totalTokens:      data.totalTokens,
        costUsd:          data.costUsd ?? 0,
        metadata:         data.policyId ? { resolvedByPolicy: data.policyId } : {},
      },
    }).catch((err: unknown) => {
      console.error('[LLMStepExecutor] CostEvent write failed:', err)
    })
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function buildDefaultSystemPrompt(
  node:     FlowNode,
  context:  StepExecutionContext,
  resolved: ResolvedModel,
): string {
  return [
    `You are an AI agent executing a flow step.`,
    `Node: ${node.id} (${node.type})`,
    node.label ? `Label: ${node.label}` : '',
    `Workspace: ${context.workspaceId}`,
    `Run: ${context.runId}`,
    `Model: ${resolved.model} via ${resolved.provider} (resolved at: ${resolved.resolvedAt})`,
    `Available state keys: ${Object.keys(context.state).join(', ') || 'none'}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function interpolate(
  template: string,
  state:    Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = state[key]
    return val === undefined ? `{{${key}}}` : String(val)
  })
}

function decryptApiKey(enc: string): string {
  const crypto = require('node:crypto') as typeof import('node:crypto')
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'hex')
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)')

  const [ivHex, tagHex, dataHex] = enc.split(':')
  if (!ivHex || !tagHex || !dataHex) throw new Error('Invalid encrypted apiKey format')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') + decipher.final('utf8')
}
