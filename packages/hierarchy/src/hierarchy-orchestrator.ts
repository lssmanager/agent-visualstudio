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
import { RunRepository } from '../../run-engine/src/run-repository.js'

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
  status:    'completed' | 'failed' | 'skipped' | 'rejected'
  output:    unknown
  error?:    string
  durationMs: number
  retries:   number
}

export interface OrchestrationResult {
  runId:             string  // ID del Run en Prisma
  rootTaskId:        string
  status:            'completed' | 'partial' | 'failed'
  consolidatedOutput: string
  subtaskResults:    SubtaskResult[]
  totalDurationMs:   number
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

const DEFAULT_OPTIONS: Required<OrchestratorOptions> = {
  maxRetries:        2,
  retryBaseMs:       500,
  subtaskTimeoutMs:  120_000,  // 2 min
  approvalTimeoutMs: 900_000,  // 15 min
  parallel:          true,
}

// ── [F2a-04] Funciones puras de tokenización y scoring ───────────────────────────────────────────
// Ubicadas a nivel módulo (fuera de la clase) para ser testeables sin instanciar HierarchyOrchestrator.

/**
 * Tokeniza texto en un Set de palabras lowercase sin stopwords.
 * Mínimo 3 caracteres por token para evitar ruido.
 */
export function tokenize(text: string): Set<string> {
  const STOPWORDS = new Set([
    'the','a','an','and','or','but','in','on','at','to',
    'for','of','with','by','from','as','is','are','was',
    'be','been','have','has','had','do','does','did',
    'will','would','could','should','may','might','must',
    'this','that','these','those','it','its','you','your',
    'we','our','they','their','he','she','his','her',
    'el','la','los','las','un','una','de','en','con','por',
    'para','que','es','son','tiene','este','esta',
  ])
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-záéíóúüñ\w\s]/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  )
}

/**
 * Jaccard simplificado: |A ∩ B| / |A ∪ B|
 * Retorna 0 si ambos sets están vacíos.
 */
