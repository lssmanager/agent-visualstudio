/**
 * teams-bot.adapter.ts — [F3a-32]
 *
 * Adapter de Microsoft Teams para el Gateway.
 * Hereda de BaseChannelAdapter e implementa IHttpChannelAdapter.
 *
 * Rutas expuestas:
 *   POST /teams/messages   — webhook de actividades Bot Framework
 *   GET  /teams/health     — healthcheck (devuelve mode activo)
 *
 * Modos de operación (definidos en F3a-31):
 *   incoming_webhook  — solo envío, no registra rutas de recepción
 *   bot_framework     — bidireccional completo con verificación JWT
 *
 * Verificación de autenticidad (bot_framework):
 *   El Bot Connector Service envía un Bearer JWT firmado con la clave pública
 *   de Microsoft. La verificación completa requiere la librería botframework-connector.
 *   Esta implementación usa una validación mínima:
 *     1. Extrae el Bearer token del header Authorization
 *     2. Decodifica el JWT (sin verificar firma — SOLO para desarrollo local)
 *     3. Comprueba que el claim 'appid' coincide con el appId configurado
 *
 *   IMPORTANTE PARA PRODUCCIÓN: Instalar `botframework-connector` y usar
 *   JwtTokenValidation.authenticateRequest() para verificación de firma real.
 *
 * Activity types que maneja:
 *   message            → normaliza a IncomingMessage y pasa al agente
 *   conversationUpdate → log de join/leave, no emite al agente
 *   invoke             → responde 200 vacío (Teams health check)
 *   otros              → log y 200 OK sin proceso
 */

import { Router, Request, Response, NextFunction } from 'express'
import {
  BaseChannelAdapter,
  IHttpChannelAdapter,
  IncomingMessage,
  OutgoingMessage,
  RichContent,
} from '../channel-adapter.interface'
import {
  ITeamsModeStrategy,
  TeamsActivity,
  TeamsAttachment,
  TeamsOutgoingPayload,
  createTeamsModeStrategy,
  buildAdaptiveTextCard,
  buildAdaptiveRichCard,
} from './index'

// ── Tipos de configuración ────────────────────────────────────────────────────

export interface TeamsAdapterConfig {
  /** Modo de operación — se detecta automáticamente si se omite */
  mode?:           'incoming_webhook' | 'bot_framework'
  /** Tiempo máximo de procesamiento del agente en ms (default: 25s) */
  agentTimeoutMs?: number
  /** Locale por defecto para Adaptive Cards */
  defaultLocale?:  string
  /** Prefijo del endpoint (default: '/teams') */
  routePrefix?:    string
}

// ── TeamsAdapter ─────────────────────────────────────────────────────────────

