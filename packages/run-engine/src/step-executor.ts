import type { PrismaClient } from '@prisma/client';
import type { FlowNode } from '../../core-types/src';
import type { RunStep, RunSpec, RunStepTokenUsage } from '../../core-types/src';

export interface StepExecutionResult {
  status: 'completed' | 'failed' | 'skipped';
  output?: Record<string, unknown>;
  error?: string;
  tokenUsage?: RunStepTokenUsage;
  costUsd?: number;
  /** For condition nodes: which branch to take */
  branch?: string;
}

export interface StepExecutorOptions {
  /**
   * PrismaClient opcional.
   * Cuando se provee, executeAgent(), executeTool() y executeCondition()
   * delegan a LlmStepExecutor (cargado con lazy require para evitar
   * dependencias circulares en el grafo de módulos durante la construcción).
   * Sin db, el executor retorna un error descriptivo en lugar de un stub
   * silencioso.
   */
  db?: PrismaClient;
  maxToolRounds?: number;
}

/**
 * Handles execution of individual flow nodes by type.
 *
 * StepExecutor es la clase base extensible del run-engine.
 * LlmStepExecutor la extiende e implementa executeAgent(), executeTool()
 * y executeCondition() con lógica real.
 *
 * Cuando se construye con { db }, este StepExecutor base delega
 * executeAgent(), executeTool() y executeCondition() a una instancia
 * de LlmStepExecutor lazy-construida — así FlowExecutor puede usar
 * StepExecutor directamente sin necesitar saber si hay LLM real disponible.
 *
 * ⚠️  NOTA executeCondition en esta clase base:
 *     La implementación base es un fallback mínimo para cuando NO hay db
 *     (entornos de test / preview). En producción, con db disponible,
 *     delega automáticamente a LlmStepExecutor.executeCondition() que
 *     provee contexto completo (outputs del run, metadata, payload) y
 *     no usa `with()` (incompatible con "use strict").
 */
export class StepExecutor {
  protected readonly db?: PrismaClient;
  protected readonly maxToolRounds: number;

  // Instancia lazy de LlmStepExecutor — se crea una sola vez al primer uso
  private _llmExecutor?: StepExecutor;

  constructor(options: StepExecutorOptions = {}) {
    this.db = options.db;
    this.maxToolRounds = options.maxToolRounds ?? 10;
  }

  /**
   * Execute a single node. Dispatch por tipo.
   */
  async execute(node: FlowNode, step: RunStep, run: RunSpec): Promise<StepExecutionResult> {
    switch (node.type) {
      case 'trigger':
        return this.executeTrigger(node, step, run);
      case 'agent':
        return this.executeAgent(node, step, run);
      case 'tool':
        return this.executeTool(node, step, run);
      case 'condition':
        return this.executeCondition(node, step, run);
      case 'end':
        return this.executeEnd(node, step, run);
      default:
        return this.executeGeneric(node, step, run);
    }
  }

  protected async executeTrigger(
    _node: FlowNode,
    _step: RunStep,
    run: RunSpec,
  ): Promise<StepExecutionResult> {
    return {
      status: 'completed',
      output: { triggerType: run.trigger.type, payload: run.trigger.payload },
    };
  }

  /**
   * executeAgent: delega a LlmStepExecutor si hay db disponible.
   * Sin db retorna error descriptivo (no stub silencioso).
   */
  protected async executeAgent(
    node: FlowNode,
    step: RunStep,
    run: RunSpec,
  ): Promise<StepExecutionResult> {
    const llm = this.getLlmExecutor();
    if (llm) return llm.executeAgent(node, step, run);

    const agentId = (node.config?.agentId as string) ?? 'unknown';
    return {
      status: 'failed',
      error:
        `StepExecutor: no PrismaClient provided — cannot execute agent '${agentId}'. ` +
        'Pass { db } to StepExecutor or use LlmStepExecutor directly.',
    };
  }

