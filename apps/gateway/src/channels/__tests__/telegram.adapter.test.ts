/**
 * telegram.adapter.test.ts — Unit + integration tests for TelegramAdapter (grammÝY)
 *
 * Strategy:
 *  - Mock grammÝY Bot class and its API methods
 *  - Mock prisma
 *  - Verify handler registration, send() behavior, and mode selection
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'

// ── Mock prisma ───────────────────────────────────────────────────────
const mockConfig = {
  id:          'cfg-tg-1',
  credentials: {
    botToken:   'FAKE_TOKEN:test',
    webhookUrl: '',
  },
}

vi.mock('../../../../api/src/modules/core/db/prisma.service', () => ({
  prisma: {
    channelConfig: {
      findUnique: vi.fn().mockResolvedValue(mockConfig),
    },
  },
}))

// ── Mock grammÝY ───────────────────────────────────────────────────────────

const mockSendMessage    = vi.fn().mockResolvedValue({ message_id: 1 })
const mockSendChatAction = vi.fn().mockResolvedValue(true)
const mockSetWebhook     = vi.fn().mockResolvedValue(true)
const mockDeleteWebhook  = vi.fn().mockResolvedValue(true)
const mockBotStart       = vi.fn().mockResolvedValue(undefined)
const mockBotStop        = vi.fn().mockResolvedValue(undefined)
const mockBotCatch       = vi.fn()
const mockBotUse         = vi.fn()

// handlers registered via bot.on()
const registeredHandlers = new Map<string, (ctx: any) => Promise<void>>()

const mockBotOn = vi.fn((filter: string, handler: (ctx: any) => Promise<void>) => {
  registeredHandlers.set(filter, handler)
})

function getRouteHandler(
  router: ReturnType<TelegramAdapter['getRouter']>,
  method: 'post' | 'get',
  path: string,
): (req: any, res: any) => Promise<void> {
  const layer = (router as any).stack.find((entry: any) =>
    entry.route?.path === path && entry.route.methods?.[method],
  )
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`)
  }
  return layer.route.stack[0].handle
}

vi.mock('grammy', async () => {
  class FakeBot {
    api = {
      sendMessage:    mockSendMessage,
      sendChatAction: mockSendChatAction,
      setWebhook:     mockSetWebhook,
      deleteWebhook:  mockDeleteWebhook,
    }
    use   = mockBotUse
    on    = mockBotOn
    start = mockBotStart
    stop  = mockBotStop
    catch = mockBotCatch
  }

  class FakeInlineKeyboard {
    private rows: any[] = []
    text(label: string, data: string) { this.rows.push({ text: label, callback_data: data }); return this }
    url(label: string, url: string)   { this.rows.push({ text: label, url }); return this }
    row()                              { return this }
  }

  return {
    Bot:             FakeBot,
    InlineKeyboard:  FakeInlineKeyboard,
    webhookCallback: vi.fn(() => (_req: any, res: any) => res.status(200).send()),
    GrammyError:     class GrammyError extends Error { error_code = 400; description = 'mock' },
    HttpError:       class HttpError extends Error {},
  }
})

import { TelegramAdapter, escapeMarkdownV2 } from '../telegram.adapter.js'

// ── Test suite ───────────────────────────────────────────────────────────

describe('TelegramAdapter — grammÝY SDK', () => {
  let adapter: TelegramAdapter

  beforeEach(async () => {
    vi.clearAllMocks()
    registeredHandlers.clear()
    mockConfig.credentials = { botToken: 'FAKE_TOKEN:test', webhookUrl: '' }
    adapter = new TelegramAdapter()
  })

  // ── initialize() ─────────────────────────────────────────────────────

  it('sin botToken → lanza error', async () => {
    mockConfig.credentials = { botToken: '', webhookUrl: '' } as any
    await expect(adapter.initialize('cfg-tg-1')).rejects.toThrow('botToken is required')
  })

  it('con webhookUrl vacío → modo long polling, bot.start() es llamado', async () => {
    mockConfig.credentials = { botToken: 'FAKE_TOKEN:test', webhookUrl: '' } as any
    await adapter.initialize('cfg-tg-1')
    expect(mockBotStart).toHaveBeenCalledOnce()
    expect(mockSetWebhook).not.toHaveBeenCalled()
  })

  it('con webhookUrl definida → modo webhook, setWebhook() es llamado', async () => {
    mockConfig.credentials = {
      botToken:   'FAKE_TOKEN:test',
      webhookUrl: 'https://agents.example.com',
    } as any
    await adapter.initialize('cfg-tg-1')
    expect(mockSetWebhook).toHaveBeenCalledOnce()
    const [url] = (mockSetWebhook as Mock).mock.calls[0] as [string]
    expect(url).toBe('https://agents.example.com/gateway/telegram/webhook')
    expect(mockBotStart).not.toHaveBeenCalled()
  })

  it('setup route registra webhook con la URL base y no arranca polling', async () => {
    mockConfig.credentials = {
      botToken:   'FAKE_TOKEN:test',
      webhookUrl: 'https://agents.example.com',
    } as any
    await adapter.initialize('cfg-tg-1')

    const router = adapter.getRouter()
    const handler = getRouteHandler(router, 'post', '/setup')

    const req = {
      body: { webhookUrl: 'https://agents.example.com' },
    }
    const res = {
      statusCode: 200,
      body: null as any,
      status(code: number) { this.statusCode = code; return this },
      json(payload: any) { this.body = payload; return this },
    }

    await handler(req, res)

    expect(mockSetWebhook).toHaveBeenCalledOnce()
    expect((mockSetWebhook as Mock).mock.calls[0][0]).toBe(
      'https://agents.example.com/gateway/telegram/webhook',
    )
    expect(mockBotStart).not.toHaveBeenCalled()
  })

  it('registra handlers para message, edited_message y callback_query:data', async () => {
    await adapter.initialize('cfg-tg-1')
    // Los handlers se registran con los filtros broad que usa grammÝY
    expect(registeredHandlers.has('message')).toBe(true)
    expect(registeredHandlers.has('edited_message')).toBe(true)
    expect(registeredHandlers.has('callback_query:data')).toBe(true)
  })

  // ── Handlers ─────────────────────────────────────────────────────────────

  it('message → messageHandler llamado con externalId = chat.id y texto correcto', async () => {
    await adapter.initialize('cfg-tg-1')
    let received: any = null
    adapter.onMessage(async (msg) => { received = msg })

    const handler = registeredHandlers.get('message')!
    await handler({
      update:  { update_id: 12345 },
      message: {
        message_id: 42,
        chat:       { id: 100, type: 'private' },
        from:       { id: 200, username: 'user1', first_name: 'Juan' },
        text:       'Hola mundo',
      },
    })

    expect(received).not.toBeNull()
    expect(received.externalId).toBe('100')
    expect(received.text).toBe('Hola mundo')
    expect(received.type).toBe('text')
  })

  it('message con /comando → type es "command"', async () => {
    await adapter.initialize('cfg-tg-1')
    let received: any = null
    adapter.onMessage(async (msg) => { received = msg })

    const handler = registeredHandlers.get('message')!
    await handler({
      update:  { update_id: 99 },
      message: {
        message_id: 10,
        chat:       { id: 55, type: 'group' },
        from:       { id: 77 },
        text:       '/start',
      },
    })

    expect(received?.type).toBe('command')
  })

  it('message solo con adjuntos → type es "attachment"', async () => {
    await adapter.initialize('cfg-tg-1')
    let received: any = null
    adapter.onMessage(async (msg) => { received = msg })

    const handler = registeredHandlers.get('message')!
    await handler({
      update: { update_id: 101 },
      message: {
        message_id: 12,
        chat:       { id: 88, type: 'private' },
        from:       { id: 99 },
        photo:      [{ file_id: 'photo-1' }],
      },
    })

    expect(received?.type).toBe('attachment')
    expect(received?.attachments?.length).toBeGreaterThan(0)
  })

  it('edited_message → metadata.edited === true', async () => {
    await adapter.initialize('cfg-tg-1')
    let received: any = null
    adapter.onMessage(async (msg) => { received = msg })

    const handler = registeredHandlers.get('edited_message')!
    await handler({
      update:          { update_id: 77 },
      editedMessage:   {
        message_id: 5,
        chat:       { id: 300, type: 'private' },
        from:       { id: 400 },
        text:       'Texto editado',
      },
    })

    expect(received?.metadata?.['edited']).toBe(true)
    expect(received?.text).toBe('Texto editado')
  })

  // ── send() ──────────────────────────────────────────────────────────────

  it('send() tipo text → llama sendMessage con parse_mode MarkdownV2', async () => {
    await adapter.initialize('cfg-tg-1')
    await adapter.send({ externalId: '999', text: 'Hola' })
    expect(mockSendMessage).toHaveBeenCalledWith(
      '999',
      expect.any(String),
      expect.objectContaining({ parse_mode: 'MarkdownV2' }),
    )
  })

  it('send() tipo quick_replies → llama sendMessage con reply_markup', async () => {
    await adapter.initialize('cfg-tg-1')
    await adapter.send({
      externalId:  '111',
      text:        'Elige una opción',
      type:        'quick_replies',
      richContent: [
        { text: 'Sí', callbackData: 'yes' },
        { text: 'No',  callbackData: 'no'  },
      ],
    })
    expect(mockSendMessage).toHaveBeenCalledWith(
      '111',
      expect.any(String),
      expect.objectContaining({ reply_markup: expect.any(Object) }),
    )
  })

  it('send() cuando bot === null → no lanza, solo warn', async () => {
    // No inicializar el adapter — bot es null
    await expect(
      adapter.send({ externalId: '000', text: 'test' }),
    ).resolves.not.toThrow()
  })

  // ── sendTyping() ────────────────────────────────────────────────────

  it('sendTyping() → llama sendChatAction con "typing"', async () => {
    await adapter.initialize('cfg-tg-1')
    await adapter.sendTyping('777')
    expect(mockSendChatAction).toHaveBeenCalledWith('777', 'typing')
  })

  it('callback_query siempre llama answerCallbackQuery aunque emit() falle', async () => {
    await adapter.initialize('cfg-tg-1')
    adapter.onMessage(async () => {
      throw new Error('boom')
    })

    const answerCallbackQuery = vi.fn().mockResolvedValue(true)

    const handler = registeredHandlers.get('callback_query:data')!
    await expect(handler({
      update: { update_id: 222 },
      callbackQuery: {
        id: 'cq-1',
        from: { id: 777 },
        data: 'pressed',
        message: { chat: { id: 888 } },
      },
      answerCallbackQuery,
    })).rejects.toThrow('boom')

    expect(answerCallbackQuery).toHaveBeenCalledOnce()
  })

  // ── dispose() ─────────────────────────────────────────────────────────────

  it('dispose() en modo polling → llama bot.stop()', async () => {
    await adapter.initialize('cfg-tg-1') // long polling (webhookUrl vacío)
    await adapter.dispose()
    expect(mockBotStop).toHaveBeenCalledOnce()
  })

  it('dispose() en modo webhook → llama deleteWebhook()', async () => {
    mockConfig.credentials = {
      botToken:   'FAKE_TOKEN:test',
      webhookUrl: 'https://agents.example.com',
    } as any
    await adapter.initialize('cfg-tg-1')
    await adapter.dispose()
    expect(mockDeleteWebhook).toHaveBeenCalledOnce()
    expect(mockBotStop).not.toHaveBeenCalled()
  })

  // ── escapeMarkdownV2() ───────────────────────────────────────────────────

  it('escapeMarkdownV2() escapa caracteres especiales de Telegram MarkdownV2', () => {
    expect(escapeMarkdownV2('Hello (world) [test] #tag!')).toBe(
      'Hello \\(world\\) \\[test\\] \\#tag\\!'
    )
    expect(escapeMarkdownV2('1+1=2 | value.field')).toBe(
      '1\\+1\\=2 \\| value\\.field'
    )
  })
})
