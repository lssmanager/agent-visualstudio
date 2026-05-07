/**
 * [F3a-10] app.helper.ts
 *
 * Levanta un servidor Express en puerto efímero (0) con:
 *   - Todas las rutas del gateway de Telegram montadas
 *   - Prisma reemplazado por prismaMock
 *   - AgentExecutor reemplazado por el stub inyectado
 *   - fetch() ya reemplazado globalmente por vitest en el test principal
 *
 * cleanup() cierra el servidor y libera el puerto.
 *
 * NOTA: Este helper construye el pipeline de servicios manualmente para
 * evitar dependencias de NestJS DI en el test E2E. La cadena de llamadas
 * replica la que produciría el NestJS container en producción:
 *
 *   POST /webhook
 *     → TelegramAdapter.handleUpdate()
 *     → onMessage callback
 *     → SessionManager (prismaMock)
 *     → AgentResolver  (prismaMock)
 *     → agentExecutorStub.run()
 *     → TelegramAdapter.send()
 *     → global.fetch (interceptado)
 *
 * FIX [PR#144-C1]: sessionHistory movido al interior de startTestApp() para
 * evitar contaminación de estado entre suites que corren en paralelo.
 * El Map es local a cada instancia de TestApp y se limpia en cleanup().
 */

import express, { type Express }  from 'express'
import type { Server }            from 'node:http'
import type { PrismaMock }        from './prisma.mock'
import type { IAgentExecutorLike } from './agent-executor.stub'
import {
  CHANNEL_CONFIG_ID,
  WEBHOOK_SECRET,
  TELEGRAM_BOT_TOKEN,
  AGENT_ID,
} from './telegram.fixtures'
import { TIMEOUT_REPLY } from './agent-executor.stub'

// ── Tipos internos ─────────────────────────────────────────────────────────────

interface SessionTurn {
  role:    'user' | 'assistant' | 'system'
  content: string
}

interface IncomingMessage {
  externalId: string
  senderId:   string
  text:       string
  type:       'text' | 'command' | 'callback_query'
  metadata?:  Record<string, unknown>
  receivedAt: string
}

export interface TestApp {
  baseUrl:  string
  server:   Server
  cleanup(): Promise<void>
}

export interface StartTestAppOptions {
  timeoutMs?:    number
  maxAttempts?:  number
  retryDelayMs?: number
}

// ── Función principal ──────────────────────────────────────────────────────────

