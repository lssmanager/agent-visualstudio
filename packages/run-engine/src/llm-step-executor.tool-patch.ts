/**
 * llm-step-executor.tool-patch.ts
 *
 * ⚠️  Este archivo es un PATCH DE REFERENCIA para llm-step-executor.ts.
 *      Aplica manualmente estos cambios en el archivo real:
 *
 *  1. Importar SkillInvoker en llm-step-executor.ts si no está importado:
 *       import { SkillInvoker } from './skill-invoker';
 *
 *  2. Asegurarse de que la clase tiene acceso a this.skillInvoker (SkillInvoker).
 *
 *  3. Reemplazar el método executeTool() existente por el de abajo.
 *
 *  4. Agregar el método executeInlineWebhook() de abajo.
 *
 *  Este archivo puede eliminarse una vez que los cambios estén en llm-step-executor.ts.
 */

import type { FlowNode } from './flow-executor';
import type { StepExecutionResult } from './llm-step-executor';
import type { SkillInvoker } from './skill-invoker';

// ════════════════════════════════════════════════════════════════════
// CAMBIO 1 — reemplazar executeTool() en LlmStepExecutor
// ════════════════════════════════════════════════════════════════════

/**
 * Paste this inside LlmStepExecutor, replacing the existing executeTool().
 *
 * protected override async executeTool(
 *   node:  FlowNode,
 *   _step: RunStep,
 *   _run:  RunSpec,
 * ): Promise<StepExecutionResult> {
 *   const t0 = Date.now();
 *
 *   // ── Path 1: inline webhookUrl in node.config (no DB required) ────────────
 *   const inlineUrl = node.config?.webhookUrl as string | undefined;
 *   if (inlineUrl) {
 *     return this.executeInlineWebhook(node, t0);
 *   }
 *
 *   // ── Path 2: registered skill in DB (original behavior) ─────────────────
 *   const skillName =
 *     (node.config?.skillName as string) ??
 *     (node.config?.skillId   as string) ??
 *     'unknown';
 *   const args = (node.config?.params as Record<string, unknown>) ?? {};
 *   const res  = await this.skillInvoker.invoke(skillName, args);
 *
 *   if (!res.ok) {
 *     return {
 *       status: 'failed',
 *       error:  res.error ?? `Skill '${skillName}' failed`,
 *       output: { skillName, durationMs: res.durationMs },
 *     };
 *   }
 *
 *   return {
 *     status: 'completed',
 *     output: { skillName, result: res.result, durationMs: res.durationMs },
 *   };
 * }
 */

// ════════════════════════════════════════════════════════════════════
// CAMBIO 2 — agregar executeInlineWebhook() en LlmStepExecutor
// ════════════════════════════════════════════════════════════════════

/**
 * Paste this as a private method inside LlmStepExecutor:
 *
 * private async executeInlineWebhook(
 *   node: FlowNode,
 *   t0:   number,
 * ): Promise<StepExecutionResult> {
 *   const webhookConfig: Record<string, unknown> = {
 *     webhookUrl:   node.config?.webhookUrl,
 *     method:       node.config?.method       ?? 'POST',
 *     authType:     node.config?.authType      ?? 'none',
 *     authHeader:   node.config?.authHeader,
 *     authValue:    node.config?.authValue,
 *     authUser:     node.config?.authUser,
 *     authPassword: node.config?.authPassword,
 *   };
 *   const args = (node.config?.params as Record<string, unknown>) ?? {};
 *
 *   const res = await this.skillInvoker.invokeWebhookDirect(webhookConfig, args);
 *
 *   if (!res.ok) {
 *     return {
 *       status: 'failed',
 *       error:  res.error ?? 'Inline webhook failed',
 *       output: {
 *         webhookUrl: node.config?.webhookUrl,
 *         durationMs: Date.now() - t0,
 *       },
 *     };
 *   }
 *
 *   return {
 *     status: 'completed',
 *     output: {
 *       webhookUrl:  node.config?.webhookUrl,
 *       result:      res.result,
 *       durationMs:  Date.now() - t0,
 *     },
 *   };
 * }
 */

// ════════════════════════════════════════════════════════════════════
// Noop export para que TypeScript no reporte "empty module" warning
// ════════════════════════════════════════════════════════════════════
export {};
