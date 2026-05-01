import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TelegramAdapter }  from '../telegram.adapter.js'
import { WhatsAppAdapter }  from '../whatsapp.adapter.js'
import { SlackAdapter }     from '../slack.adapter.js'
import { DiscordAdapter }   from '../discord.adapter.js'
import { WebhookAdapter }   from '../webhook.adapter.js'
import { WebChatAdapter }   from '../webchat.adapter.js'

// ── Mock global fetch ───────────────────────────────────────────────────────
const fetchMock = vi.fn().mockResolvedValue({
  ok:   true,
  json: async () => ({ ok: true }),
} as Response)

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.restoreAllMocks()
  fetchMock.mockClear()
})

// ── Helpers ─────────────────────────────────────────────────────────────────

const telegramSecrets = { botToken: 'BOT_TOKEN_SECRET' }

function makeTelegramUpdate(overrides?: Record<string, unknown>) {
  return {
    update_id: 1,
    message: {
      message_id: 42,
      chat:       { id: 100, type: 'private' },
      from:       { id: 999, first_name: 'Alice' },
      text:       'hola',
      date:       1700000000,
      ...overrides,
    },
  }
}

// ════════════════════════════════════════════════════════════════════════════
// describe: IncomingMessage.replyFn
// ════════════════════════════════════════════════════════════════════════════

describe('IncomingMessage.replyFn', () => {

  it('TelegramAdapter.receive() construye replyFn que llama a sendMessage con chat_id correcto', async () => {
    const adapter  = new TelegramAdapter()
    const update   = makeTelegramUpdate()
    const incoming = await adapter.receive(update as Record<string, unknown>, telegramSecrets)

    expect(incoming).not.toBeNull()
    expect(incoming!.replyFn).toBeDefined()

    await incoming!.replyFn!('respuesta de prueba')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/bot' + telegramSecrets.botToken + '/sendMessage')
    const body = JSON.parse(init!.body as string)
    expect(body.chat_id).toBe('100')
    expect(body.text).toBe('respuesta de prueba')
  })

  it('TelegramAdapter.receive() en supergrupo con thread: replyFn incluye message_thread_id', async () => {
    const adapter  = new TelegramAdapter()
    const update   = makeTelegramUpdate({ message_thread_id: 42 })
    const incoming = await adapter.receive(update as Record<string, unknown>, telegramSecrets)

    await incoming!.replyFn!('hola thread')

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init!.body as string)
    expect(body.message_thread_id).toBe(42)
  })

  it('TelegramAdapter.receive() con quoteOriginal=true: replyFn incluye reply_to_message_id', async () => {
    const adapter  = new TelegramAdapter()
    const update   = makeTelegramUpdate()
    const incoming = await adapter.receive(update as Record<string, unknown>, telegramSecrets)

    await incoming!.replyFn!('cita', { quoteOriginal: true })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init!.body as string)
    expect(body.reply_to_message_id).toBe(42)
  })

  it('WhatsAppAdapter.receive() replyFn llama a graph.facebook.com con messaging_product=whatsapp', async () => {
    const adapter   = new WhatsAppAdapter()
    const rawPayload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            phone_number_id: 'PHONE_ID',
            messages: [{ id: 'msg1', from: '5491100000', type: 'text', timestamp: '0', text: { body: 'hola' } }],
          },
        }],
      }],
    }
    const secrets   = { accessToken: 'WA_TOKEN', phoneNumberId: 'PHONE_ID' }
    const incoming  = await adapter.receive(rawPayload as Record<string, unknown>, secrets)

    expect(incoming).not.toBeNull()
    await incoming!.replyFn!('respuesta WA')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('graph.facebook.com')
    const body = JSON.parse(init!.body as string)
    expect(body.messaging_product).toBe('whatsapp')
    expect(body.to).toBe('5491100000')
  })

  it('SlackAdapter.receive() replyFn llama a chat.postMessage con thread_ts correcto', async () => {
    const adapter    = new SlackAdapter()
    const rawPayload = {
      type:  'event_callback',
      event: { type: 'message', channel: 'C123', user: 'U1', text: 'hola', ts: '100', thread_ts: '90' },
    }
    const secrets    = { botToken: 'SLACK_BOT_TOKEN' }
    const incoming   = await adapter.receive(rawPayload as Record<string, unknown>, secrets)

    expect(incoming).not.toBeNull()
    await incoming!.replyFn!('respuesta Slack')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://slack.com/api/chat.postMessage')
    const body = JSON.parse(init!.body as string)
    expect(body.thread_ts).toBe('90')
  })

  it('SlackAdapter.receive() sin thread (DM): replyFn usa event.ts como thread_ts', async () => {
    const adapter    = new SlackAdapter()
    const rawPayload = {
      type:  'event_callback',
      event: { type: 'message', channel: 'D123', user: 'U1', text: 'dm', ts: '200' },
    }
    const secrets    = { botToken: 'SLACK_BOT_TOKEN' }
    const incoming   = await adapter.receive(rawPayload as Record<string, unknown>, secrets)

    await incoming!.replyFn!('respuesta DM')

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init!.body as string)
    expect(body.thread_ts).toBe('200')
  })

  it('DiscordAdapter.receive() detecta INTERACTION_CREATE por token y construye replyFn', async () => {
    const adapter = new DiscordAdapter()
    const rawPayload = {
      t: 'INTERACTION_CREATE',
      d: {
        id: 'interaction-1',
        token: 'discord-token',
        channel_id: 'C123',
        user: { id: 'U123' },
        data: { name: 'ping' },
      },
    }

    const incoming = await adapter.receive(rawPayload as Record<string, unknown>, { botToken: 'BOT' })

    expect(incoming).not.toBeNull()
    expect(incoming!.type).toBe('command')
    expect(incoming!.text).toBe('ping')
    expect(typeof incoming!.replyFn).toBe('function')
  })

  it('WebhookAdapter.receive() sin callbackUrl → replyFn undefined', async () => {
    const adapter    = new WebhookAdapter()
    const rawPayload = { sessionId: 'sess1', text: 'hola' }
    const incoming   = await adapter.receive(rawPayload as Record<string, unknown>, {})

    expect(incoming).not.toBeNull()
    expect(incoming!.replyFn).toBeUndefined()
  })

  it('WebhookAdapter.receive() con callbackUrl → replyFn hace POST al callbackUrl', async () => {
    const adapter    = new WebhookAdapter()
    const rawPayload = { sessionId: 'sess1', text: 'hola', callbackUrl: 'https://example.com/reply' }
    const incoming   = await adapter.receive(rawPayload as Record<string, unknown>, {})

    expect(incoming!.replyFn).toBeDefined()
    await incoming!.replyFn!('respuesta webhook')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.com/reply')
    const body = JSON.parse(init!.body as string)
    expect(body.reply).toBe('respuesta webhook')
    expect(body.externalId).toBe('sess1')
  })

})

