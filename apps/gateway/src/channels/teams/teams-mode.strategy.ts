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
 *   - Token se renueva automáticamente antes de expirar
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
 */

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type TeamsMode = 'incoming_webhook' | 'bot_framework'

/** Credenciales según el modo */
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

/** Configuración adicional (no sensible) */
export interface TeamsConfig {
  mode:          TeamsMode
  defaultLocale?: string   // 'es-ES' | 'en-US' — para Adaptive Cards
  timeoutMs?:    number    // timeout de fetch a Teams API (default 10s)
}

/**
 * Payload de una Activity de Teams (Bot Framework Activity schema).
 * Solo los campos que el gateway necesita procesar.
 */
export interface TeamsActivity {
  type:           string        // 'message' | 'conversationUpdate' | 'invoke' | ...
  id?:            string        // activityId
  timestamp?:     string        // ISO 8601
  serviceUrl:     string        // URL dinámica del Bot Framework Service
  channelId:      string        // siempre 'msteams'
  from: {
    id:           string        // userId o botId
    name?:        string
    aadObjectId?: string        // Azure AD Object ID del usuario
  }
  conversation: {
    id:           string        // conversationId
    tenantId?:    string
    isGroup?:     boolean
  }
  recipient: {
    id:           string        // botId
    name?:        string
  }
  text?:          string        // contenido del mensaje
  textFormat?:    'plain' | 'markdown' | 'xml'
  attachments?:   TeamsAttachment[]
  channelData?: {
    tenant?:     { id: string }
    team?:       { id: string; name?: string }
    channel?:    { id: string; name?: string }
  }
  replyToId?:     string        // activityId al que responde (para hilos)
}

export interface TeamsAttachment {
  contentType:  string          // 'application/vnd.microsoft.card.adaptive' | etc.
  content?:     unknown         // Adaptive Card JSON schema
  contentUrl?:  string
  name?:        string
}

/** Mensaje de salida Teams (texto plano o Adaptive Card) */
export interface TeamsOutgoingPayload {
  type:         'message'
  text?:        string
  attachments?: TeamsAttachment[]
  /** Solo bot_framework: activityId al que responder en hilo */
  replyToId?:   string
}

/** Resultado de un envío Teams */
export interface TeamsSendResult {
  ok:           boolean
  activityId?:  string   // ID de la Activity creada por Teams
  error?:       string
}

// ── Interfaz de estrategia ────────────────────────────────────────────────────

/**
 * Contrato que deben implementar las dos estrategias.
 * El TeamsAdapter (F3a-32) llama solo a estos métodos —
 * nunca sabe si está en modo webhook o bot_framework.
 */
export interface ITeamsModeStrategy {
  readonly mode: TeamsMode

  /**
   * Envía un mensaje o Adaptive Card.
   * - incoming_webhook: POST a webhookUrl con el payload
   * - bot_framework:    POST a {serviceUrl}/v3/conversations/{id}/activities
   */
  send(
    payload:        TeamsOutgoingPayload,
    conversationId: string,
    serviceUrl?:    string,
  ): Promise<TeamsSendResult>

  /**
   * Verifica que las credenciales son válidas.
   * - incoming_webhook: POST mínimo al webhookUrl (texto vacío)
   * - bot_framework:    obtener Bearer token (falla si appId/password incorrectos)
   */
  verify(): Promise<{ ok: boolean; error?: string }>

  /**
   * Construye un Adaptive Card de texto plano (fallback universal).
   * Ambos modos pueden enviar Adaptive Cards — este helper
   * estandariza la creación para texto simple.
   */
  buildTextCard(text: string): TeamsAttachment

  /**
   * Solo bot_framework: devuelve el Bearer token actual (renueva si expiró).
   * incoming_webhook: lanza un error (no aplica).
   */
  getBearerToken?(): Promise<string>
}

// ── Modo 1: IncomingWebhookStrategy ──────────────────────────────────────────

