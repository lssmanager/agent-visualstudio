/**
 * teams-webhook.adapter.ts — [F3a-33]
 *
 * Sender de notificaciones a Microsoft Teams via Incoming Webhook.
 *
 * PROPÓSITO: Envío de notificaciones de sistema unidireccionales.
 *   - Alertas de CI/CD, estado de agentes, cambios de status
 *   - Resúmenes de ejecución de workflows
 *   - Notificaciones de error del sistema
 *
 * NO usa Azure AD, appId, ni Bot Framework.
 * Solo necesita la webhookUrl del conector "Incoming Webhook" de Teams.
 *
 * DIFERENCIA con TeamsAdapter (F3a-32):
 *   TeamsAdapter        → bidireccional, recibe y envía, requiere Azure AD
 *   TeamsWebhookAdapter → solo envío, notificaciones, sin autenticación Azure
 *
 * CÓMO OBTENER LA WEBHOOKURL:
 *   Teams → Canal → (...) → Conectores → Incoming Webhook → Configurar
 *   La URL tiene formato:
 *   https://{tenant}.webhook.office.com/webhookb2/{id}/IncomingWebhook/{hash}
 *
 * LÍMITES DE LA API:
 *   - Rate limit: ~4 mensajes/segundo por conector
 *   - Tamaño máximo payload: 28 KB
 *   - Teams trunca texto > 28.000 caracteres
 *
 * EXPORTS:
 *   - TeamsWebhookAdapter (clase principal)
 *   - TeamsNotification   (tipo de notificación de conveniencia)
 *   - sendTeamsNotification (función helper stateless)
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

/** Attachment de Adaptive Card (compatible con F3a-31 si ya existe) */
interface TeamsWebhookAttachment {
  contentType: string
  content:     unknown
}

/** Configuración del adapter */
export interface TeamsWebhookConfig {
  /** URL del Incoming Webhook de Teams (requerida) */
  webhookUrl:    string
  /** Timeout de fetch en ms (default: 10_000) */
  timeoutMs?:    number
  /** Número máximo de reintentos ante error 429/503 (default: 2) */
  maxRetries?:   number
  /** Delay base entre reintentos en ms (default: 1_000) */
  retryDelayMs?: number
}

/** Resultado del envío */
export interface TeamsWebhookSendResult {
  ok:            boolean
  statusCode?:   number
  error?:        string
  retriedCount?: number
}

/**
 * Notificación de alto nivel — abstracción sobre los payloads de Teams.
 * El adapter convierte esto a Adaptive Cards internamente.
 */
export interface TeamsNotification {
  /** Título de la notificación (bold, en la parte superior) */
  title?:      string
  /**
   * Cuerpo del mensaje. Soporta Markdown de Teams:
   * **negrita**, *cursiva*, `código`, [link](url), listas con -
   */
  body:        string
  /** Color del acento lateral de la card (hex sin #, default: '0078D4' = Teams blue) */
  themeColor?: string
  /** Campos clave-valor adicionales debajo del body */
  facts?:      Array<{ name: string; value: string }>
  /** Botones de acción (abren URL en el navegador) */
  actions?:    Array<{ label: string; url: string }>
  /** Nivel de severidad — determina el emoji y color por defecto */
  severity?:   'info' | 'success' | 'warning' | 'error'
}

// ── Constantes ────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  info:    { emoji: 'ℹ️',  themeColor: '0078D4' },
  success: { emoji: '✅',  themeColor: '107C10' },
  warning: { emoji: '⚠️', themeColor: 'FF8C00' },
  error:   { emoji: '🔴', themeColor: 'D13438' },
} as const

const ADAPTIVE_CARD_SCHEMA  = 'http://adaptivecards.io/schemas/adaptive-card.json'
const ADAPTIVE_CARD_VERSION = '1.5'
const MAX_TEXT_LENGTH       = 28_000

// ── TeamsWebhookAdapter ───────────────────────────────────────────────────────

export class TeamsWebhookAdapter {
  private readonly webhookUrl:   string
  private readonly timeoutMs:    number
  private readonly maxRetries:   number
  private readonly retryDelayMs: number

  constructor(config: TeamsWebhookConfig) {
    if (!config.webhookUrl?.startsWith('https://')) {
      throw new Error(
        '[TeamsWebhookAdapter] webhookUrl debe ser una URL HTTPS válida. ' +
        'Obtenla en Teams → Canal → Conectores → Incoming Webhook → Configurar.',
      )
    }

    this.webhookUrl   = config.webhookUrl
    this.timeoutMs    = config.timeoutMs    ?? 10_000
    this.maxRetries   = config.maxRetries   ?? 2
    this.retryDelayMs = config.retryDelayMs ?? 1_000
  }

  // ── API pública ─────────────────────────────────────────────────────────────

  /**
   * Envía una notificación de alto nivel a Teams.
   * Convierte TeamsNotification → Adaptive Card automáticamente.
   *
   * @example
   * await adapter.notify({
   *   title:    'Agente completado',
   *   body:     'El agente **SupportBot** procesó 42 mensajes',
   *   severity: 'success',
   *   facts:    [{ name: 'Duración', value: '2m 14s' }],
   * })
   */
  async notify(notification: TeamsNotification): Promise<TeamsWebhookSendResult> {
    const attachment = this._notificationToAdaptiveCard(notification)
    return this._sendAttachments([attachment])
  }

  /**
   * Envía texto plano (con soporte Markdown de Teams).
   * Método más simple para notificaciones rápidas.
   *
   * @example
   * await adapter.sendText('⚠️ El workflow **daily-report** falló en el paso 3')
   */
  async sendText(text: string): Promise<TeamsWebhookSendResult> {
    const truncated = text.length > MAX_TEXT_LENGTH
      ? text.slice(0, MAX_TEXT_LENGTH) + '\n\n_[truncado]_'
      : text

    const attachment = buildSimpleTextCard(truncated)
    return this._sendAttachments([attachment])
  }