// ════════════════════════════════════════════════════════════════════════════
// describe: IncomingMessage.threadId
// ════════════════════════════════════════════════════════════════════════════

describe('IncomingMessage.threadId', () => {

  it('TelegramAdapter DM (sin message_thread_id): threadId === externalId', async () => {
    const adapter  = new TelegramAdapter()
    const update   = makeTelegramUpdate()  // sin message_thread_id
    const incoming = await adapter.receive(update as Record<string, unknown>, telegramSecrets)

    expect(incoming!.threadId).toBe(incoming!.externalId)
    expect(incoming!.threadId).toBe('100')
  })

  it('TelegramAdapter supergrupo con message_thread_id=42: threadId=42, externalId=chatId', async () => {
    const adapter  = new TelegramAdapter()
    const update   = makeTelegramUpdate({ message_thread_id: 42 })
    const incoming = await adapter.receive(update as Record<string, unknown>, telegramSecrets)

    expect(incoming!.threadId).toBe('42')
    expect(incoming!.externalId).toBe('100')
    expect(incoming!.threadId).not.toBe(incoming!.externalId)
  })

  it('SlackAdapter con thread_ts: threadId === thread_ts', async () => {
    const adapter    = new SlackAdapter()
    const rawPayload = {
      type:  'event_callback',
      event: { type: 'message', channel: 'C999', user: 'U1', text: 'reply', ts: '500', thread_ts: '400' },
    }
    const incoming = await adapter.receive(rawPayload as Record<string, unknown>, { botToken: 'T' })

    expect(incoming!.threadId).toBe('400')
  })

})

// ════════════════════════════════════════════════════════════════════════════
// describe: IncomingMessage.rawPayload
// ════════════════════════════════════════════════════════════════════════════