export class TeamsAdapter
  extends BaseChannelAdapter
  implements IHttpChannelAdapter
{
  readonly channel = 'teams' as const

  private strategy!:    ITeamsModeStrategy
  private config!:      TeamsAdapterConfig
  private secrets!:     Record<string, unknown>
  private router!:      Router
  private readonly routePrefix: string

  constructor(config: TeamsAdapterConfig = {}) {
    super()
    this.routePrefix = config.routePrefix ?? '/teams'
  }

  // ── IChannelAdapter: initialize ────────────────────────────────────────────

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId
    // initialize() sin credentials es un no-op; setup() completa la inicialización
  }

  /**
   * Configuración completa del adapter.
   * Debe llamarse después de initialize() con las credenciales desde BD.
   *
   * @param config   Configuración no sensible (TeamsAdapterConfig)
   * @param secrets  Credenciales (webhookUrl | appId + appPassword)
   */
  async setup(
    config:  TeamsAdapterConfig,
    secrets: Record<string, unknown>,
  ): Promise<void> {
    this.config  = config
    this.secrets = secrets

    // Crear estrategia según modo
    this.strategy = createTeamsModeStrategy(config, secrets)

    // Verificar conectividad al iniciar
    const check = await this.strategy.verify()
    if (!check.ok) {
      console.warn(
        `[TeamsAdapter:${this.channelConfigId}] ` +
        `Credential verification failed: ${check.error}. ` +
        `Adapter will start but messages may fail.`
      )
    } else {
      console.info(
        `[TeamsAdapter:${this.channelConfigId}] ` +
        `Teams adapter initialized in ${this.strategy.mode} mode ✓`
      )
    }

    // Construir el router Express
    this.router = this._buildRouter()
  }

  // ── IHttpChannelAdapter: getRouter ────────────────────────────────────────

  getRouter(): Router {
    if (!this.router) {
      throw new Error(
        '[TeamsAdapter] getRouter() called before setup(). ' +
        'Call adapter.setup(config, secrets) first.'
      )
    }
    return this.router
  }

  // ── IChannelAdapter: send ─────────────────────────────────────────────────

  /**
   * Envía una respuesta del agente al canal Teams.
   *
   * Para bot_framework, el serviceUrl y conversationId deben estar
   * en message.metadata.serviceUrl y message.externalId respectivamente.
   *
   * Para incoming_webhook, solo se necesita message.text.
   */
  async send(message: OutgoingMessage): Promise<void> {
    const payload    = this._buildTeamsPayload(message)
    const serviceUrl = message.metadata?.['serviceUrl'] as string | undefined

    const result = await this.strategy.send(
      payload,
      message.externalId,
      serviceUrl,
    )

    if (!result.ok) {
      console.error(
        `[TeamsAdapter:${this.channelConfigId}] ` +
        `Failed to send message to Teams: ${result.error}`
      )
    }
  }

  // ── IChannelAdapter: dispose ──────────────────────────────────────────────

  async dispose(): Promise<void> {
    // Teams no mantiene conexiones persistentes
    console.info(`[TeamsAdapter:${this.channelConfigId}] Teams adapter disposed.`)
  }

  // ── Router builder ────────────────────────────────────────────────────────

  private _buildRouter(): Router {
    const router = Router()

    // ── GET /health ──────────────────────────────────────────────────────────
    router.get('/health', (_req: Request, res: Response) => {
      res.json({
        status:          'ok',
        channel:         'teams',
        mode:            this.strategy.mode,
        channelConfigId: this.channelConfigId,
        timestamp:       new Date().toISOString(),
      })
    })

    // ── POST /messages ───────────────────────────────────────────────────────
    // Solo registrar el webhook de recepción en modo bot_framework
    if (this.strategy.mode === 'bot_framework') {
      router.post(
        '/messages',
        this._verifyBotFrameworkAuth.bind(this),
        this._handleActivity.bind(this),
      )
    } else {
      // incoming_webhook: ruta registrada pero informa que no recibe
      router.post('/messages', (_req: Request, res: Response) => {
        res.status(400).json({
          error: 'Este canal Teams está configurado como Incoming Webhook (solo envío). ' +
                 'Para recibir mensajes, configura el modo bot_framework.',
        })
      })
    }

    return router
  }

  // ── Middleware: verificación Bot Framework ────────────────────────────────

  /**
   * Verificación mínima del Bearer token JWT enviado por el Bot Connector Service.
   *
   * ADVERTENCIA DE SEGURIDAD:
   * Esta implementación verifica solo el claim 'appid' decodificando el JWT
   * sin verificar la firma criptográfica. Suficiente para desarrollo local.
   *
   * PARA PRODUCCIÓN: usar botframework-connector:
   *   import { JwtTokenValidation, SimpleCredentialProvider } from 'botframework-connector'
   *   const credentials = new SimpleCredentialProvider(appId, appPassword)
   *   await JwtTokenValidation.authenticateRequest(activity, authHeader, credentials)
   */
  private _verifyBotFrameworkAuth(
    req:  Request,
    res:  Response,
    next: NextFunction,
  ): void {
    if (this.strategy.mode !== 'bot_framework') {
      next()
      return
    }

    const authHeader = (req.headers['authorization'] as string) ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Bearer token' })
      return
    }

    const token = authHeader.slice(7)

    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        res.status(401).json({ error: 'Invalid JWT format' })
        return
      }

      const payloadB64 = parts[1]!
      const padded     = payloadB64.replace(/-/g, '+').replace(/_/g, '/')
      const decoded    = Buffer.from(padded, 'base64').toString('utf-8')
      const claims     = JSON.parse(decoded) as Record<string, unknown>

      const appId = this.secrets['appId'] as string
      if (claims['appid'] !== appId) {
        console.warn(
          `[TeamsAdapter:${this.channelConfigId}] ` +
          `Auth rejected: expected appid=${appId}, got appid=${String(claims['appid'])}`
        )
        res.status(401).json({ error: 'Invalid appid in token' })
        return
      }

      next()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[TeamsAdapter:${this.channelConfigId}] JWT decode error: ${msg}`)
      res.status(401).json({ error: 'Token decode error' })
    }
  }

  // ── Handler principal de Activities ───────────────────────────────────────

  private async _handleActivity(req: Request, res: Response): Promise<void> {
    const activity = req.body as TeamsActivity

    if (!activity?.type) {
      res.status(400).json({ error: 'Missing activity type' })
      return
    }

    try {
      switch (activity.type) {
        case 'message':
          await this._handleMessageActivity(activity, res)
          break

        case 'conversationUpdate':
          this._logConversationUpdate(activity)
          res.status(200).send()
          break

        case 'invoke':
          // Teams usa 'invoke' para health checks y Adaptive Card actions
          res.status(200).json({})
          break

        default:
          console.debug(
            `[TeamsAdapter:${this.channelConfigId}] ` +
            `Unhandled activity type: ${activity.type}`
          )
          res.status(200).send()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(
        `[TeamsAdapter:${this.channelConfigId}] ` +
        `Error handling activity: ${msg}`
      )
      res.status(500).json({ error: 'Internal error processing activity' })
    }
  }

  // ── Handler de actividad tipo 'message' ───────────────────────────────────

  private async _handleMessageActivity(
    activity: TeamsActivity,
    res:      Response,
  ): Promise<void> {
    const text = activity.text?.trim()

    if (!text) {
      res.status(200).send()
      return
    }

    const incoming = this._normalizeActivity(activity)

    // Responder inmediatamente con 200 para evitar timeout de Teams (3s)
    res.status(200).send()

    // Procesar el mensaje en background
    const timeout       = this.config?.agentTimeoutMs ?? 25_000
    const timeoutHandle = setTimeout(() => {
      console.warn(
        `[TeamsAdapter:${this.channelConfigId}] ` +
        `Agent processing timeout (${timeout}ms) for conversation ${incoming.externalId}`
      )
    }, timeout)

    try {
      await this.emit(incoming)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(
        `[TeamsAdapter:${this.channelConfigId}] ` +
        `Agent processing error: ${msg}`
      )
      await this.strategy.send(
        {
          type: 'message',
          attachments: [
            this.strategy.buildTextCard(
              '⚠️ Se produjo un error procesando tu mensaje. Por favor, intenta de nuevo.'
            ),
          ],
          replyToId: activity.id,
        },
        activity.conversation.id,
        activity.serviceUrl,
      )
    } finally {
      clearTimeout(timeoutHandle)
    }
  }

  // ── Normalización Activity → IncomingMessage ──────────────────────────────

  private _normalizeActivity(activity: TeamsActivity): IncomingMessage {
    return {
      channelConfigId: this.channelConfigId,
      channelType:     'teams',
      externalId:      activity.conversation.id,
      senderId:        activity.from.aadObjectId ?? activity.from.id,
      text:            activity.text ?? '',
      type:            'text',
      msgId:           activity.id,
      receivedAt:      activity.timestamp ?? this.makeTimestamp(),
      rawPayload:      activity,
      metadata: {
        serviceUrl:  activity.serviceUrl,
        tenantId:    activity.conversation.tenantId ?? activity.channelData?.tenant?.id,
        teamId:      activity.channelData?.team?.id,
        teamName:    activity.channelData?.team?.name,
        channelId:   activity.channelData?.channel?.id,
        channelName: activity.channelData?.channel?.name,
        isGroup:     activity.conversation.isGroup ?? false,
        fromName:    activity.from.name,
        activityId:  activity.id,
        replyToId:   activity.replyToId,
      },
    }
  }

  // ── Construcción de payload de salida ─────────────────────────────────────

  private _buildTeamsPayload(message: OutgoingMessage): TeamsOutgoingPayload {
    const replyToId = message.metadata?.['activityId'] as string | undefined

    if (message.richContent) {
      const attachment = this._richContentToAdaptiveCard(message.richContent)
      if (attachment) {
        return { type: 'message', attachments: [attachment], replyToId }
      }
    }

    return {
      type:        'message',
      attachments: [buildAdaptiveTextCard(message.text)],
      replyToId,
    }
  }

  private _richContentToAdaptiveCard(
    richContent: RichContent,
  ): TeamsAttachment | null {
    if ('type' in richContent) {
      switch (richContent.type) {
        case 'card':
          return buildAdaptiveRichCard({
            title:       richContent.card.title,
            description: richContent.card.subtitle,
            imageUrl:    richContent.card.imageUrl,
            buttons:     richContent.card.buttons?.map((b) => ({
              label: b.label,
              value: b.payload,
            })),
          })

        case 'quick_replies':
          return buildAdaptiveRichCard({
            buttons: richContent.replies.map((r) => ({
              label: r.label,
              value: r.payload,
            })),
          })

        case 'image':
          return buildAdaptiveRichCard({
            description: richContent.altText,
            imageUrl:    richContent.url,
          })

        case 'file':
          return buildAdaptiveTextCard(
            `📎 [${richContent.filename}](${richContent.url})`
          )
      }
    }

    const legacy = richContent as {
      title?:       string
      description?: string
      imageUrl?:    string
      buttons?:     Array<{ label: string; value: string }>
    }

    if (legacy.title || legacy.description) {
      return buildAdaptiveRichCard({
        title:       legacy.title,
        description: legacy.description,
        imageUrl:    legacy.imageUrl,
        buttons:     legacy.buttons,
      })
    }

    return null
  }

  // ── Helpers internos ──────────────────────────────────────────────────────

  private _logConversationUpdate(activity: TeamsActivity): void {
    const team    = activity.channelData?.team?.name ?? 'unknown'
    const channel = activity.channelData?.channel?.name ?? 'unknown'
    console.info(
      `[TeamsAdapter:${this.channelConfigId}] ` +
      `conversationUpdate — team: ${team}, channel: ${channel}, ` +
      `conversation: ${activity.conversation.id}`
    )
  }
}
