/**
 * teams-mode.strategy.ts — [F3a-31]
 *
 * Estrategia de modo para Microsoft Teams:
 *
 * MODO 1 — incoming_webhook (simple)
 *   - Solo envía mensajes (unidireccional)
 *   - No requiere registro en Azure AD
 *   - Configuración: solo webhookUrl
 *   - Payloads: JSON simple o Adaptive Card
 *   - Limitación: no recibe mensajes, no puede responder en hilo
 *
 * MODO 2 — bot_framework (completo)
 *   - Bidireccional (envía y recibe)
 *   - Requiere: appId + appPassword en Azure AD
 *   - Autenticación: Bearer token via login.microsoftonline.com
 *   - Token se renueva automáticamente antes de expirar (buffer 60s)
 *   - serviceUrl es dinámico por conversación (viene en cada Activity)
 *   - Respuestas van a: {serviceUrl}/v3/conversations/{conversationId}/activities
 *   - Adaptive Cards completas con acciones
 *
 * Exporta:
 *   - TeamsMode (type union)
 *   - ITeamsModeStrategy (interfaz)
 *   - IncomingWebhookStrategy
 *   - BotFrameworkStrategy
 *   - createTeamsModeStrategy (factory)
 *   - buildAdaptiveTextCard / buildAdaptiveRichCard (helpers)
 */

// ── Tipos públicos ─────────────────────────────────────────────────────────

export type TeamsMode = 'incoming_webhook' | 'bot_framework'

export interface TeamsIncomingWebhookSecrets {
  webhookUrl: string
}

export interface TeamsBotFrameworkSecrets {
  appId:       string
  appPassword: string
}

export type TeamsSecrets =
  | TeamsIncomingWebhookSecrets
  | TeamsBotFrameworkSecrets

export interface TeamsConfig {
  mode?:          TeamsMode
  defaultLocale?: string    // 'es-ES' | 'en-US'
  timeoutMs?:     number    // default 10_000
}

/**
 * Subset de la Bot Framework Activity schema que el gateway necesita.
 */
export interface TeamsActivity {
  type:        string
  id?:         string
  timestamp?:  string
  serviceUrl:  string
  channelId:   string
  from: {
    id:            string
    name?:         string
    aadObjectId?:  string
  }
  conversation: {
    id:        string
    tenantId?: string
    isGroup?:  boolean
  }
  recipient: {
    id:    string
    name?: string
  }
  text?:        string
  textFormat?:  'plain' | 'markdown' | 'xml'
  attachments?: TeamsAttachment[]
  channelData?: {
    tenant?:  { id: string }
    team?:    { id: string; name?: string }
    channel?: { id: string; name?: string }
  }
  replyToId?: string
}

export interface TeamsAttachment {
  contentType:  string
  content?:     unknown
  contentUrl?:  string
  name?:        string
}

export interface TeamsOutgoingPayload {
  type:         'message'
  text?:        string
  attachments?: TeamsAttachment[]
  replyToId?:   string
}

export interface TeamsSendResult {
  ok:          boolean
  activityId?: string
  error?:      string
}

// ── Interfaz de estrategia ─────────────────────────────────────────────────

export interface ITeamsModeStrategy {
  readonly mode: TeamsMode

  send(
    payload:        TeamsOutgoingPayload,
    conversationId: string,
    serviceUrl?:    string,
  ): Promise<TeamsSendResult>

  verify(): Promise<{ ok: boolean; error?: string }>

  buildTextCard(text: string): TeamsAttachment

  getBearerToken?(): Promise<string>
}

// ── Modo 1: IncomingWebhookStrategy ───────────────────────────────────────

export class IncomingWebhookStrategy implements ITeamsModeStrategy {
  readonly mode: TeamsMode = 'incoming_webhook'

  private readonly webhookUrl: string
  private readonly timeoutMs:  number

  constructor(secrets: TeamsIncomingWebhookSecrets, config: Partial<TeamsConfig> = {}) {
    if (!secrets.webhookUrl?.startsWith('https://')) {
      throw new Error('[TeamsIncomingWebhook] webhookUrl debe ser una URL HTTPS válida')
    }
    this.webhookUrl = secrets.webhookUrl
    this.timeoutMs  = config.timeoutMs ?? 10_000
  }

