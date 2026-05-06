/**
 * HierarchyOrchestrator — implementación completa con checkpointing Prisma
 *
 * Arquitectura:
 *   - Cada orchestrate() crea un Run en Prisma y persiste cada subtarea como RunStep.
 *   - La descomposición usa un supervisor LLM real (JSON structured output) con
 *     fallback a round-robin si el LLM falla o no hay hijos.
 *   - Retry configurable por subtarea con backoff exponencial.
 *   - HITL (Human-in-the-Loop): nodos marcados requiresApproval=true pausan el Run
 *     y esperan un Approval en DB antes de continuar.
 *   - Consolidación final vía supervisor LLM.
 *
 * Patrones de referencia:
 *   - CrewAI: Crew.kickoff() + parallel task execution + consolidation
 *   - AutoGen: GroupChatManager → specialist routing
 *   - LangGraph: supervisor node + subgraph + checkpoint by step
 *   - Semantic Kernel: planner decompose goals into steps
 */

import type { PrismaClient } from '@prisma/client'
import { RunRepository } from '../../run-engine/src/run-repository'
import {
  RunStepEventEmitter,
  buildStatusChangeEvent,
} from '../../run-engine/src/events/index'

// ── Constantes de módulo — se instancian UNA SOLA VEZ al importar ───────────

/**
 * Palabras vacías filtradas antes del cálculo de score de capacidades.
 * Definida a nivel de módulo para evitar recronstrucción en cada llamada
 * a tokenize() — crítico en flows de alta frecuencia con múltiples candidatos.
 */
const STOPWORDS_SET = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
  'for', 'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was',
  'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'this', 'that', 'these', 'those', 'it', 'its', 'you', 'your',
  'we', 'our', 'they', 'their', 'he', 'she', 'his', 'her',
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'en', 'con', 'por',
  'para', 'que', 'es', 'son', 'tiene', 'este', 'esta',
])

/**
 * Regex de tokenización — extrae tokens alfanuméricos (incluyendo chars
 * acentuados en español). Definida a nivel de módulo para evitar
 * recompilación en cada invocación de tokenize().
 */
const TOKEN_SPLIT_RE = /[^a-záéíóúüñ\w]+/gi

// ── Tipos públicos ───────────────────────────────────────────────────────────────────────────────

export type HierarchyLevel = 'agency' | 'department' | 'workspace' | 'agent' | 'subagent'

export interface HierarchyNode {
  id:       string
  name:     string
  level:    HierarchyLevel
  parentId?: string
  children?: HierarchyNode[]
  /** Configuración del agente si level es agent/subagent */
  agentConfig?: {
    model:        string
    systemPrompt: string
    skills?:      string[]
    /** Si true: el orchestrator pausa el Run y espera un Approval antes de ejecutar */
    requiresApproval?: boolean
  }
}

export interface HierarchyTask {
  id:            string
  description:   string
  assignedNodeId: string
  level:         HierarchyLevel
  input?:        Record<string, unknown>
}

export interface SubtaskResult {
  taskId:    string
  nodeId:    string
  stepId:    string          // ID del RunStep en Prisma
  status:    'completed' | 'partial' | 'failed' | 'skipped' | 'rejected'
  output:    unknown
  error?:    string
  durationMs: number
  retries:   number
}

export interface OrchestrationResult {
  runId:             string  // ID del Run en Prisma
  rootTaskId:        string
  status:            'completed' | 'partial' | 'failed'
  consolidatedOutput: ConsolidationResult
  subtaskResults:    SubtaskResult[]
  totalDurationMs:   number
}

export interface ConsolidationError {
  taskId: string
  nodeId: string
  message: string
}

/**
 * [F2a-06d] Resultado rico de la consolidación, incluye stats de ejecución.
 */
export interface ConsolidationResult {
  summary: string
  stats: {
    total:     number
    completed: number
    partial:   number
    failed:    number
    rejected:  number
    errors:    ConsolidationError[]
  }
}

/**
 * Resultado rico devuelto por AgentExecutorFn al orchestrator.
 * Permite que completeStep() en Prisma reciba todos los metadatos de consumo LLM.
 */
export interface AgentExecutionResult {
  /** Texto de respuesta final del agente (para consolidación) */
  response:          string
  /** Modelo exacto usado (e.g. 'openai/gpt-4o-mini') */
  model?:            string
  /** Proveedor (e.g. 'openai', 'anthropic', 'openrouter') */
  provider?:         string
  promptTokens?:     number
  completionTokens?: number
  totalTokens?:      number
  costUsd?:          number
}

/**
 * Función de ejecución de agente inyectada desde LLMStepExecutor.
 * Devuelve AgentExecutionResult con la respuesta y todos los metadatos
 * de consumo LLM (modelo, tokens, costo) para persistencia en Prisma.
 */
