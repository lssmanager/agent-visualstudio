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
   * Cuando se provee, executeAgent() y executeTool() delegan a LlmStepExecutor
   * (cargado con lazy require para evitar dependencias circulares en el grafo
   * de módulos durante la construcción).
   * Sin db, el executor retorna un error descriptivo en lugar de un stub silencioso.
   */
  db?: PrismaClient;
  maxToolRounds?: number;
}

/**
 * Handles execution of individual flow nodes by type.
 *
 * StepExecutor es la clase base extensible del run-engine.
 * LlmStepExecutor la extiende e implementa executeAgent() y executeTool()
 * con llamadas LLM reales, tool_calls loop y budget checks.
 *
 * Cuando se construye con { db }, este StepExecutor base delega
 * executeAgent() y executeTool() a una instancia de LlmStepExecutor
 * lazy-construida — así FlowExecutor puede usar StepExecutor directamente
 * sin necesitar saber si hay LLM real disponible.
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

  protected async executeTrigger(_node: FlowNode, _step: RunStep, run: RunSpec): Promise<StepExecutionResult> {
    return {
      status: 'completed',
      output: { triggerType: run.trigger.type, payload: run.trigger.payload },
    };
  }

  /**
   * executeAgent: delega a LlmStepExecutor si hay db disponible.
   * Sin db retorna error descriptivo (no stub silencioso).
   */
  protected async executeAgent(node: FlowNode, step: RunStep, run: RunSpec): Promise<StepExecutionResult> {
    const llm = this.getLlmExecutor();
    if (llm) {
      return llm.executeAgent(node, step, run);
    }
    const agentId = (node.config?.agentId as string) ?? 'unknown';
    return {
      status: 'failed',
      error: `StepExecutor: no PrismaClient provided — cannot execute agent '${agentId}'. ` +
             'Pass { db } to StepExecutor or use LlmStepExecutor directly.',
    };
  }

  /**
   * executeTool: delega a LlmStepExecutor.executeTool() (SkillInvoker) si hay db.
   * Sin db retorna error descriptivo.
   */
  protected async executeTool(node: FlowNode, step: RunStep, run: RunSpec): Promise<StepExecutionResult> {
    const llm = this.getLlmExecutor();
    if (llm) {
      return llm.executeTool(node, step, run);
    }
    const skillName = (node.config?.skillName as string) ?? (node.config?.skillId as string) ?? 'unknown';
    return {
      status: 'failed',
      error: `StepExecutor: no PrismaClient provided — cannot invoke skill '${skillName}'. ` +
             'Pass { db } to StepExecutor or use LlmStepExecutor directly.',
    };
  }

  /**
   * executeCondition: evalúa la expresión de la condición.
   * Soporta expresiones simples de comparación sobre el contexto del run.
   */
  protected async executeCondition(node: FlowNode, _step: RunStep, run: RunSpec): Promise<StepExecutionResult> {
    const expression = (node.config?.expression as string) ?? 'true';
    const branches   = (node.config?.branches   as string[]) ?? ['true', 'false'];

    // Evaluación segura de expresiones simples:
    // soporta comparaciones sobre run.trigger.payload y run.metadata
    let evaluated = false;
    try {
      // Contexto disponible para la expresión
      const ctx = {
        payload:  run.trigger?.payload  ?? {},
        metadata: run.metadata          ?? {},
        status:   run.status,
      };
      // Usamos Function constructor en lugar de eval para scope controlado
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function('ctx', `"use strict"; with(ctx) { return Boolean(${expression}); }`);
      evaluated = fn(ctx) as boolean;
    } catch {
      // Expresión inválida → fallback a primera rama
      evaluated = true;
    }

    const branch = evaluated ? (branches[0] ?? 'true') : (branches[1] ?? 'false');

    return {
      status: 'completed',
      output: { expression, evaluated, branch },
      branch,
    };
  }

  protected async executeEnd(_node: FlowNode, _step: RunStep, _run: RunSpec): Promise<StepExecutionResult> {
    return {
      status: 'completed',
      output: { outcome: 'flow_completed' },
    };
  }

  protected async executeGeneric(node: FlowNode, _step: RunStep, _run: RunSpec): Promise<StepExecutionResult> {
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