  /**
   * Envía una o varias Adaptive Cards directamente.
   * Para casos avanzados donde necesitas control total del schema.
   */
  async sendCards(attachments: TeamsWebhookAttachment[]): Promise<TeamsWebhookSendResult> {
    return this._sendAttachments(attachments)
  }

  /**
   * Verifica conectividad enviando un mensaje de prueba.
   * Útil para validar la webhookUrl al inicializar el sistema.
   */
  async verify(): Promise<TeamsWebhookSendResult> {
    return this.sendText('🔗 Conexión verificada — Teams Incoming Webhook activo.')
  }

  // ── Core de envío con retry ───────────────────────────────────────────────

  private async _sendAttachments(
    attachments: TeamsWebhookAttachment[],
  ): Promise<TeamsWebhookSendResult> {
    const body = JSON.stringify({
      type: 'message',
      attachments,
    })

    let lastError   = ''
    let retriedCount = 0

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        retriedCount++
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200
        await sleep(delay)
      }

      try {
        const res = await fetch(this.webhookUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal:  AbortSignal.timeout(this.timeoutMs),
        })

        // Teams Incoming Webhook devuelve body "1" en éxito (200 OK)
        if (res.ok) {
          return { ok: true, statusCode: res.status, retriedCount }
        }

        // 429 Too Many Requests o 503 Service Unavailable → reintentar
        if ((res.status === 429 || res.status === 503) && attempt < this.maxRetries) {
          const retryAfter = res.headers.get('Retry-After')
          if (retryAfter) {
            await sleep(parseInt(retryAfter, 10) * 1_000)
          }
          lastError = `HTTP ${res.status} (retrying...)`
          continue
        }

        const text = await res.text().catch(() => '')
        return {
          ok:          false,
          statusCode:  res.status,
          error:       `HTTP ${res.status}: ${text}`,
          retriedCount,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        lastError = msg

        if (attempt < this.maxRetries) continue

        return { ok: false, error: msg, retriedCount }
      }
    }

    return { ok: false, error: lastError, retriedCount }
  }

  // ── Conversión TeamsNotification → Adaptive Card ─────────────────────────

  private _notificationToAdaptiveCard(
    notification: TeamsNotification,
  ): TeamsWebhookAttachment {
    const severity = notification.severity ?? 'info'
    const config   = SEVERITY_CONFIG[severity]
    const color    = notification.themeColor ?? config.themeColor

    const body: unknown[] = []

    // Título con emoji de severidad
    if (notification.title) {
      body.push({
        type:    'TextBlock',
        text:    `${config.emoji} **${notification.title}**`,
        wrap:    true,
        size:    'Medium',
        weight:  'Bolder',
        color:   severityToCardColor(severity),
        spacing: 'None',
      })
    }

    // Cuerpo del mensaje
    if (notification.body) {
      const truncated = notification.body.length > MAX_TEXT_LENGTH
        ? notification.body.slice(0, MAX_TEXT_LENGTH) + '\n\n_[truncado]_'
        : notification.body

      body.push({
        type:     'TextBlock',
        text:     truncated,
        wrap:     true,
        markdown: true,
        spacing:  notification.title ? 'Small' : 'None',
      })
    }

    // FactSet (campos clave-valor)
    if (notification.facts?.length) {
      body.push({
        type:    'FactSet',
        facts:   notification.facts.map((f) => ({
          title: f.name,
          value: f.value,
        })),
        spacing: 'Medium',
      })
    }

    // Acciones (botones que abren URL)
    const actions = notification.actions?.map((a) => ({
      type:  'Action.OpenUrl',
      title: a.label,
      url:   a.url,
    })) ?? []

    return {
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: ADAPTIVE_CARD_SCHEMA,
        type:    'AdaptiveCard',
        version: ADAPTIVE_CARD_VERSION,
        msTeams: { width: 'Full' },
        body,
        ...(actions.length ? { actions } : {}),
        // themeColor guardado en metadata para extensión futura
        _themeColor: color,
      },
    }
  }
}

// ── Función helper stateless ──────────────────────────────────────────────────

/**
 * Función utilitaria para envío único sin instanciar el adapter.
 * Ideal para notificaciones puntuales desde cualquier parte del codebase.
 *
 * @example
 * await sendTeamsNotification(process.env.TEAMS_WEBHOOK_URL, {
 *   title:    'Deploy completado',
 *   body:     'Versión **v2.4.1** desplegada en producción',
 *   severity: 'success',
 *   actions:  [{ label: 'Ver logs', url: 'https://...' }],
 * })
 */
export async function sendTeamsNotification(
  webhookUrl:   string,
  notification: TeamsNotification,
  config?:      Omit<TeamsWebhookConfig, 'webhookUrl'>,
): Promise<TeamsWebhookSendResult> {
  const adapter = new TeamsWebhookAdapter({ webhookUrl, ...config })
  return adapter.notify(notification)
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function buildSimpleTextCard(text: string): TeamsWebhookAttachment {
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      $schema: ADAPTIVE_CARD_SCHEMA,
      type:    'AdaptiveCard',
      version: ADAPTIVE_CARD_VERSION,
      body: [
        {
          type:     'TextBlock',
          text,
          wrap:     true,
          markdown: true,
        },
      ],
    },
  }
}

function severityToCardColor(
  severity: TeamsNotification['severity'],
): string {
  switch (severity) {
    case 'success': return 'Good'
    case 'warning': return 'Warning'
    case 'error':   return 'Attention'
    default:        return 'Accent'
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