export interface AgentExecutorFn {
  (
    agentId:      string,
    systemPrompt: string,
    task:         string,
    skills?:      string[],
  ): Promise<AgentExecutionResult>
}

/**
 * Función de supervisor LLM inyectada para descomposición y consolidación.
 * Recibe el prompt y devuelve la respuesta en texto.
 */
export interface SupervisorFn {
  (prompt: string): Promise<string>
}

type ParentRunLink = {
  parentRunId:  string
  parentStepId: string
}

/**
 * Snapshot de un RunStep consultado desde BD.
 * READ-ONLY — devuelto por getStepStatus().
 *
 * Nota: finishedAt mapea a RunStep.completedAt en el schema.
 * Los campos model/provider/index requieren la migración add-system-config-and-runstep-fields.
 */
export interface StepStatusResult {
  stepId:           string
  runId:            string
  nodeId:           string
  nodeType:         string
  status:           'queued' | 'running' | 'completed' | 'failed' | 'skipped'
  index:            number
  input:            unknown
  output:           unknown
  error:            string | null
  model:            string | null
  provider:         string | null
  promptTokens:     number | null
  completionTokens: number | null
  totalTokens:      number | null
  costUsd:          number | null
  startedAt:        Date | null
  /** Mapea a RunStep.completedAt en schema.prisma */
  finishedAt:       Date | null
  createdAt:        Date
}

/**
 * Resultado de routeTask(): decide si una subtarea se ejecuta localmente
 * (nodo hoja specialist) o se delega al nivel jerárquico inferior.
 *
 * [F2a-03] — Plan Maestro: Agency → Department → Workspace → Agent
 * Ningún nivel puede saltarse. La delegación se materializa como
 * RunStep { nodeType: 'delegation' } en BD.
 */
export type RouteDecision =
  | { type: 'local';    node: HierarchyNode }
  | { type: 'delegate'; node: HierarchyNode; children: HierarchyNode[] }

// ── [F2a-04] Tipos de matching por capacidad ─────────────────────────────────────────────────────

/** Score de afinidad de un agente para un task dado */
export interface CapabilityScore {
  node:         HierarchyNode
  score:        number    // 0.0 – 1.0 (Jaccard simplificado)
  matchedOn:    'systemPrompt' | 'persona' | 'knowledgeBase' | 'fallback'
  profileFound: boolean  // false si AgentProfile no existe en BD
}

/**
 * Resultado de findSpecialistWithCapability().
 * Siempre devuelve un nodo — nunca null.
 * Si no hay match real, isFallback = true.
 */
export interface SpecialistMatch {
  node:       HierarchyNode
  score:      number
  isFallback: boolean
  allScores:  CapabilityScore[]
}

/** Bloque ---DELEGATE--- parseado desde la salida del supervisor LLM */
export interface DelegateBlock {
  to:       string
  task:     string
  context:  Record<string, unknown>
  priority: 'high' | 'medium' | 'low'
}

/**
 * Resultado de isBlocked().
 * Siempre se devuelve — nunca null, nunca lanza.
 */
export interface BlockedStatus {
  /** true si el step/run está bloqueado */
  blocked:     boolean

  /** ID del RunStep bloqueado (si blocked = true) */
  stepId?:     string

  /** ID del Run al que pertenece el step bloqueado */
  runId?:      string

  /** nodeId del step bloqueado */
  nodeId?:     string

  /** Milisegundos transcurridos desde startedAt (si disponible) */
  elapsedMs?:  number

  /** El timeout que se superó */
  timeoutMs?:  number

  /** Razón textual para logging/alertas */
  reason?:     string
}

// ── Opciones de configuración ────────────────────────────────────────────────────────────────

export interface OrchestratorOptions {
  /** Cuántas veces reintentar un subtask fallido antes de marcarlo como failed */
  maxRetries?: number
  /** Backoff base en ms entre reintentos (exponencial: baseMs * 2^attempt) */
  retryBaseMs?: number
  /** Timeout por subtask en ms (0 = sin timeout) */
  subtaskTimeoutMs?: number
  /** Timeout de espera de aprobación HITL en ms */
  approvalTimeoutMs?: number
  /** Ejecutar subtareas en paralelo (true) o secuencial (false) */
  parallel?: boolean
}

/**
 * Tiempo máximo que un RunStep de delegación puede estar
 * en estado 'running' o 'queued' antes de considerarse bloqueado.
 */
export const DELEGATION_TIMEOUT_MS = 10 * 60 * 1000  // 10 minutos