export function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  const intersection = [...a].filter((t) => b.has(t)).length
  const union = new Set([...a, ...b]).size
  return intersection / union
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
  ) {
    this.hierarchy    = hierarchy
    this.executorFn   = executorFn
    this.supervisorFn = supervisorFn
    this.repo         = new RunRepository(prisma)
    this.opts         = { ...DEFAULT_OPTIONS, ...opts }
  }

  // ── API pública ──────────────────────────────────────────────────────────────────

  /**
   * Punto de entrada principal.
   *
   * 1. Crea un Run en Prisma
   * 2. Descompone el task vía supervisor LLM (o capability-match fallback)
   * 3. Ejecuta subtareas (paralelo o secuencial) con checkpointing por RunStep
   * 4. Consolida el resultado vía supervisor LLM
   * 5. Marca el Run como completed/partial/failed
   *
   * @param workspaceId ID del workspace (requerido para Run + Approval)
   * @param rootTask    Descripción del task principal
   * @param input       Payload de entrada (opcional)
   */
  async orchestrate(
    workspaceId: string,
    rootTask: string,
    input?: Record<string, unknown>,
  ): Promise<OrchestrationResult> {
    const startTime = Date.now()

    // ── 1. Crear Run ────────────────────────────────────────────────────────────
    const run = await this.repo.createRun({
      workspaceId,
      agentId:   this.hierarchy.level === 'agent' ? this.hierarchy.id : undefined,
      inputData: { task: rootTask, ...input },
      metadata:  { hierarchyRoot: this.hierarchy.id, hierarchyLevel: this.hierarchy.level },
    })
    await this.repo.startRun(run.id)

    try {
      // ── 2. Descomponer task ──────────────────────────────────────────────
      const subtasks = await this.decomposeTasks(rootTask, input)

      // ── 3. Ejecutar subtareas ─────────────────────────────────────────────
      const subtaskResults = this.opts.parallel
        ? await this.executeParallel(subtasks, run.id, workspaceId)
        : await this.executeSequential(subtasks, run.id, workspaceId)

      // ── 4. Consolidar ────────────────────────────────────────────────────
      const consolidatedOutput = await this.consolidateResults(rootTask, subtaskResults)

      // ── 5. Estado final del Run ──────────────────────────────────────────────
      const failed  = subtaskResults.filter((r) => r.status === 'failed' || r.status === 'rejected')
      const success = subtaskResults.filter((r) => r.status === 'completed')
      const runStatus: OrchestrationResult['status'] =
        failed.length === 0                         ? 'completed'
        : success.length === 0                      ? 'failed'
        : 'partial'

      if (runStatus === 'failed') {
        await this.repo.failRun(run.id, `${failed.length} subtask(s) failed`)
      } else {
        await this.repo.completeRun(run.id, { consolidatedOutput, subtaskResults })
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

  /**
   * Consulta el estado actual de un RunStep desde BD.
   * READ-ONLY — no modifica ningún registro.
   *
   * @param stepId  ID del RunStep (disponible en SubtaskResult.stepId)
   * @returns       StepStatusResult con snapshot completo, o null si no existe
   */
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
      // completedAt en schema.prisma → finishedAt en StepStatusResult
      finishedAt:       step.completedAt      ?? null,
      createdAt:        step.createdAt,
    }
  }

  // ── Descomposición de tareas ─────────────────────────────────────────────────────────

  /**
   * Descompone el task en subtareas asignadas a agentes hoja.
   *
   * Estrategia:
   *   1. Si hay supervisorFn: llama al LLM con un prompt estructurado y parsea JSON.
   *   2. Si el LLM falla o no hay supervisorFn: fallback a capability matching [F2a-04].
   *      El agente con mayor afinidad semántica recibe el task completo.
   */
  private async decomposeTasks(
    rootTask: string,
    input?: Record<string, unknown>,
  ): Promise<HierarchyTask[]> {
    const agents = this.collectAgentNodes(this.hierarchy)

    // Modo single-agent
    if (agents.length === 0) {
      return [{
        id:             `subtask-${this.hierarchy.id}`,
        description:    rootTask,
        assignedNodeId: this.hierarchy.id,
        level:          this.hierarchy.level,
        input,
      }]
    }

    // Intentar descomposición vía supervisor LLM
    if (this.supervisorFn) {
      try {
        return await this.decomposeWithSupervisor(rootTask, agents, input)
      } catch {
        // fallback silencioso a capability matching
      }
    }

    // [F2a-04] Fallback: asignar al especialista con mayor afinidad semántica
    // Reemplaza el round-robin ciego anterior — si necesitas fan-out explícito,
    // pásalo como opción al caller.
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
   * Descomposición vía supervisor LLM.
   *
   * Formato objetivo (target output):
   *   ---DELEGATE---
   *   agentId: <id>
   *   task: <description>
   *   ---END---
   *
   * El formato ---DELEGATE---/---END--- es el formato canónico previsto.
   * La integración con parseDelegateBlocks() está pendiente; en cuanto esté
   * disponible, el bloque de parseo JSON que sigue debe ser eliminado.
   *
   * TODO: reemplazar el parser JSON por parseDelegateBlocks() una vez que
   *   dicha función esté integrada — ver símbolo `parseDelegateBlocks`.
   *
   * Parser actual (JSON):
   *   El prompt actual solicita un JSON array con objetos
   *   { agentId: string, task: string }. El parser JSON permanece en uso
   *   hasta que parseDelegateBlocks() quede disponible.
   *
   * Parseo robusto: extrae el primer bloque JSON del texto aunque haya prose.
   */
  private async decomposeWithSupervisor(
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
      'Respond ONLY with a valid JSON array. No prose, no markdown fences.',
      'Format: [{ "agentId": "<id>", "task": "<description>" }, ...]',
      '',
      `Task: ${rootTask}`,
      input ? `Context: ${JSON.stringify(input)}` : '',
      '',
      'Available agents:',
      agentList,
    ].join('\n')

    const raw = await this.supervisorFn!(prompt)

    // Extraer el primer bloque JSON del texto
    const jsonMatch = raw.match(/\[\s*\{[\s\S]*?\}\s*\]/)
    if (!jsonMatch) throw new Error('Supervisor did not return a valid JSON array')

    const parsed = JSON.parse(jsonMatch[0]) as Array<{ agentId: string; task: string }>
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Supervisor returned empty task list')
    }

    // Filtrar asignaciones a agentes válidos
    const agentIds = new Set(agents.map((a) => a.id))
    return parsed
      .filter((p) => agentIds.has(p.agentId))
      .map((p, idx) => {
        const agent = agents.find((a) => a.id === p.agentId)!
        return {
          id:             `subtask-${p.agentId}-${idx}`,
          description:    p.task,
          assignedNodeId: p.agentId,
          level:          agent.level,
          input,
        }
      })
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

  /**
   * Ejecuta un subtask con:
   *   - Checkpoint RunStep al inicio y fin
   *   - HITL: pausa si requiresApproval y espera Approval en DB
   *   - Retry con backoff exponencial
   *   - Timeout por subtask
   */
  private async executeWithRetry(
    task:        HierarchyTask,
    index:       number,
    runId:       string,
    workspaceId: string,
  ): Promise<SubtaskResult> {
    const start = Date.now()
    const node  = this.findNode(task.assignedNodeId)

    // ── Checkpoint: crear RunStep ────────────────────────────────────────
    const step = await this.repo.createStep({
      runId,
      nodeId:   task.assignedNodeId,
      nodeType: node?.level ?? 'agent',
      index,
      input:    { task: task.description, ...task.input },
    })

    // ── HITL: pausar si requiresApproval ──────────────────────────────
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
      await this.repo.startRun(runId)  // retomar estado running

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

    // ── Ejecución con retry ───────────────────────────────────────────────
    const systemPrompt = node?.agentConfig?.systemPrompt
      ?? `You are ${node?.name ?? task.assignedNodeId}. Complete your assigned task.`
    const skills = node?.agentConfig?.skills

    let lastError = ''
    for (let attempt = 0; attempt <= this.opts.maxRetries; attempt++) {
      if (attempt > 0) {
        // Backoff exponencial
        const waitMs = this.opts.retryBaseMs * Math.pow(2, attempt - 1)
        await new Promise((r) => setTimeout(r, waitMs))
      }

      try {
        const execResult = await this.withTimeout(
          this.executorFn(task.assignedNodeId, systemPrompt, task.description, skills),
          this.opts.subtaskTimeoutMs,
          `Subtask ${task.id} timed out after ${this.opts.subtaskTimeoutMs}ms`,
        )

        // ── Checkpoint: step completado con todos los metadatos LLM ─────
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

    // Todos los reintentos fallaron
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
  ): Promise<string> {
    const completed = results.filter((r) => r.status === 'completed')
    if (completed.length === 0) {
      return 'All subtasks failed. No output available.'
    }

    if (this.supervisorFn) {
      try {
        return await this.consolidateWithSupervisor(rootTask, completed)
      } catch {
        // fallback a concatenación
      }
    }

    return [
      `Consolidated output for: "${rootTask}"`,
      `(${completed.length}/${results.length} subtasks succeeded)`,
      '',
      ...completed.map((r, i) =>
        `[${i + 1}] Agent ${r.nodeId}:\n${String(r.output)}`
      ),
    ].join('\n\n')
  }

  private async consolidateWithSupervisor(
    rootTask:  string,
    completed: SubtaskResult[],
  ): Promise<string> {
    const resultsSummary = completed
      .map((r, i) => `Result ${i + 1} (agent ${r.nodeId}):\n${String(r.output)}`)
      .join('\n\n')

    const prompt = [
      `You are a supervisor synthesizing results from multiple agents.`,
      `Original task: ${rootTask}`,
      ``,
      `Agent results:`,
      resultsSummary,
      ``,
      `Provide a single, coherent, complete answer that synthesizes all results above.`,
      `Do not mention agents or results — just provide the final answer directly.`,
    ].join('\n')

    return this.supervisorFn!(prompt)
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

  /** Búsqueda BFS de un nodo por ID. */
  private findNode(id: string): HierarchyNode | undefined {
    const queue: HierarchyNode[] = [this.hierarchy]
    while (queue.length > 0) {
      const node = queue.shift()!
      if (node.id === id) return node
      if (node.children) queue.push(...node.children)
    }
    return undefined
  }

  /**
   * [F2a-04] Encuentra el agente hoja con mayor afinidad semántica
   * para el task dado, usando score léxico sobre AgentProfile en BD.
   *
   * Algoritmo:
   *   1. Colecta todos los nodos hoja (agent/subagent)
   *   2. Carga sus AgentProfiles desde BD en una sola query
   *   3. Calcula score Jaccard(taskTokens, profileTokens)
   *      para systemPrompt, persona y knowledgeBase (toma el máximo)
   *   4. Devuelve el agente de mayor score
   *   5. Si todos los scores < MIN_SCORE → isFallback: true
   *
   * Restricciones:
   *   - NO usa embeddings ni llamadas LLM
   *   - NO lanza excepciones: siempre retorna un SpecialistMatch válido
   *   - Una sola query BD para todos los agentes
   *
   * @param taskDescription  Texto libre del task a asignar
   * @param candidates       Nodos hoja candidatos (si omitido, usa todos)
   */
  private async findSpecialistWithCapability(
    taskDescription: string,
    candidates?:     HierarchyNode[],
  ): Promise<SpecialistMatch> {
    const agents = candidates ?? this.collectAgentNodes(this.hierarchy)

    // Fallback inmediato si no hay agentes
    if (agents.length === 0) {
      return {
        node:       this.hierarchy,
        score:      0,
        isFallback: true,
        allScores:  [],
      }
    }

    try {
      // 1. Cargar profiles desde BD (única query)
      const profiles = await this.repo.findAgentProfiles(
        agents.map((a) => a.id),
      )
      const profileMap = new Map(profiles.map((p) => [p.agentId, p]))

      // 2. Tokenizar el task una sola vez
      const taskTokens = tokenize(taskDescription)

      // 3. Calcular score por agente
      const scores: CapabilityScore[] = agents.map((node) => {
        const profile = profileMap.get(node.id)

        if (!profile) {
          // Sin profile en BD: usar agentConfig.systemPrompt del árbol como texto de fallback
          const fallbackText = node.agentConfig?.systemPrompt ?? node.name
          return {
            node,
            score:        jaccardScore(taskTokens, tokenize(fallbackText)),
            matchedOn:    'fallback' as const,
            profileFound: false,
          }
        }

        // Score sobre systemPrompt
        const promptScore = profile.systemPrompt
          ? jaccardScore(taskTokens, tokenize(profile.systemPrompt))
          : 0

        // Score sobre persona (serializar JSON a texto plano)
        const personaText = typeof profile.persona === 'string'
          ? profile.persona
          : JSON.stringify(profile.persona)
        const personaScore = jaccardScore(taskTokens, tokenize(personaText))

        // Score sobre knowledgeBase (array de { topic, content })
        const kbText = typeof profile.knowledgeBase === 'string'
          ? profile.knowledgeBase
          : JSON.stringify(profile.knowledgeBase)
        const kbScore = jaccardScore(taskTokens, tokenize(kbText))

        // Tomar el máximo de los tres campos
        const maxScore = Math.max(promptScore, personaScore, kbScore)
        const matchedOn: CapabilityScore['matchedOn'] =
          maxScore === promptScore  ? 'systemPrompt'
          : maxScore === personaScore ? 'persona'
          : 'knowledgeBase'

        return {
          node,
          score:        maxScore,
          matchedOn,
          profileFound: true,
        }
      })

      // 4. Ordenar por score descendente
      scores.sort((a, b) => b.score - a.score)
      const best = scores[0]

      // 5. Threshold mínimo: si todos son 0, es fallback
      const MIN_SCORE = 0.05
      const isFallback = best.score < MIN_SCORE

      return {
        node:       best.node,
        score:      best.score,
        isFallback,
        allScores:  scores,
      }
    } catch {
      // Nunca lanzar: en caso de error de BD, devolver el primer agente disponible
      return {
        node:       agents[0],
        score:      0,
        isFallback: true,
        allScores:  [],
      }
    }
  }

  /**
   * [F2a-03] Decide si una tarea se ejecuta localmente (specialist)
   * o debe delegarse al nivel inferior.
   *
   * Reglas:
   *   - Nodo hoja (sin children o children vacío) con agentConfig
   *     → local: el agente ejecuta directamente
   *   - Nodo hoja SIN agentConfig (configuración incompleta)
   *     → local con nodo sintético — se ejecuta con systemPrompt genérico
   *   - Nodo no encontrado
   *     → local con nodo sintético derivado del task
   *   - Nodo intermedio (tiene children)
   *     → delegate: crear RunStep de delegación y sub-orquestar
   *
   * NUNCA retorna 'delegate' si los hijos también son intermedios sin agentes;
   * la recursión ocurre porque delegateTask() llama subOrchestrator.orchestrate()
   * que a su vez llama routeTask() de nuevo en el nivel inferior.
   */
  private routeTask(task: HierarchyTask): RouteDecision {
    const node = this.findNode(task.assignedNodeId)

    // Nodo no encontrado → nodo sintético, ejecutar local
    if (!node) {
      return {
        type: 'local',
        node: {
          id:    task.assignedNodeId,
          name:  task.assignedNodeId,
          level: task.level,
        },
      }
    }

    const hasChildren = node.children !== undefined && node.children.length > 0

    // Nodo hoja → specialist local
    if (!hasChildren) {
      return { type: 'local', node }
    }

    // Nodo intermedio → delegar al nivel inferior
    // Los children son los nodos directos — no bajar más aquí;
    // la recursión ocurre en el siguiente ciclo de orchestrate()
    return {
      type:     'delegate',
      node,
      children: node.children!,
    }
  }

  /**
   * [F2a-03] Materializa una delegación en BD como RunStep { nodeType: 'delegation' }
   * y lanza sub-orquestación sobre los hijos del nodo delegado.
   *
   * Contrato del Plan Maestro:
   *   "Delegar = crear RunStep con nodeType: 'delegation' en BD.
   *    Nunca texto, nunca log."
   *
   * El RunStep de delegación actúa como envelope del sub-resultado.
   * Su output se llena cuando la sub-orquestación termina.
   */
  private async delegateTask(
    task:        HierarchyTask,
    decision:    Extract<RouteDecision, { type: 'delegate' }>,
    index:       number,
    runId:       string,
    workspaceId: string,
  ): Promise<SubtaskResult> {
    const start = Date.now()

    // 1. Crear RunStep de delegación
    const step = await this.repo.createStep({
      runId,
      nodeId:   decision.node.id,
      nodeType: 'delegation',
      index,
      input:    { task: task.description, ...task.input },
    })

    try {
      // 2. Construir sub-jerarquía con los hijos del nodo delegado
      const subHierarchy: HierarchyNode = {
        ...decision.node,
        children: decision.children,
      }

      // 3. Crear sub-orquestador con la misma config pero jerarquía recortada
      const subOrchestrator = new HierarchyOrchestrator(
        subHierarchy,
        this.executorFn,
        this.repo.getPrisma(),
        this.supervisorFn,
        this.opts,
      )

      // 4. Orquestar en el sub-nivel
      const subResult = await subOrchestrator.orchestrate(
        workspaceId,
        task.description,
        task.input,
      )

      // 5. Completar el RunStep de delegación con el output consolidado
      await this.repo.completeStep({
        stepId: step.id,
        output: subResult.consolidatedOutput,
      })

      return {
        taskId:     task.id,
        nodeId:     decision.node.id,
        stepId:     step.id,
        status:     subResult.status === 'failed' ? 'failed' : 'completed',
        output:     subResult.consolidatedOutput,
        error:      subResult.status === 'failed'
                      ? `Sub-orchestration failed: ${subResult.status}`
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