  async send(
    payload: TeamsOutgoingPayload,
    _conversationId: string,
    _serviceUrl?: string,
  ): Promise<TeamsSendResult> {
    const body = this._buildWebhookBody(payload)
    try {
      const res = await fetch(this.webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(this.timeoutMs),
      })
      if (!res.ok) {
        const text = await res.text()
        return { ok: false, error: `HTTP ${res.status}: ${text}` }
      }
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    const result = await this.send(
      {
        type:        'message',
        attachments: [this.buildTextCard('✅ Conexión Teams verificada correctamente.')],
      },
      'verify',
    )
    return result
  }

  buildTextCard(text: string): TeamsAttachment {
    return buildAdaptiveTextCard(text)
  }

  private _buildWebhookBody(payload: TeamsOutgoingPayload): Record<string, unknown> {
    if (payload.attachments?.length) {
      return { type: 'message', attachments: payload.attachments }
    }
    if (payload.text) {
      return { type: 'message', attachments: [this.buildTextCard(payload.text)] }
    }
    return { type: 'message', text: '' }
  }
}

// ── Modo 2: BotFrameworkStrategy ──────────────────────────────────────────

const TOKEN_ENDPOINT =
  'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token'

export class BotFrameworkStrategy implements ITeamsModeStrategy {
  readonly mode: TeamsMode = 'bot_framework'

  private readonly appId:       string
  private readonly appPassword: string
  private readonly timeoutMs:   number

  private tokenCache: {
    accessToken: string
    expiresAtMs: number
  } | null = null

  constructor(secrets: TeamsBotFrameworkSecrets, config: Partial<TeamsConfig> = {}) {
    if (!secrets.appId?.trim()) {
      throw new Error('[TeamsBotFramework] appId es requerido')
    }
    if (!secrets.appPassword?.trim()) {
      throw new Error('[TeamsBotFramework] appPassword es requerido')
    }
    this.appId       = secrets.appId
    this.appPassword = secrets.appPassword
    this.timeoutMs   = config.timeoutMs ?? 10_000
  }

  async send(
    payload:        TeamsOutgoingPayload,
    conversationId: string,
    serviceUrl?:    string,
  ): Promise<TeamsSendResult> {
    if (!serviceUrl) {
      return {
        ok:    false,
        error: '[TeamsBotFramework] serviceUrl es requerido para enviar mensajes. ' +
               'Debe tomarse del Activity.serviceUrl recibido en el webhook entrante.',
      }
    }
    if (!conversationId) {
      return { ok: false, error: '[TeamsBotFramework] conversationId es requerido' }
    }

    let token: string
    try {
      token = await this.getBearerToken()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: `Auth error: ${msg}` }
    }

