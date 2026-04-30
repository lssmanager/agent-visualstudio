/**
 * StatusChangeEvent — D-23d
 * Contrato de datos para cualquier transición de estado de un RunStep.
 */

/**
 * Nombre del evento emitido por RunStepEventEmitter.
 * Usar como literal en .emit() y .on() para evitar typos.
 */
export const STEP_STATUS_CHANGED = 'step.status.changed' as const

/**
 * Evento emitido en cada transición de estado de un RunStep.
 * Contiene todo lo necesario para que la UI Operations muestre
 * el árbol de estado en tiempo real sin consultas adicionales a BD.
 *
 * Referencia: D-23d — StatusChangeEvent en cada transición RunStep.
 */
export interface StatusChangeEvent {
  // ── Identifiers ────────────────────────────────────────────────
  /** ID del RunStep que cambió de estado */
  stepId:      string
  /** ID del Run al que pertenece */
  runId:       string
  /** ID del nodo en el Flow spec */
  nodeId:      string
  /** Tipo de nodo: 'agent' | 'delegation' | HierarchyLevel */
  nodeType:    string
  /** ID del Agent asignado al step (null si no aplica) */
  agentId:     string | null
  /** ID del Workspace — para routing WebSocket por workspace */
  workspaceId: string

  // ── Transición ─────────────────────────────────────────────────
  /**
   * Status anterior del step.
   * null en la primera transición (creación con status queued).
   */
  previousStatus: string | null
  /** Status nuevo del step (el que acaba de escribirse en BD) */
  currentStatus:  string

  // ── Contexto de ejecución ──────────────────────────────────────
  /** Timestamp de la transición (generado en el emisor, no en BD) */
  timestamp:   Date
  /** Output del step — presente solo cuando currentStatus = 'completed' */
  output:      unknown | null
  /** Mensaje de error — presente solo cuando currentStatus = 'failed' */
  error:       string | null

  // ── Métricas LLM (opcionales — presentes si el step usó LLM) ──
  model:            string | null
  provider:         string | null
  promptTokens:     number | null
  completionTokens: number | null
  totalTokens:      number | null
  costUsd:          number | null
}

/**
 * Helper para construir un StatusChangeEvent desde los datos
 * disponibles en los puntos de emisión.
 * Garantiza que todos los campos opcionales tengan null (no undefined).
 */
export function buildStatusChangeEvent(
  params: Omit<StatusChangeEvent, 'timestamp'> & { timestamp?: Date },
): StatusChangeEvent {
  return {
    ...params,
    timestamp:        params.timestamp         ?? new Date(),
    output:           params.output            ?? null,
    error:            params.error             ?? null,
    model:            params.model             ?? null,
    provider:         params.provider          ?? null,
    promptTokens:     params.promptTokens      ?? null,
    completionTokens: params.completionTokens  ?? null,
    totalTokens:      params.totalTokens       ?? null,
    costUsd:          params.costUsd           ?? null,
  }
}