/**
 * Estrategia simple de Incoming Webhook.
 *
 * Microsoft Teams Incoming Webhooks aceptan:
 *   1. Mensaje de texto: { text: "..." }
 *   2. MessageCard legacy: { "@type": "MessageCard", ... }
 *   3. Adaptive Card via Attachment: { type: "message", attachments: [...] }
 *
 * Esta implementación usa siempre Adaptive Card para consistencia
 * con la experiencia bot_framework.
 */
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

  async send(payload: TeamsOutgoingPayload): Promise<TeamsSendResult> {
    // Incoming Webhook no usa conversationId ni serviceUrl
    const body = this._buildWebhookBody(payload)

    try {
      const res = await fetch(this.webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(this.timeoutMs),
      })

      // Teams Incoming Webhook devuelve "1" como body en éxito
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
    // Enviar un mensaje de prueba vacío para verificar conectividad
    const result = await this.send({
      type: 'message',
      attachments: [this.buildTextCard('✅ Conexión Teams verificada correctamente.')],
    })
    return result
  }

  buildTextCard(text: string): TeamsAttachment {
    return buildAdaptiveTextCard(text)
  }

  // ── Helper privado ─────────────────────────────────────────────────────────

  private _buildWebhookBody(payload: TeamsOutgoingPayload): Record<string, unknown> {
    // Si el payload tiene attachments (Adaptive Cards), usar formato de mensaje
    if (payload.attachments?.length) {
      return {
        type:        'message',
        attachments: payload.attachments,
      }
    }

    // Texto plano: envolver en Adaptive Card para consistencia visual
    if (payload.text) {
      return {
        type:        'message',
        attachments: [this.buildTextCard(payload.text)],
      }
    }

    return { type: 'message', text: '' }
  }
}

// ── Modo 2: BotFrameworkStrategy ─────────────────────────────────────────────

/**
 * Estrategia Bot Framework completa.
 *
 * Flujo de autenticación:
 *   1. POST https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token
 *      con grant_type=client_credentials, client_id=appId, client_secret=appPassword
 *      scope=https://api.botframework.com/.default
 *   2. Guardar access_token + expires_in (segundos)
 *   3. Renovar cuando quedan < 60s para expirar
 *
 * Flujo de envío:
 *   POST {serviceUrl}/v3/conversations/{conversationId}/activities
 *   Authorization: Bearer {access_token}
 *   Body: Activity JSON
 *
 * IMPORTANTE: serviceUrl es dinámico — viene en cada Activity entrante
 * (body.serviceUrl). Nunca usar una URL fija de Teams.
 */
export class BotFrameworkStrategy implements ITeamsModeStrategy {
  readonly mode: TeamsMode = 'bot_framework'

  private readonly appId:       string
  private readonly appPassword: string
  private readonly timeoutMs:   number

  private tokenCache: {
    accessToken:  string
    expiresAtMs:  number
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
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
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
   * Obtiene el Bearer token actual, renovándolo automáticamente
   * si ya expiró o quedan menos de 60 segundos para expirar.
   *
   * Endpoint: https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token
   */
  async getBearerToken(): Promise<string> {
    const RENEW_BUFFER_MS = 60_000  // renovar 60s antes de expirar

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

    const res = await fetch(
      'https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    params.toString(),
        signal:  AbortSignal.timeout(this.timeoutMs),
      },
    )

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
      accessToken:  data.access_token,
      expiresAtMs:  Date.now() + data.expires_in * 1000,
    }

    return this.tokenCache.accessToken
  }

  // ── Helper privado ─────────────────────────────────────────────────────────

  private _buildActivity(payload: TeamsOutgoingPayload): Record<string, unknown> {
    const activity: Record<string, unknown> = {
      type: 'message',
    }

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

// ── Factory: createTeamsModeStrategy ─────────────────────────────────────────

/**
 * Factory que crea la estrategia correcta según el modo configurado.
 *
 * Uso en TeamsAdapter (F3a-32):
 *   const strategy = createTeamsModeStrategy(config, secrets)
 *   await strategy.verify()
 *   await strategy.send({ type: 'message', text: '...' }, conversationId, serviceUrl)
 *
 * Detección automática de modo:
 *   - Si secrets tiene 'webhookUrl' → incoming_webhook
 *   - Si secrets tiene 'appId' y 'appPassword' → bot_framework
 *   - config.mode tiene prioridad si está explícito
 */
export function createTeamsModeStrategy(
  config:  Partial<TeamsConfig>,
  secrets: Record<string, unknown>,
): ITeamsModeStrategy {
  // Detectar modo: config explícito tiene prioridad
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

  // bot_framework
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

// ── Helpers compartidos ───────────────────────────────────────────────────────

/**
 * Construye un Adaptive Card mínimo de texto plano (schema v1.5).
 * Compatible con Teams, Outlook, y otros hosts de Adaptive Cards.
 *
 * El texto soporta Markdown básico: **negrita**, *cursiva*, listas.
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
 * Construye un Adaptive Card con título, descripción y botones de acción.
 * Usado por el AgentExecutor para respuestas con richContent.
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
    const factSet = {
      type:  'FactSet',
      facts: opts.fields.map((f) => ({ title: f.label, value: f.value })),
    }
    body.push(factSet)
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