    const url      = `${serviceUrl.replace(/\/$/, '')}/v3/conversations/${conversationId}/activities`
    const activity = this._buildActivity(payload)

    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body:   JSON.stringify(activity),
        signal: AbortSignal.timeout(this.timeoutMs),
      })

      if (!res.ok) {
        const text = await res.text()
        return { ok: false, error: `HTTP ${res.status}: ${text}` }
      }

      const data = await res.json() as { id?: string }
      return { ok: true, activityId: data.id }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.getBearerToken()
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: `Token acquisition failed: ${msg}` }
    }
  }

  buildTextCard(text: string): TeamsAttachment {
    return buildAdaptiveTextCard(text)
  }

  /**
   * Obtiene el Bearer token actual, renovándolo si quedan < 60s para expirar.
   * Endpoint: https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token
   */
  async getBearerToken(): Promise<string> {
    const RENEW_BUFFER_MS = 60_000

    if (
      this.tokenCache &&
      Date.now() < this.tokenCache.expiresAtMs - RENEW_BUFFER_MS
    ) {
      return this.tokenCache.accessToken
    }

    const params = new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     this.appId,
      client_secret: this.appPassword,
      scope:         'https://api.botframework.com/.default',
    })

    const res = await fetch(TOKEN_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
      signal:  AbortSignal.timeout(this.timeoutMs),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`[TeamsBotFramework] Token request failed ${res.status}: ${text}`)
    }

    const data = await res.json() as {
      access_token: string
      expires_in:   number
      token_type:   string
    }

    if (!data.access_token) {
      throw new Error('[TeamsBotFramework] Token response missing access_token')
    }

    this.tokenCache = {
      accessToken: data.access_token,
      expiresAtMs: Date.now() + data.expires_in * 1000,
    }

    return this.tokenCache.accessToken
  }

  private _buildActivity(payload: TeamsOutgoingPayload): Record<string, unknown> {
    const activity: Record<string, unknown> = { type: 'message' }
    if (payload.text) {
      activity['text']       = payload.text
      activity['textFormat'] = 'markdown'
    }
    if (payload.attachments?.length) {
      activity['attachments'] = payload.attachments
    }
    if (payload.replyToId) {
      activity['replyToId'] = payload.replyToId
    }
    return activity
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Crea la estrategia correcta según el modo configurado.
 * Detección automática:
 *   - secrets.webhookUrl presente → incoming_webhook
 *   - secrets.appId + appPassword → bot_framework
 * config.mode tiene prioridad si está explícito.
 */
export function createTeamsModeStrategy(
  config:  Partial<TeamsConfig>,
  secrets: Record<string, unknown>,
): ITeamsModeStrategy {
  const detectedMode: TeamsMode =
    config.mode ??
    ('webhookUrl' in secrets && typeof secrets['webhookUrl'] === 'string'
      ? 'incoming_webhook'
      : 'bot_framework')

  if (detectedMode === 'incoming_webhook') {
    if (!secrets['webhookUrl']) {
      throw new Error(
        '[Teams] Modo incoming_webhook requiere secrets.webhookUrl. ' +
        'Obtenerlo en Teams → Canal → Conectores → Incoming Webhook.',
      )
    }
    return new IncomingWebhookStrategy(
      { webhookUrl: secrets['webhookUrl'] as string },
      config,
    )
  }

  if (!secrets['appId'] || !secrets['appPassword']) {
    throw new Error(
      '[Teams] Modo bot_framework requiere secrets.appId y secrets.appPassword. ' +
      'Registrar el bot en https://dev.botframework.com y obtener las credenciales.',
    )
  }

  return new BotFrameworkStrategy(
    {
      appId:       secrets['appId']       as string,
      appPassword: secrets['appPassword'] as string,
    },
    config,
  )
}

// ── Helpers de Adaptive Card ───────────────────────────────────────────────

/**
 * Adaptive Card mínima de texto plano (schema v1.5).
 * Soporta Markdown básico en el TextBlock.
 */
export function buildAdaptiveTextCard(text: string): TeamsAttachment {
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type:    'AdaptiveCard',
      version: '1.5',
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

/**
 * Adaptive Card rica con título, descripción, facts, imagen y botones.
 * Usada por AgentExecutor para respuestas con richContent.
 */
export function buildAdaptiveRichCard(opts: {
  title?:       string
  description?: string
  fields?:      Array<{ label: string; value: string }>
  buttons?:     Array<{ label: string; value: string }>
  imageUrl?:    string
}): TeamsAttachment {
  const body: unknown[] = []

  if (opts.title) {
    body.push({
      type:   'TextBlock',
      text:   opts.title,
      weight: 'Bolder',
      size:   'Medium',
      wrap:   true,
    })
  }

  if (opts.description) {
    body.push({
      type:     'TextBlock',
      text:     opts.description,
      wrap:     true,
      markdown: true,
      spacing:  'Small',
    })
  }

  if (opts.imageUrl) {
    body.push({
      type:    'Image',
      url:     opts.imageUrl,
      size:    'Stretch',
      spacing: 'Small',
    })
  }

  if (opts.fields?.length) {
    body.push({
      type:  'FactSet',
      facts: opts.fields.map((f) => ({ title: f.label, value: f.value })),
    })
  }

  const actions = opts.buttons?.map((b) => ({
    type:  'Action.Submit',
    title: b.label,
    data:  { actionValue: b.value },
  })) ?? []

  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type:    'AdaptiveCard',
      version: '1.5',
      body,
      ...(actions.length ? { actions } : {}),
    },
  }
}