const DEFAULT_OPTIONS: Required<OrchestratorOptions> = {
  maxRetries:        2,
  retryBaseMs:       500,
  subtaskTimeoutMs:  120_000,  // 2 min
  approvalTimeoutMs: 900_000,  // 15 min
  parallel:          true,
}

// ── [F2a-04] Funciones puras de tokenización y scoring ───────────────────────────────────────────

/**
 * Tokeniza texto en un Set de palabras lowercase sin stopwords.
 *
 * Usa STOPWORDS_SET y TOKEN_SPLIT_RE definidas a nivel de módulo
 * para evitar re-instanciación en flows de alta frecuencia (AUDIT-27).
 */
export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(TOKEN_SPLIT_RE)
      .filter((w) => w.length >= 3 && !STOPWORDS_SET.has(w)),
  )
}

/**
 * Jaccard simplificado: |A ∩ B| / |A ∪ B|
 */
export function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  const intersection = [...a].filter((t) => b.has(t)).length
  const union = new Set([...a, ...b]).size
  return intersection / union
}

/**
 * Extrae bloques ---DELEGATE--- ... ---END--- del texto del LLM.
 * Función pura, sin efectos secundarios, nunca lanza.
 */
export function parseDelegateBlocks(raw: string): DelegateBlock[] {
  const BLOCK_RE = /---DELEGATE---([\s\S]*?)---END---/g
  const blocks: DelegateBlock[] = []
  let match: RegExpExecArray | null

  while ((match = BLOCK_RE.exec(raw)) !== null) {
    const body = match[1]

    const field = (key: string): string | undefined => {
      const re = new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'im')
      return re.exec(body)?.[1]?.trim()
    }

    const to = field('TO')
    const task = field('TASK')
    if (!to || !task) continue

    let context: Record<string, unknown> = {}
    const rawCtx = field('CONTEXT')
    if (rawCtx) {
      try {
        const parsed = JSON.parse(rawCtx)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          context = parsed as Record<string, unknown>
        }
      } catch {
        // Ignorar CONTEXT malformado y seguir con {}
      }
    }

    const rawPri = field('PRIORITY')?.toLowerCase()
    const priority: DelegateBlock['priority'] =
      rawPri === 'high' || rawPri === 'low' ? rawPri : 'medium'

    blocks.push({ to, task, context, priority })
  }

  return blocks
}

// ── HierarchyOrchestrator ─────────────────────────────────────────────────────────────────

export class HierarchyOrchestrator {
  private readonly repo:       RunRepository
  private readonly hierarchy:  HierarchyNode
  private readonly executorFn: AgentExecutorFn
  private readonly supervisorFn?: SupervisorFn
  private readonly opts:       Required<OrchestratorOptions>

  constructor(
    hierarchy:   HierarchyNode,
    executorFn:  AgentExecutorFn,
    prisma:      PrismaClient,
    supervisorFn?: SupervisorFn,
    opts?:       OrchestratorOptions,
    /** F2a-10: emitter de transiciones de RunStep — opcional para compatibilidad hacia atrás */
    private readonly emitter?: RunStepEventEmitter,
    private readonly parentRunLink?: ParentRunLink,
  ) {
    this.hierarchy    = hierarchy
    this.executorFn   = executorFn
    this.supervisorFn = supervisorFn
    this.repo         = new RunRepository(prisma)
    this.opts         = { ...DEFAULT_OPTIONS, ...opts }
  }

  // ── API pública ──────────────────────────────────────────────────────────────────