  /**
   * executeTool: delega a LlmStepExecutor.executeTool() (SkillInvoker) si hay db.
   * Sin db retorna error descriptivo.
   */
  protected async executeTool(
    node: FlowNode,
    step: RunStep,
    run: RunSpec,
  ): Promise<StepExecutionResult> {
    const llm = this.getLlmExecutor();
    if (llm) return llm.executeTool(node, step, run);

    const skillName =
      (node.config?.skillName as string) ??
      (node.config?.skillId   as string) ??
      'unknown';
    return {
      status: 'failed',
      error:
        `StepExecutor: no PrismaClient provided — cannot invoke skill '${skillName}'. ` +
        'Pass { db } to StepExecutor or use LlmStepExecutor directly.',
    };
  }

  /**
   * executeCondition — fallback mínimo (sin db / entorno de test).
   *
   * ⚠️  BUG CORREGIDO: la versión anterior usaba `with(ctx) { return Boolean(...) }`
   *     dentro de `"use strict"`, lo cual lanza SyntaxError en runtime que quedaba
   *     silenciado por el catch, haciendo que SIEMPRE se tomara la primera rama
   *     (evaluated = true) independientemente de la expresión.
   *
   * Esta versión usa named arguments explícitos en Function constructor,
   *  compatible con strict mode. El contexto expone:
   *   - payload  → run.trigger.payload
   *   - metadata → run.metadata
   *   - status   → run.status
   *
   * En producción (con db disponible), el método delega a
   * LlmStepExecutor.executeCondition() que expone también `outputs`
   * (resultados de pasos anteriores del flow).
   */
  protected async executeCondition(
    node: FlowNode,
    step: RunStep,
    run: RunSpec,
  ): Promise<StepExecutionResult> {
    // Delegar a LlmStepExecutor cuando hay db — contexto más rico
    const llm = this.getLlmExecutor();
    if (llm) return llm.executeCondition(node, step, run);

    // Fallback sin db — contexto mínimo, sin outputs de pasos anteriores
    const expression = (node.config?.expression as string) ?? 'true';
    const branches   = (node.config?.branches   as string[]) ?? ['true', 'false'];

    const payload  = run.trigger?.payload  ?? {};
    const metadata = (run.metadata as Record<string, unknown>) ?? {};
    const status   = run.status ?? 'running';

    let evaluated = false;
    try {
      // Named-arg Function constructor — compatible con "use strict"
      // No usamos `with()` ni `eval()` directo.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function(
        'payload',
        'metadata',
        'status',
        `"use strict"; return Boolean(${expression});`,
      );
      evaluated = fn(payload, metadata, status) as boolean;
    } catch (err) {
      // Expresión sintácticamente inválida → rama 'false' (fallo explícito)
      return {
        status: 'failed',
        error: `Condition expression error: ${String(err)}`,
        output: { expression, evaluated: false, branch: branches[1] ?? 'false' },
        branch: branches[1] ?? 'false',
      };
    }

    const branch = evaluated ? (branches[0] ?? 'true') : (branches[1] ?? 'false');
    return {
      status: 'completed',
      output: { expression, evaluated, branch },
      branch,
    };
  }

  protected async executeEnd(
    _node: FlowNode,
    _step: RunStep,
    _run:  RunSpec,
  ): Promise<StepExecutionResult> {
    return {
      status: 'completed',
      output: { outcome: 'flow_completed' },
    };
  }

  protected async executeGeneric(
    node: FlowNode,
    _step: RunStep,
    _run:  RunSpec,
  ): Promise<StepExecutionResult> {
    return {
      status: 'completed',
      output: { nodeType: node.type, message: `Node type '${node.type}' completed` },
    };
  }

  /**
   * Lazy-construye LlmStepExecutor la primera vez que se necesita.
   * Retorna null si no hay db disponible.
   */
  private getLlmExecutor(): StepExecutor | null {
    if (!this.db) return null;
    if (!this._llmExecutor) {
      // Lazy require para evitar circular dependency en build
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LlmStepExecutor } = require('./llm-step-executor') as {
        LlmStepExecutor: new (opts: { db: PrismaClient; maxToolRounds?: number }) => StepExecutor;
      };
      this._llmExecutor = new LlmStepExecutor({
        db: this.db,
        maxToolRounds: this.maxToolRounds,
      });
    }
    return this._llmExecutor;
  }
}
