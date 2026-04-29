import vm from 'node:vm';
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
   * Cuando se provee, executeAgent() y executeTool()
   * delegan a LlmStepExecutor (cargado con lazy require para evitar
   * dependencias circulares en el grafo de módulos durante la construcción).
   * Sin db, el executor retorna un error descriptivo en lugar de un stub
   * silencioso.
   */
  db?: PrismaClient;
  maxToolRounds?: number;
}

/**
 * Contexto expuesto a la expresión de un condition node.
 * Definido aquí como fuente única de verdad — LlmStepExecutor no duplica.
 */
export interface ConditionContext {
  /** Payload del trigger que inició el Run */
  payload:  Record<string, unknown>;
  /** Metadata del Run */
  metadata: Record<string, unknown>;
  /** Estado actual del Run */
  status:   string;
  /**
   * Mapa nodeId → output de todos los pasos completados anteriores.
   * Uso: outputs['node-2'].approved === true
   */
  outputs:  Record<string, Record<string, unknown>>;
}

/**
 * Handles execution of individual flow nodes by type.
 *
 * StepExecutor es la clase base extensible del run-engine.
 * LlmStepExecutor la extiende e implementa executeAgent() y executeTool()
 * con lógica real de LLM.
 *
 * executeCondition() está implementado completamente en esta clase base
 * usando un sandbox vm aislado — LlmStepExecutor NO lo sobreescribe.
 *
 * Cuando se construye con { db }, este StepExecutor base delega
 * executeAgent() y executeTool() a una instancia de LlmStepExecutor
 * lazy-construida.
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
   * executeCondition — implementación completa en la clase base.
   *
   * Usa un sandbox vm aislado (node:vm) para evaluar la expresión:
   *   - Sin acceso a process, require, globals del proceso Node.js.
   *   - Timeout de 50ms — protección contra bucles infinitos.
   *   - outputs poblado desde run.steps anteriores via buildOutputsMap().
   *
   * LlmStepExecutor NO sobreescribe este método.
   */
  protected async executeCondition(
    node:  FlowNode,
    _step: RunStep,
    run:   RunSpec,
  ): Promise<StepExecutionResult> {
    const expression = (node.config?.expression as string | undefined)?.trim();
    const branches   = (node.config?.branches   as string[] | undefined) ?? [];

    if (!expression) {
      return { status: 'completed', output: { branch: 'default' }, branch: 'default' };
    }

    const ctx: ConditionContext = {
      payload:  (run.trigger?.payload  as Record<string, unknown>) ?? {},
      metadata: (run.metadata          as Record<string, unknown>) ?? {},
      status:   run.status ?? 'running',
      outputs:  this.buildOutputsMap(run),
    };

    return this.evalExpression(expression, ctx, branches);
  }

  /**
   * Construye un mapa nodeId → output de todos los pasos completados
   * hasta este punto en el run.
   *
   * Solo incluye pasos con status 'completed' y output definido.
   * Es la fuente correcta para el contexto `outputs` en condition nodes.
   */
  private buildOutputsMap(
    run: RunSpec,
  ): Record<string, Record<string, unknown>> {
    return Object.fromEntries(
      run.steps
        .filter((s) => s.status === 'completed' && s.output !== undefined)
        .map((s) => [s.nodeId, s.output as Record<string, unknown>]),
    );
  }

  /**
   * Evalúa la expresión en un contexto V8 aislado (vm.Script).
   *
   * Sandbox expone: payload, metadata, status, outputs.
   * El resultado se captura en __result para recuperar el valor booleano.
   *
   * Protección:
   *   - process, require, global → ReferenceError dentro del sandbox.
   *   - Timeout 50ms → bucles infinitos terminan con error descriptivo.
   */
  private evalExpression(
    expression: string,
    ctx:        ConditionContext,
    branches:   string[],
  ): StepExecutionResult {
    try {
      const sandbox: Record<string, unknown> = {
        payload:  ctx.payload,
        metadata: ctx.metadata,
        status:   ctx.status,
        outputs:  ctx.outputs,
        __result: false,
      };
      vm.createContext(sandbox);

      // IIFE con 'use strict' + asignación a __result
      // para recuperar el valor de retorno desde fuera del script.
      const script = new vm.Script(
        `"use strict"; __result = Boolean(${expression});`,
      );
      // timeout 50ms — protege contra while(true){} y expresiones costosas
      script.runInContext(sandbox, { timeout: 50 });

      const result = sandbox['__result'] as boolean;
      const branch = result
        ? (branches[0] ?? 'true')
        : (branches[1] ?? 'false');

      return {
        status: 'completed',
        output: { expression, result, branch },
        branch,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes('Script execution timed out')) {
        return {
          status: 'failed',
          error:  'Condition eval timed out (50ms): expression may contain infinite loop',
        };
      }

      return {
        status: 'failed',
        error:  `Condition eval failed: ${msg}`,
      };
    }
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
   * Usado solo para executeAgent() y executeTool() — executeCondition()
   * está implementado en esta clase base y no delega.
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