  async orchestrate(
    workspaceId: string,
    rootTask: string,
    input?: Record<string, unknown>,
  ): Promise<OrchestrationResult> {
    const startTime = Date.now()

    const run = await this.repo.createRun({
      workspaceId,
      agentId:   this.hierarchy.level === 'agent' ? this.hierarchy.id : undefined,
      inputData: { task: rootTask, ...input },
      metadata:  {
        hierarchyRoot:  this.hierarchy.id,
        hierarchyLevel: this.hierarchy.level,
        ...this.parentRunLink,
      },
    })
    await this.repo.startRun(run.id)

    try {
      const subtasks = await this.decomposeTasks(rootTask, input)

      const subtaskResults = this.opts.parallel
        ? await this.executeParallel(subtasks, run.id, workspaceId)
        : await this.executeSequential(subtasks, run.id, workspaceId)

      const consolidatedOutput = await this.consolidateResults(rootTask, subtaskResults)

      const failed  = subtaskResults.filter((r) => r.status === 'failed' || r.status === 'rejected')
      const partial = subtaskResults.filter((r) => r.status === 'partial')
      const success = subtaskResults.filter((r) => r.status === 'completed')
      const runStatus: OrchestrationResult['status'] =
        failed.length === 0
          ? (partial.length > 0 ? 'partial' : 'completed')
          : success.length === 0 && partial.length === 0
            ? 'failed'
            : 'partial'

      if (runStatus === 'failed') {
        await this.repo.failRun(run.id, `${failed.length} subtask(s) failed`)
      } else {
        await this.repo.completeRun(run.id, { consolidatedOutput: consolidatedOutput.summary, subtaskResults })
      }

      return {
        runId: run.id,
        rootTaskId: run.id,
        status: runStatus,
        consolidatedOutput,
        subtaskResults,
        totalDurationMs: Date.now() - startTime,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.repo.failRun(run.id, message)
      throw err
    }
  }

  async getStepStatus(stepId: string): Promise<StepStatusResult | null> {
    const step = await this.repo.findStep(stepId)
    if (!step) return null

    return {
      stepId:           step.id,
      runId:            step.runId,
      nodeId:           step.nodeId,
      nodeType:         step.nodeType,
      status:           step.status as StepStatusResult['status'],
      index:            step.index,
      input:            step.input,
      output:           step.output,
      error:            step.error            ?? null,
      model:            step.model            ?? null,
      provider:         step.provider         ?? null,
      promptTokens:     step.promptTokens     ?? null,
      completionTokens: step.completionTokens ?? null,
      totalTokens:      step.totalTokens      ?? null,
      costUsd:          step.costUsd          ?? null,
      startedAt:        step.startedAt        ?? null,
      finishedAt:       step.completedAt      ?? null,
      createdAt:        step.createdAt,
    }
  }

  async isBlocked(stepId: string): Promise<BlockedStatus> {
    try {
      const step = await this.repo.findStep(stepId)

      if (!step) {
        return { blocked: false, reason: `Step ${stepId} not found` }
      }

      if (step.nodeType !== 'delegation') {
        return {
          blocked: false,
          stepId: step.id,
          runId: step.runId,
          reason: `Step ${stepId} is not a delegation step (nodeType: ${step.nodeType})`,
        }
      }

      const activeStatuses = ['running', 'queued']
      if (!activeStatuses.includes(step.status)) {
        return {
          blocked: false,
          stepId: step.id,
          runId: step.runId,
          reason: `Step ${stepId} has terminal status: ${step.status}`,
        }
      }

      const referenceTime = step.startedAt ?? step.createdAt
      const elapsedMs     = Date.now() - referenceTime.getTime()

      if (elapsedMs < DELEGATION_TIMEOUT_MS) {
        return {
          blocked: false,
          stepId: step.id,
          runId: step.runId,
          nodeId: step.nodeId,
          elapsedMs,
          timeoutMs: DELEGATION_TIMEOUT_MS,
          reason: `Step running for ${elapsedMs}ms — within timeout (${DELEGATION_TIMEOUT_MS}ms)`,
        }
      }

      return {
        blocked: true,
        stepId: step.id,
        runId: step.runId,
        nodeId: step.nodeId,
        elapsedMs,
        timeoutMs: DELEGATION_TIMEOUT_MS,
        reason: `Delegation step ${stepId} blocked: running for ${elapsedMs}ms > ${DELEGATION_TIMEOUT_MS}ms timeout`,
      }
    } catch {
      return { blocked: false, reason: `isBlocked check failed for step ${stepId} — BD error` }
    }
  }

  async isRunBlocked(runId: string): Promise<BlockedStatus> {
    try {
      const steps = await this.repo.findDelegationStepsByRun(runId)

      for (const step of steps) {
        const activeStatuses = ['running', 'queued']
        if (!activeStatuses.includes(step.status)) continue

        const referenceTime = step.startedAt ?? step.createdAt
        const elapsedMs     = Date.now() - referenceTime.getTime()

        if (elapsedMs >= DELEGATION_TIMEOUT_MS) {
          return {
            blocked: true,
            stepId: step.id,
            runId: step.runId,
            nodeId: step.nodeId,
            elapsedMs,
            timeoutMs: DELEGATION_TIMEOUT_MS,
            reason: `Run ${runId} blocked: delegation step ${step.id} running for ${elapsedMs}ms`,
          }
        }
      }

      return { blocked: false, runId, reason: `No blocked delegation steps in run ${runId}` }
    } catch {
      return { blocked: false, reason: `isRunBlocked check failed for run ${runId} — BD error` }
    }
  }

  // ── Descomposición de tareas ─────────────────────────────────────────────────────────

  private async decomposeTasks(
    rootTask: string,
    input?: Record<string, unknown>,
  ): Promise<HierarchyTask[]> {
    const agents = this.collectAgentNodes(this.hierarchy)

    if (agents.length === 0) {
      return [{
        id:             `subtask-${this.hierarchy.id}`,
        description:    rootTask,
        assignedNodeId: this.hierarchy.id,
        level:          this.hierarchy.level,
        input,
      }]
    }

    if (this.supervisorFn) {
      try {
        return await this.decomposeTask(rootTask, agents, input)
      } catch {
        // fallback silencioso a capability matching
      }
    }

    const match = await this.findSpecialistWithCapability(rootTask, agents)
    return [{
      id:             `subtask-${match.node.id}-0`,
      description:    rootTask,
      assignedNodeId: match.node.id,
      level:          match.node.level,
      input,
    }]
  }

  /**
   * Descompone un task en subtareas usando el supervisor LLM.
   *
   * Formato de salida del LLM: bloques ---DELEGATE---/---END---.
   * Si el LLM falla o no produce bloques válidos, se usa fallbackToCapabilityMatch().
   */
  private async decomposeTask(
    rootTask: string,
    agents:   HierarchyNode[],
    input?:   Record<string, unknown>,
  ): Promise<HierarchyTask[]> {
    const agentList = agents
      .map((a) => `- id: ${a.id}, name: ${a.name}, level: ${a.level}`)
      .join('\n')

    const prompt = [
      'You are a supervisor orchestrator. Decompose the following task into subtasks.',
      'Assign each subtask to exactly one agent from the list below.',
      'Respond ONLY with ---DELEGATE--- blocks. No prose, no markdown fences.',
      'Format:',
      '---DELEGATE---',
      'TO: <agent-id>',
      'TASK: <description>',
      'CONTEXT: {"key":"value"}',
      'PRIORITY: high|medium|low',
      '---END---',
      '',
      `Task: ${rootTask}`,
      input ? `Context: ${JSON.stringify(input)}` : '',
      '',
      'Available agents:',
      agentList,
    ].join('\n')

    let raw = ''
    try {
      raw = await this.supervisorFn!(prompt)
    } catch {
      return this.fallbackToCapabilityMatch(rootTask, agents, input)
    }

    const blocks = parseDelegateBlocks(raw)
    if (blocks.length === 0) {
      return this.fallbackToCapabilityMatch(rootTask, agents, input)
    }

    const agentIds = new Set(agents.map((a) => a.id))
    const validBlocks = blocks.filter((b) => agentIds.has(b.to))
    if (validBlocks.length === 0) {
      return this.fallbackToCapabilityMatch(rootTask, agents, input)
    }

    return validBlocks.map((block, idx) => {
      const agent = agents.find((a) => a.id === block.to)!
      return {
        id:             `subtask-${block.to}-${idx}`,
        description:    block.task,
        assignedNodeId: block.to,
        level:          agent.level,
        input:          { ...input, ...block.context },
      }
    })
  }

  /**
   * Fallback cuando el supervisor no produce bloques válidos.
   * Usa findSpecialistWithCapability() para asignación por Jaccard score.
   * Nunca lanza. Siempre retorna al menos 1 HierarchyTask.
   */
  private async fallbackToCapabilityMatch(
    rootTask: string,
    agents:   HierarchyNode[],
    input?:   Record<string, unknown>,
  ): Promise<HierarchyTask[]> {
    const match = await this.findSpecialistWithCapability(rootTask, agents)
    return [{
      id:             `subtask-${match.node.id}-0`,
      description:    rootTask,
      assignedNodeId: match.node.id,
      level:          match.node.level,
      input,
    }]
  }

  // ── Ejecución ──────────────────────────────────────────────────────────────────────────────

  private async executeParallel(
    subtasks:    HierarchyTask[],
    runId:       string,
    workspaceId: string,
  ): Promise<SubtaskResult[]> {
    const settled = await Promise.allSettled(
      subtasks.map((task, idx) => {
        const decision = this.routeTask(task)
        if (decision.type === 'local') {
          return this.executeWithRetry(task, idx, runId, workspaceId)
        }
        return this.delegateTask(task, decision, idx, runId, workspaceId)
      }),
    )
    return settled.map((result, idx) => {
      if (result.status === 'fulfilled') return result.value
      return {
        taskId:     subtasks[idx].id,
        nodeId:     subtasks[idx].assignedNodeId,
        stepId:     '',
        status:     'failed' as const,
        output:     null,
        error:      result.reason instanceof Error ? result.reason.message : String(result.reason),
        durationMs: 0,
        retries:    this.opts.maxRetries,
      }
    })
  }

  private async executeSequential(
    subtasks:    HierarchyTask[],
    runId:       string,
    workspaceId: string,
  ): Promise<SubtaskResult[]> {
    const results: SubtaskResult[] = []
    for (let idx = 0; idx < subtasks.length; idx++) {
      const task     = subtasks[idx]
      const decision = this.routeTask(task)
      const result   = await (
        decision.type === 'local'
          ? this.executeWithRetry(task, idx, runId, workspaceId)
          : this.delegateTask(task, decision, idx, runId, workspaceId)
      ).catch((err) => ({
        taskId:     task.id,
        nodeId:     task.assignedNodeId,
        stepId:     '',
        status:     'failed' as const,
        output:     null,
        error:      err instanceof Error ? err.message : String(err),
        durationMs: 0,
        retries:    this.opts.maxRetries,
      }))
      results.push(result)
    }
    return results
  }

  private async executeWithRetry(
    task:        HierarchyTask,
    index:       number,
    runId:       string,
    workspaceId: string,
  ): Promise<SubtaskResult> {
    const start = Date.now()
    const node  = this.findNode(task.assignedNodeId)

    const step = await this.repo.createStep({
      runId,
      nodeId:   task.assignedNodeId,
      nodeType: node?.level ?? 'agent',
      index,
      input:    { task: task.description, ...task.input },
    })

    if (node?.agentConfig?.requiresApproval) {
      await this.repo.pauseRun(runId)

      const approval = await this.repo.createApproval({
        workspaceId,
        agentId:     task.assignedNodeId,
        runId,
        stepId:      step.id,
        title:       `Approval required: ${node.name}`,
        description: `Agent "${node.name}" needs approval before executing: ${task.description}`,
        payload:     { task: task.description, nodeId: task.assignedNodeId, input: task.input ?? {} },
        expiresAt:   new Date(Date.now() + this.opts.approvalTimeoutMs),
      })

      const decision = await this.repo.waitForApproval(approval.id, this.opts.approvalTimeoutMs)
      await this.repo.startRun(runId)

      if (decision !== 'approved') {
        await this.repo.skipStep(step.id)
        return {
          taskId:     task.id,
          nodeId:     task.assignedNodeId,
          stepId:     step.id,
          status:     'rejected',
          output:     null,
          error:      `Approval ${decision}`,
          durationMs: Date.now() - start,
          retries:    0,
        }
      }
    }

    const systemPrompt = node?.agentConfig?.systemPrompt
      ?? `You are ${node?.name ?? task.assignedNodeId}. Complete your assigned task.`
    const skills = node?.agentConfig?.skills

    let lastError = ''
    for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
      if (attempt > 0) {
        const waitMs = this.opts.retryBaseMs * Math.pow(2, attempt - 1)
        await new Promise((r) => setTimeout(r, waitMs))
      }

      try {
        const execResult = await this.withTimeout(
          this.executorFn(task.assignedNodeId, systemPrompt, task.description, skills),
          this.opts.subtaskTimeoutMs,
          `Subtask ${task.id} timed out after ${this.opts.subtaskTimeoutMs}ms`,
        )

        await this.repo.completeStep({
          stepId:           step.id,
          output:           execResult.response,
          model:            execResult.model,
          provider:         execResult.provider,
          promptTokens:     execResult.promptTokens,
          completionTokens: execResult.completionTokens,
          totalTokens:      execResult.totalTokens,
          costUsd:          execResult.costUsd,
        })

        return {
          taskId:     task.id,
          nodeId:     task.assignedNodeId,
          stepId:     step.id,
          status:     'completed',
          output:     execResult.response,
          durationMs: Date.now() - start,
          retries:    attempt,
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
      }
    }

    await this.repo.failStep({ stepId: step.id, error: lastError })
    return {
      taskId:     task.id,
      nodeId:     task.assignedNodeId,
      stepId:     step.id,
      status:     'failed',
      output:     null,
      error:      lastError,
      durationMs: Date.now() - start,
      retries:    this.opts.maxRetries,
    }
  }

  // ── Consolidación ────────────────────────────────────────────────────────────────────

  private async consolidateResults(
    rootTask: string,
    results:  SubtaskResult[],
  ): Promise<ConsolidationResult> {
    const completed = results.filter((r) => r.status === 'completed')
    const partial = results.filter((r) => r.status === 'partial')
    const successful = [...completed, ...partial]
    const errors = results
      .filter((r) => r.status === 'failed' || r.status === 'rejected')
      .map((r) => ({
        taskId:  r.taskId,
        nodeId:  r.nodeId,
        message: r.error ?? (
          r.status === 'failed'
            ? 'Subtask failed without an error message'
            : 'Subtask was rejected without an error message'
        ),
      }))

    if (successful.length === 0) {
      return {
        summary: 'All subtasks failed or were rejected. No output available.',
        stats: {
          total:     results.length,
          completed: 0,
          partial:   partial.length,
          failed:    results.filter((r) => r.status === 'failed').length,
          rejected:  results.filter((r) => r.status === 'rejected').length,
          errors,
        },
      }
    }

    const stats: ConsolidationResult['stats'] = {
      total:     results.length,
      completed: completed.length,
      partial:   partial.length,
      failed:    results.filter((r) => r.status === 'failed').length,
      rejected:  results.filter((r) => r.status === 'rejected').length,
      errors,
    }

    if (this.supervisorFn) {
      try {
        return await this.consolidateWithSupervisor(rootTask, successful, errors, stats)
      } catch {
        // fallback a concatenación
      }
    }

    return {
      summary: [
        `Consolidated output for: "${rootTask}"`,
        `(${successful.length}/${results.length} subtasks completed or partial)`,
        '',
        ...successful.map((r, i) => {
          const marker = r.status === 'partial' ? ' [PARTIAL]' : ''
          return `[${i + 1}] Agent ${r.nodeId}${marker}:\n${String(r.output)}`
        }),
      ].join('\n\n'),
      stats,
    }
  }

  private async consolidateWithSupervisor(
    rootTask:  string,
    completed: SubtaskResult[],
    errors:    ConsolidationError[],
    stats:     ConsolidationResult['stats'],
  ): Promise<ConsolidationResult> {
    const statusLine =
      stats.failed > 0 || stats.partial > 0 || stats.rejected > 0
        ? `Note: ${stats.completed} of ${stats.total} subtasks completed` +
          (stats.partial  > 0 ? `, ${stats.partial} partial` : '') +
          (stats.failed   > 0 ? `, ${stats.failed} failed`   : '') +
          (stats.rejected > 0 ? `, ${stats.rejected} rejected` : '') +
          '. Synthesize only from the available completed results.'
        : ''

    const resultsSummary = completed
      .map((r, i) => `[${i + 1}] Agent ${r.nodeId}: ${String(r.output ?? '')}`)
      .join('\n')

    const failureSummary = errors.length > 0
      ? errors
          .map((r) =>
            `[FAILED] Agent ${r.nodeId} (${r.taskId}): ${r.message}`
          )
          .join('\n')
      : ''

    const prompt = [
      'You are a supervisor synthesizing results from multiple agents.',
      `Original task: "${rootTask}"`,
      statusLine,
      '',
      'Agent results:',
      resultsSummary,
      failureSummary ? '\nFailed agents (context only — do not include their output):' : '',
      failureSummary,
      '',
      'Provide a single, coherent, complete answer.',
      'When some agents failed, acknowledge the limitation briefly in your synthesis.',
      'Do not blame individual agents by ID — use "some components" or "partial information".',
      'Just provide the final synthesized answer.',
    ].filter(Boolean).join('\n')

    return {
      summary: await this.supervisorFn!(prompt),
      stats,
    }
  }

  // ── Utilidades privadas ──────────────────────────────────────────────────────────────────

  private withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    if (ms <= 0) return promise
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms)
      promise.then(
        (v) => { clearTimeout(timer); resolve(v) },
        (e) => { clearTimeout(timer); reject(e) },
      )
    })
  }

  private collectAgentNodes(node: HierarchyNode): HierarchyNode[] {
    if (!node.children || node.children.length === 0) {
      if (node.level === 'agent' || node.level === 'subagent') return [node]
      return []
    }
    return node.children.flatMap((child) => this.collectAgentNodes(child))
  }

  private findNode(id: string): HierarchyNode | undefined {
    const queue: HierarchyNode[] = [this.hierarchy]
    while (queue.length > 0) {
      const node = queue.shift()!
      if (node.id === id) return node
      if (node.children) queue.push(...node.children)
    }
    return undefined
  }

  private async findSpecialistWithCapability(
    taskDescription: string,
    candidates?:     HierarchyNode[],
  ): Promise<SpecialistMatch> {
    const agents = candidates ?? this.collectAgentNodes(this.hierarchy)

    if (agents.length === 0) {
      return { node: this.hierarchy, score: 0, isFallback: true, allScores: [] }
    }

    try {
      const profiles = await this.repo.findAgentProfiles(agents.map((a) => a.id)) as Array<{
        agentId: string
        systemPrompt?: string
        persona?: unknown
        knowledgeBase?: unknown
      }>
      const profileMap = new Map<string, (typeof profiles)[number]>(
        profiles.map((p) => [p.agentId, p]),
      )
      const taskTokens = tokenize(taskDescription)

      const scores: CapabilityScore[] = agents.map((node) => {
        const profile = profileMap.get(node.id)

        if (!profile) {
          const fallbackText = node.agentConfig?.systemPrompt ?? node.name
          return {
            node,
            score:        jaccardScore(taskTokens, tokenize(fallbackText)),
            matchedOn:    'fallback' as const,
            profileFound: false,
          }
        }

        const promptScore = profile.systemPrompt
          ? jaccardScore(taskTokens, tokenize(profile.systemPrompt))
          : 0

        const personaText = typeof profile.persona === 'string'
          ? profile.persona
          : JSON.stringify(profile.persona)
        const personaScore = jaccardScore(taskTokens, tokenize(personaText))

        const kbText = typeof profile.knowledgeBase === 'string'
          ? profile.knowledgeBase
          : JSON.stringify(profile.knowledgeBase)
        const kbScore = jaccardScore(taskTokens, tokenize(kbText))

        const maxScore = Math.max(promptScore, personaScore, kbScore)
        const matchedOn: CapabilityScore['matchedOn'] =
          maxScore === promptScore  ? 'systemPrompt'
          : maxScore === personaScore ? 'persona'
          : 'knowledgeBase'

        return { node, score: maxScore, matchedOn, profileFound: true }
      })

      scores.sort((a, b) => b.score - a.score)
      const best = scores[0]
      const MIN_SCORE = 0.05
      const isFallback = best.score < MIN_SCORE

      return { node: best.node, score: best.score, isFallback, allScores: scores }
    } catch {
      return { node: agents[0], score: 0, isFallback: true, allScores: [] }
    }
  }

  private routeTask(task: HierarchyTask): RouteDecision {
    const node = this.findNode(task.assignedNodeId)

    if (!node) {
      return {
        type: 'local',
        node: { id: task.assignedNodeId, name: task.assignedNodeId, level: task.level },
      }
    }

    const hasChildren = node.children !== undefined && node.children.length > 0
    if (!hasChildren) return { type: 'local', node }

    return { type: 'delegate', node, children: node.children! }
  }

  /**
   * [F2a-03] Materializa una delegación en BD como RunStep { nodeType: 'delegation' }
   * y lanza sub-orquestación sobre los hijos del nodo delegado.
   *
   * F2a-10: emite null→queued DESPUÉS de createStep() en BD.
   */
  private async delegateTask(
    task:        HierarchyTask,
    decision:    Extract<RouteDecision, { type: 'delegate' }>,
    index:       number,
    runId:       string,
    workspaceId: string,
  ): Promise<SubtaskResult> {
    const start = Date.now()

    // 1. Crear RunStep de delegación en BD
    const step = await this.repo.createStep({
      runId,
      nodeId:   decision.node.id,
      nodeType: 'delegation',
      index,
      input:    { task: task.description, ...task.input },
    })

    // 2. F2a-10: Emitir null → queued DESPUÉS del write en BD (D-23d)
    if (this.emitter) {
      try {
        this.emitter.emitStepChanged(
          buildStatusChangeEvent({
            stepId:         step.id,
            runId:          step.runId,
            nodeId:         step.nodeId,
            nodeType:       'delegation',
            agentId:        null,
            workspaceId,
            previousStatus: null,
            currentStatus:  'queued',
            output: null, error: null,
            model:  null, provider: null,
            promptTokens: null, completionTokens: null,
            totalTokens: null, costUsd: null,
          }),
        )
      } catch { /* best-effort — nunca relanzar */ }
    }

    try {
      const subHierarchy: HierarchyNode = {
        ...decision.node,
        children: decision.children,
      }

      const subOrchestrator = new HierarchyOrchestrator(
        subHierarchy,
        this.executorFn,
        this.repo.getPrisma(),
        this.supervisorFn,
        this.opts,
        this.emitter,  // propagar emitter al sub-orquestador
        { parentRunId: runId, parentStepId: step.id },
      )

      const subResult = await subOrchestrator.orchestrate(
        workspaceId,
        task.description,
        task.input,
      )

      await this.repo.completeStep({
        stepId: step.id,
        output: subResult.consolidatedOutput.summary,
      })

      return {
        taskId:     task.id,
        nodeId:     decision.node.id,
        stepId:     step.id,
        status:     subResult.status === 'failed'
                      ? 'failed'
                      : subResult.status === 'partial'
                        ? 'partial'
                        : 'completed',
        output:     subResult.consolidatedOutput.summary,
        error:      subResult.status === 'failed'
                      ? `Sub-orchestration failed: ${subResult.status}`
                      : subResult.status === 'partial'
                        ? 'Sub-orchestration partial: some subtasks failed'
                      : undefined,
        durationMs: Date.now() - start,
        retries:    0,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await this.repo.failStep({ stepId: step.id, error: message })
      return {
        taskId:     task.id,
        nodeId:     decision.node.id,
        stepId:     step.id,
        status:     'failed',
        output:     null,
        error:      message,
        durationMs: Date.now() - start,
        retries:    0,
      }
    }
  }
}