export async function startTestApp(
  _prismaMock:    PrismaMock,
  agentExecutor:  IAgentExecutorLike,
  options: StartTestAppOptions = {},
): Promise<TestApp> {
  const {
    timeoutMs    = 5_000,
    maxAttempts  = 2,
    retryDelayMs = 50,
  } = options

  // FIX [PR#144-C1]: sessionHistory es local a esta instancia de TestApp.
  // Múltiples llamadas a startTestApp() (suites paralelas) no comparten estado.
  const sessionHistory = new Map<string, SessionTurn[]>()

  const app: Express = express()
  app.use(express.json())

  // ── Helpers inline ────────────────────────────────────────────────────

  function sessionKey(externalId: string): string {
    return `${CHANNEL_CONFIG_ID}:${externalId}`
  }

  function getHistory(externalId: string): SessionTurn[] {
    return sessionHistory.get(sessionKey(externalId)) ?? []
  }

  function appendHistory(externalId: string, turn: SessionTurn): void {
    const key  = sessionKey(externalId)
    const hist = sessionHistory.get(key) ?? []
    hist.push(turn)
    sessionHistory.set(key, hist)
  }

  /** Llama fetch() a sendMessage de Telegram */
  async function telegramSend(chatId: string | number, text: string): Promise<void> {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
      },
    )
  }

  /** Llama answerCallbackQuery */
  async function telegramAnswerCbq(callbackQueryId: string): Promise<void> {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
      {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ callback_query_id: callbackQueryId }),
      },
    )
  }

  /** Ejecuta el executor con timeout y reintentos */
  async function runWithRetry(
    agentId:  string,
    history:  SessionTurn[],
  ): Promise<string> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await Promise.race([
          agentExecutor.run(agentId, history),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('AGENT_TIMEOUT')), timeoutMs)
          ),
        ])
        return result.reply
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (lastError.message === 'AGENT_TIMEOUT') break
        // Esperar antes del reintento
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, retryDelayMs))
        }
      }
    }

    return TIMEOUT_REPLY
  }

  // ── Handler de mensajes entrantes ──────────────────────────────────────────

  async function handleIncoming(msg: IncomingMessage): Promise<void> {
    const history = getHistory(msg.externalId)

    // Añadir turno del usuario
    appendHistory(msg.externalId, { role: 'user', content: msg.text })

    // Ejecutar agente
    const updatedHistory = getHistory(msg.externalId)
    const reply = await runWithRetry(AGENT_ID, updatedHistory)

    // Guardar respuesta
    appendHistory(msg.externalId, { role: 'assistant', content: reply })

    // Notificar sessionManager mock — selector canónico
    await _prismaMock.gatewaySession.upsert({
      where:  {
        channelConfigId_externalId: {
          channelConfigId: CHANNEL_CONFIG_ID,
          externalId: msg.senderId,
        },
      },
      create: { channelConfigId: CHANNEL_CONFIG_ID, externalId: msg.senderId, state: 'active', agentId: AGENT_ID },
      update: { state: 'active' },
    } as Parameters<PrismaMock['gatewaySession']['upsert']>[0])

    // Enviar respuesta al usuario
    await telegramSend(msg.externalId, reply)
  }

  // ── Webhook route ─────────────────────────────────────────────────────────────

  app.post(
    `/gateway/telegram/${CHANNEL_CONFIG_ID}/webhook`,
    async (req, res) => {
      // Verificar webhook secret
      const secret = req.headers['x-telegram-bot-api-secret-token']
      if (secret !== WEBHOOK_SECRET) {
        res.status(403).json({ ok: false, error: 'Invalid secret' })
        return
      }

      const body = req.body as Record<string, unknown>

      try {
        // ─ Mensaje de texto / comando ─────────────────────────────────
        if (body.message) {
          const msg = body.message as {
            chat: { id: number }
            from?: { id: number; username?: string }
            text?: string
            photo?: unknown[]
          }

          // Ignorar mensajes sin texto (fotos, stickers, etc.)
          if (!msg.text || typeof msg.text !== 'string') {
            res.json({ ok: true })
            return
          }

          const incoming: IncomingMessage = {
            externalId: String(msg.chat.id),
            senderId:   String(msg.from?.id ?? msg.chat.id),
            text:       msg.text,
            type:       msg.text.startsWith('/') ? 'command' : 'text',
            receivedAt: new Date().toISOString(),
          }

          await handleIncoming(incoming)
          res.json({ ok: true })
          return
        }

        // ─ callback_query (botón inline) ────────────────────────────
        if (body.callback_query) {
          const cbq = body.callback_query as {
            id:      string
            data:    string
            message: { chat: { id: number } }
            from:    { id: number }
          }

          await telegramAnswerCbq(cbq.id)

          const incoming: IncomingMessage = {
            externalId: String(cbq.message.chat.id),
            senderId:   String(cbq.from.id),
            text:       cbq.data,
            type:       'callback_query',
            receivedAt: new Date().toISOString(),
          }

          await handleIncoming(incoming)
          res.json({ ok: true })
          return
        }

        // Update desconocido — aceptar sin procesar
        res.json({ ok: true })

      } catch (err) {
        console.error('[test-app] webhook error:', err)
        res.status(500).json({ ok: false, error: String(err) })
      }
    },
  )

  // ── Levantar servidor en puerto efímero ───────────────────────────────────

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })

  const addr    = server.address() as { port: number }
  const baseUrl = `http://127.0.0.1:${addr.port}`

  return {
    baseUrl,
    server,
    cleanup: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      // sessionHistory es local: limpiar por buenas prácticas (GC)
      sessionHistory.clear()
    },
  }
}