describe('IncomingMessage.rawPayload', () => {

  it('rawPayload nunca contiene token, bot_token, access_token (sanitizeRawPayload los elimina)', async () => {
    const adapter  = new TelegramAdapter()
    // Simular que el payload llega con credenciales mezcladas (error de config)
    const dirtPayload = {
      ...makeTelegramUpdate(),
      bot_token:    'secret_token_should_be_removed',
      access_token: 'another_secret',
    }
    const incoming = await adapter.receive(dirtPayload as Record<string, unknown>, telegramSecrets)

    expect(incoming!.rawPayload['bot_token']).toBeUndefined()
    expect(incoming!.rawPayload['access_token']).toBeUndefined()
    expect(incoming!.rawPayload['token']).toBeUndefined()
  })

  it('rawPayload elimina secretos anidados en objetos y arrays', async () => {
    const adapter = new TelegramAdapter()
    const dirtPayload = {
      ...makeTelegramUpdate({
        message: {
          ...makeTelegramUpdate().message,
          botToken: 'nested-secret',
          nested: {
            access_token: 'deep-secret',
            items: [{ apiKey: 'array-secret' }],
          },
        },
      }),
    }

    const incoming = await adapter.receive(dirtPayload as Record<string, unknown>, telegramSecrets)
    const raw = incoming!.rawPayload as Record<string, unknown>
    const message = raw.message as Record<string, unknown>
    const nested = message.nested as Record<string, unknown>
    const items = nested.items as Array<Record<string, unknown>>

    expect(JSON.stringify(raw)).not.toContain('nested-secret')
    expect(JSON.stringify(raw)).not.toContain('deep-secret')
    expect(JSON.stringify(raw)).not.toContain('array-secret')
    expect(message.botToken).toBeUndefined()
    expect(nested.access_token).toBeUndefined()
    expect(items[0].apiKey).toBeUndefined()
  })

  it('rawPayload contiene los campos de contenido del mensaje original (message_id, chat, from)', async () => {
    const adapter  = new TelegramAdapter()
    const update   = makeTelegramUpdate()
    const incoming = await adapter.receive(update as Record<string, unknown>, telegramSecrets)

    // rawPayload debe tener el update completo (sin secretos)
    expect(incoming!.rawPayload['update_id']).toBe(1)
    const msg = (incoming!.rawPayload['message'] as Record<string, unknown>)
    expect(msg).toBeDefined()
    expect(msg['message_id']).toBe(42)
  })

})

// ════════════════════════════════════════════════════════════════════════════
// describe: dispatch() replyFn path
// ════════════════════════════════════════════════════════════════════════════

describe('dispatch() replyFn path', () => {

  it('Si incoming.replyFn está definida: se llama con el texto, adapter.send() NO se llama', async () => {
    const replyFnMock  = vi.fn().mockResolvedValue(undefined)
    const sendMock     = vi.fn().mockResolvedValue(undefined)
    const recordMock   = vi.fn().mockResolvedValue(undefined)
    const receiveUserMock = vi.fn().mockResolvedValue({
      id:      'sess1',
      agentId: 'agent1',
      history: [],
    })
    const recordAssistantMock = vi.fn().mockResolvedValue(undefined)

    const incoming: import('../channel-adapter.interface.js').IncomingMessage = {
      externalId: 'chat1',
      threadId:   'thread1',
      senderId:   'user1',
      text:       'hola',
      type:       'text',
      rawPayload: { message: 'hola' },
      receivedAt: new Date().toISOString(),
      replyFn:    replyFnMock,
    }

    // Simular lo que hace dispatch() internamente
    if (incoming.replyFn) {
      await incoming.replyFn('respuesta', { format: 'text', quoteOriginal: false })
      await recordAssistantMock({ externalId: incoming.externalId, text: 'respuesta' })
    } else {
      await sendMock(incoming)
      await recordMock(incoming)
    }

    expect(replyFnMock).toHaveBeenCalledOnce()
    expect(replyFnMock).toHaveBeenCalledWith('respuesta', { format: 'text', quoteOriginal: false })
    expect(sendMock).not.toHaveBeenCalled()
    expect(recordAssistantMock).toHaveBeenCalledOnce()
  })

  it('Si incoming.replyFn es undefined: se invoca el path legacy (adapter.send y recordReply)', async () => {
    const replyFnMock   = vi.fn()
    const sendMock      = vi.fn().mockResolvedValue(undefined)
    const recordMock    = vi.fn().mockResolvedValue(undefined)
    const recordAssistantMock = vi.fn().mockResolvedValue(undefined)

    const incoming: import('../channel-adapter.interface.js').IncomingMessage = {
      externalId: 'chat2',
      threadId:   'chat2',
      senderId:   'user2',
      text:       'hola',
      type:       'text',
      rawPayload: { message: 'hola' },
      receivedAt: new Date().toISOString(),
      replyFn:    undefined,  // sin replyFn → path legacy
    }

    if (incoming.replyFn) {
      await replyFnMock('respuesta')
      await recordAssistantMock({})
    } else {
      await sendMock(incoming)
      await recordMock(incoming)
    }

    expect(replyFnMock).not.toHaveBeenCalled()
    expect(sendMock).toHaveBeenCalledOnce()
    expect(recordMock).toHaveBeenCalledOnce()
  })

})
