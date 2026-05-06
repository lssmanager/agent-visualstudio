/**
 * AgentRunner — orquesta un Run completo:
 *   1. Crea el Run en DB
 *   2. Compila el Flow en nodos ejecutables
 *   3. Delega cada nodo a LLMStepExecutor
 *   4. Persiste RunSteps
 *   5. Cierra el Run con status final
 *
 * Fix tsc:
 *   - OAuthService importado como tipo local (evita cross-package import de apps/api)
 *   - ChannelKind importado de @prisma/client (alineado con schema corregido)
 *   - Run.status usa 'pending' (valor canónico del schema)
 *   - inputData / outputData / workspaceId / agentId / sessionId / channelKind
 *     son campos del modelo Run extendido
 *   - InputJsonValue cast para campos Json de Prisma
 */
import type { PrismaClient, ChannelKind, Prisma } from '@prisma/client'
import type { ILLMProvider } from './llm-provider.js'
import { LLMStepExecutor } from './llm-step-executor.js'
import type { StepExecutionContext } from './llm-step-executor.js'
import type { SkillSpec } from '../../core-types/src/skill-spec.js'
import type { McpToolDefinition } from '../../mcp-server/src/tools.js'

// ── OAuthService — tipo local para evitar cross-package import de apps/api ───────
// El servicio real se inyecta en runtime; aquí solo necesitamos la forma.
export interface IOAuthService {
  refreshToken(providerId: string): Promise<void>
  getTokenStatus(providerId: string): Promise<{
    hasToken: boolean
    expiresAt: string | null
    isExpired: boolean
  }>
}

export interface AgentRunnerConfig {
  prisma:          PrismaClient
  oauthService?:   IOAuthService
  providers?:      Map<string, ILLMProvider>
  defaultProvider?: ILLMProvider
}

export interface RunInput {
  workspaceId:      string
  agentId?:         string
  flowId?:          string
  sessionId?:       string
  channelKind?:     ChannelKind
  inputData:        Record<string, unknown>
  availableSkills?: SkillSpec[]
  extraTools?:      McpToolDefinition[]
}

export interface RunOutput {
  runId:      string
  status:     'completed' | 'failed'
  output?:    Record<string, unknown>
  error?:     string
  durationMs: number
}

export class AgentRunner {
  private readonly executor: LLMStepExecutor

  constructor(private readonly config: AgentRunnerConfig) {
    this.executor = new LLMStepExecutor({
      providers:       config.providers ?? new Map(),
      defaultProvider: config.defaultProvider,
      prisma:          config.prisma,
      oauthService:    config.oauthService as never,
    })
  }

  async run(input: RunInput): Promise<RunOutput> {
    const startMs = Date.now()

    // ── 1. Crear Run en DB ─────────────────────────────────────────────────────
    const run = await this.config.prisma.run.create({
      data: {
        workspaceId: input.workspaceId,
        agentId:     input.agentId,
        flowId:      input.flowId,
        sessionId:   input.sessionId,
        channelKind: input.channelKind,
        status:      'pending',
        inputData:   input.inputData as Prisma.InputJsonValue,
        startedAt:   new Date(),
      },
    })

    try {
      // ── 2. Obtener nodos del Flow ─────────────────────────────────────────
      const nodes = await this.resolveNodes(input)

      // ── 3. Contexto inicial ───────────────────────────────────────────────
      let context: StepExecutionContext = {
        runId:           run.id,
        workspaceId:     input.workspaceId,
        agentId:         input.agentId,
        availableSkills: input.availableSkills ?? [],
        extraTools:      input.extraTools,
        state:           { ...input.inputData },
      }

      // ── 4. Ejecutar nodos en secuencia ────────────────────────────────────
      let lastOutput: Record<string, unknown> = {}

      for (const node of nodes) {
        const result = await this.executor.execute(node, context)

        // Persistir RunStep
        await this.config.prisma.runStep.create({
          data: {
            runId:            run.id,
            nodeId:           result.step.nodeId,
            nodeType:         result.step.nodeType,
            index:            nodes.indexOf(node),
            status:           result.step.status,
            input:            result.step.input    as Prisma.InputJsonValue ?? Prisma.JsonNull,
            output:           result.step.output   as Prisma.InputJsonValue ?? Prisma.JsonNull,
            error:            result.step.error,
            model:            result.resolvedModel.model,
            provider:         result.resolvedModel.provider,
            promptTokens:     result.step.tokenUsage?.input,
            completionTokens: result.step.tokenUsage?.output,
            totalTokens:      result.step.tokenUsage
              ? result.step.tokenUsage.input + result.step.tokenUsage.output
              : undefined,
            costUsd:          result.step.costUsd,
            startedAt:        result.step.startedAt   ? new Date(result.step.startedAt)   : undefined,
            completedAt:      result.step.completedAt ? new Date(result.step.completedAt) : undefined,
          },
        })

        // Propagar estado
        context    = { ...context, state: result.state }
        lastOutput = result.state

        if (result.step.status === 'failed') {
          throw new Error(result.step.error ?? 'Step failed without error message')
        }
      }

      // ── 5. Cerrar Run como completed ──────────────────────────────────────
      await this.config.prisma.run.update({
        where: { id: run.id },
        data: {
          status:      'completed',
          outputData:  lastOutput as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      })

      return {
        runId:      run.id,
        status:     'completed',
        output:     lastOutput,
        durationMs: Date.now() - startMs,
      }

    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)

      await this.config.prisma.run.update({
        where: { id: run.id },
        data: {
          status:      'failed',
          error,
          completedAt: new Date(),
        },
      }).catch(() => { /* silent */ })

      return {
        runId:      run.id,
        status:     'failed',
        error,
        durationMs: Date.now() - startMs,
      }
    }
  }

  // ── Resolución de nodos ───────────────────────────────────────────────────────

  private async resolveNodes(input: RunInput) {
    if (input.flowId) {
      const flow = await this.config.prisma.flow.findUnique({
        where: { id: input.flowId },
      })
      if (!flow) throw new Error(`Flow ${input.flowId} not found`)

      return (flow.nodes as unknown as import('../../core-types/src/flow-spec.js').FlowNode[])
    }

    const agent = input.agentId
      ? await this.config.prisma.agent.findUnique({ where: { id: input.agentId } })
      : null

    return [
      {
        id:       'direct',
        type:     'agent' as const,
        label:    agent?.name ?? 'Agent',
        config: {
          systemPrompt: agent?.systemPrompt ?? undefined,
          model:        agent?.model        ?? undefined,
        },
        position: { x: 0, y: 0 },
      },
    ]
  }
}
