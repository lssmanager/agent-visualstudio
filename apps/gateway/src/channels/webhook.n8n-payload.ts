/**
 * webhook.n8n-payload.ts — Tipos de payload para triggers n8n → agentes
 *
 * n8n puede enviar dos shapes según el nodo de origen:
 *   - N8nWebhookNodePayload:   envoltura { body, headers, params, query }
 *   - N8nHttpRequestPayload:   payload plano sin envoltura
 *
 * El WebhookAdapter usa isN8nWebhookNodePayload() para detectar cuál recibió.
 */

// ── Payload del "Webhook" node de n8n ────────────────────────────────────────

export interface N8nTriggerBody {
  /** Tipo de evento del workflow (opcional, informativo) */
  trigger?:      string
  /** UUID del workflow en n8n */
  workflowId?:   string
  /** UUID de la ejecución en n8n */
  executionId?:  string
  /** Nombre legible del workflow */
  workflowName?: string
  /**
   * Datos de negocio enviados al agente como tarea.
   * Si es un objeto, se serializa a JSON como texto del mensaje.
   * Si es string, se usa directamente.
   */
  data?:         Record<string, unknown> | string
  /**
   * Tarea explícita en texto plano (alternativa a `data`).
   * Tiene precedencia sobre `data` cuando ambos están presentes.
   */
  task?:         string
  /** Identificador de sesión/conversación en n8n (opcional) */
  sessionId?:    string
  /** Metadatos de ejecución de n8n (timestamp, nodeId, etc.) */
  metadata?:     Record<string, unknown>
}

/** Payload completo del nodo "Webhook" de n8n (envoltura estándar) */
export interface N8nWebhookNodePayload {
  body:     N8nTriggerBody
  headers?: Record<string, string>
  params?:  Record<string, string>
  query?:   Record<string, string>
}

/**
 * Payload del nodo "HTTP Request" de n8n (sin envoltura).
 * Tiene los mismos campos que N8nTriggerBody pero directamente en la raíz.
 */
export type N8nHttpRequestPayload = N8nTriggerBody

// ── Payload genérico del webhook (forma existente) ───────────────────────────

export interface WebhookInboundPayload {
  externalId?: string
  senderId?:   string
  text?:       string
  message?:    string
  metadata?:   Record<string, unknown>
}

// ── Type guards ───────────────────────────────────────────────────────────────

/**
 * Detecta si el payload viene del nodo "Webhook" de n8n.
 * La envoltura { body, headers } es característica de ese nodo.
 */
export function isN8nWebhookNodePayload(
  payload: unknown,
): payload is N8nWebhookNodePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'body' in payload &&
    typeof (payload as Record<string, unknown>).body === 'object'
  )
}

/**
 * Extrae el cuerpo de negocio normalizado desde cualquier shape de payload n8n.
 * Siempre devuelve N8nTriggerBody (nunca undefined).
 */
export function extractN8nBody(
  payload: N8nWebhookNodePayload | N8nHttpRequestPayload,
): N8nTriggerBody {
  if (isN8nWebhookNodePayload(payload)) {
    return payload.body
  }
  return payload as N8nTriggerBody
}

/**
 * Convierte el body de n8n en texto de tarea para el agente.
 * Precedencia: body.task > body.data (string) > JSON.stringify(body.data) > workflowName > vacío
 */
export function n8nBodyToTaskText(body: N8nTriggerBody): string {
  if (body.task && typeof body.task === 'string') {
    return body.task
  }
  if (body.data !== undefined) {
    if (typeof body.data === 'string') return body.data
    return JSON.stringify(body.data)
  }
  if (body.workflowName) {
    return `Workflow trigger: ${body.workflowName}`
  }
  return ''
}

/**
 * Construye el externalId para la sesión a partir del payload n8n.
 * Precedencia: body.sessionId > body.executionId > body.workflowId > fallback
 */
export function n8nBodyToExternalId(
  body: N8nTriggerBody,
  fallback: string,
): string {
  return body.sessionId ?? body.executionId ?? body.workflowId ?? fallback
}
