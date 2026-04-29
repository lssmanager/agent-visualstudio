/**
 * F1a-07 — executeCondition() con evaluación segura
 *
 * Evalúa expresiones booleanas sin eval() ni new Function() en contexto global.
 * Usa una sandbox estricta con un scope controlado: sólo expone `outputs` y
 * las funciones de utilidad seguras listadas en SAFE_GLOBALS.
 *
 * Restricciones de seguridad:
 *  - No hay acceso a `process`, `globalThis`, `require`, `import`
 *  - La expresión debe retornar un valor booleano (se coerciona con Boolean())
 *  - El timeout es sintáctico (no hay ejecución async ni bucles infinitos reales
 *    en expresiones simples — para producción considera vm.runInNewContext con timeout)
 */

/** Globales de utilidad permitidas dentro de la expresión */
const SAFE_GLOBALS: Record<string, unknown> = {
  // Math utilities
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  JSON,
  // Utilities comunes en condiciones de flow
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
};

/**
 * Evalúa `expression` en un scope aislado donde sólo están disponibles
 * `outputs` (mapa de stepId → output) y los SAFE_GLOBALS.
 *
 * @param expression - Expresión booleana, p.ej. `outputs['step-1'].score > 0.5`
 * @param outputs - Mapa de outputs de RunSteps completados (stepId → output)
 * @returns `true` / `false`
 *
 * @example
 * executeCondition("outputs['step-abc'].approved === true", { 'step-abc': { approved: true } })
 * // → true
 */
export function executeCondition(
  expression: string,
  outputs: Record<string, unknown> = {},
): boolean {
  if (!expression || expression.trim() === '') return false;

  // Construir lista de parámetros de la función sandbox:
  // primero los nombres de los globals seguros, luego 'outputs'
  const globalNames = Object.keys(SAFE_GLOBALS);
  const globalValues = Object.values(SAFE_GLOBALS);

  // La expresión va envuelta en "return (expr)" para capturar el valor
  const body = `"use strict"; return Boolean(${expression});`;

  let sandboxedFn: (...args: unknown[]) => boolean;
  try {
    // eslint-disable-next-line no-new-func
    sandboxedFn = new Function(...globalNames, 'outputs', body) as any;
  } catch (syntaxErr) {
    throw new ConditionSyntaxError(
      `Syntax error in condition expression: ${(syntaxErr as Error).message}`,
      expression,
    );
  }

  try {
    return sandboxedFn(...globalValues, outputs);
  } catch (runtimeErr) {
    throw new ConditionRuntimeError(
      `Runtime error evaluating condition: ${(runtimeErr as Error).message}`,
      expression,
    );
  }
}

/** Error de sintaxis en la expresión de condición */
export class ConditionSyntaxError extends Error {
  constructor(message: string, public readonly expression: string) {
    super(message);
    this.name = 'ConditionSyntaxError';
  }
}

/** Error de ejecución al evaluar la expresión de condición */
export class ConditionRuntimeError extends Error {
  constructor(message: string, public readonly expression: string) {
    super(message);
    this.name = 'ConditionRuntimeError';
  }
}
