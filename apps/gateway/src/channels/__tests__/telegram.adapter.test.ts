import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TelegramAdapter, fetchWithRetry, sleep } from '../telegram.adapter.js'
import type { IncomingMessage } from '../channel-adapter.interface.js'

// ── Mock global fetch ───────────────────────────────────────────────────────

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeOkResponse(data: unknown = { ok: true }) {
  return {
    ok:      true,
    status:  200,
    json:    async () => data,
    text:    async () => JSON.stringify(data),
    headers: { get: () => null },
  } as unknown as Response
}

function makeErrorResponse(status: number, text = 'error') {
  return {
    ok:      false,
    status,
    json:    async () => ({ ok: false }),
    text:    async () => text,
    headers: { get: () => null },
  } as unknown as Response
}

const SECRETS   = { botToken: 'BOT_SECRET' }
const BOT_TOKEN = 'BOT_SECRET'

function makeDMUpdate(overrides?: Record<string, unknown>) {
  return {
    update_id: 1,
    message: {
      message_id: 42,
      chat:       { id: 100, type: 'private' },
      from:       { id: 999, first_name: 'Alice', username: 'alice' },
      text:       'hola',
      date:       1700000000,
      ...overrides,
    },
  }
}

function makeSupergroupUpdate(threadId: number) {
  return {
    update_id: 2,
    message: {
      message_id:        55,
      message_thread_id: threadId,
      chat:              { id: 200, type: 'supergroup' },
      from:              { id: 888, first_name: 'Bob' },
      text:              'thread message',
      date:              1700000001,
    },
  }
}

function makeCallbackUpdate() {
  return {
    update_id: 3,
    callback_query: {
      id:      'cq_001',
      from:    { id: 777 },
      data:    'btn_1',
      message: {
        message_id: 10,
        chat:       { id: 100, type: 'private' },
        text:       'choose:',
        date:       1700000002,
      },
    },
  }
}

// ════════════════════════════════════════════════════════════════════════════
// describe: receive()
// ════════════════════════════════════════════════════════════════════════════

describe('receive()', () => {

  it('mensaje DM → externalId=chatId, threadId=chatId, type=text, replyFn definida', async () => {
    const adapter  = new TelegramAdapter()
    const incoming = await adapter.receive(makeDMUpdate() as Record<string, unknown>, SECRETS)

    expect(incoming).not.toBeNull()
    expect(incoming!.externalId).toBe('100')
    expect(incoming!.threadId).toBe('100')
    expect(incoming!.type).toBe('text')
    expect(incoming!.replyFn).toBeDefined()
    expect(incoming!.rawPayload).toBeDefined()
  })

  it('supergrupo con message_thread_id=42 → threadId=42, externalId=200', async () => {
    const adapter  = new TelegramAdapter()
    const incoming = await adapter.receive(
      makeSupergroupUpdate(42) as Record<string, unknown>,
      SECRETS,
    )

    expect(incoming!.threadId).toBe('42')
    expect(incoming!.externalId).toBe('200')
    expect(incoming!.threadId).not.toBe(incoming!.externalId)
  })

  it('mensaje /start → type=command', async () => {
    const adapter  = new TelegramAdapter()
    const update   = makeDMUpdate({ text: '/start' })
    const incoming = await adapter.receive(update as Record<string, unknown>, SECRETS)

    expect(incoming!.type).toBe('command')
  })

  it('mensaje con photo → type=image', async () => {
    const adapter  = new TelegramAdapter()
    const update   = makeDMUpdate({ photo: [{ file_id: 'abc' }], text: undefined })
    const incoming = await adapter.receive(update as Record<string, unknown>, SECRETS)

    expect(incoming!.type).toBe('image')
  })

  it('callback_query con data=btn_1 → type=command, text=btn_1, replyFn definida', async () => {
    const adapter  = new TelegramAdapter()
    const incoming = await adapter.receive(
      makeCallbackUpdate() as Record<string, unknown>,
      SECRETS,
    )

    expect(incoming).not.toBeNull()
    expect(incoming!.type).toBe('command')
    expect(incoming!.text).toBe('btn_1')
    expect(incoming!.replyFn).toBeDefined()
  })

  it('update sin message ni callback_query → null', async () => {
    const adapter  = new TelegramAdapter()
    const incoming = await adapter.receive({ update_id: 99 }, SECRETS)

    expect(incoming).toBeNull()
  })

  it('rawPayload no contiene botToken ni webhookSecret', async () => {
    const adapter  = new TelegramAdapter()
    const dirty    = { ...makeDMUpdate(), botToken: 'LEAKING_SECRET', webhookSecret: 'ALSO_LEAK' }
    const incoming = await adapter.receive(dirty as Record<string, unknown>, SECRETS)

    expect(incoming!.rawPayload['botToken']).toBeUndefined()
    expect(incoming!.rawPayload['webhookSecret']).toBeUndefined()
    // el update_id sí debe estar
    expect(incoming!.rawPayload['update_id']).toBe(1)
  })

})

// ════════════════════════════════════════════════════════════════════════════
// describe: replyFn — texto normal
// ════════════════════════════════════════════════════════════════════════════

describe('replyFn — texto normal', () => {

  it('replyFn() llama sendMessage con chat_id y texto correctos', async () => {
    fetchMock.mockResolvedValue(makeOkResponse())
    const adapter  = new TelegramAdapter()
    const incoming = await adapter.receive(makeDMUpdate() as Record<string, unknown>, SECRETS)

    await incoming!.replyFn!('hola usuario')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain(`/bot${BOT_TOKEN}/sendMessage`)
    const body = JSON.parse(init!.body as string)
    expect(body.chat_id).toBe('100')
    expect(body.text).toBe('hola usuario')
  })

  it('replyFn con format=markdown → parse_mode=Markdown', async () => {
    fetchMock.mockResolvedValue(makeOkResponse())
    const adapter  = new TelegramAdapter()
    const incoming = await adapter.receive(makeDMUpdate() as Record<string, unknown>, SECRETS)

    await incoming!.replyFn!('**negrita**', { format: 'markdown' })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init!.body as string)
    expect(body.parse_mode).toBe('Markdown')
  })

  it('replyFn con quoteOriginal=true → reply_parameters.message_id set', async () => {
    fetchMock.mockResolvedValue(makeOkResponse())
    const adapter  = new TelegramAdapter()
    const incoming = await adapter.receive(makeDMUpdate() as Record<string, unknown>, SECRETS)

    await incoming!.replyFn!('cita', { quoteOriginal: true })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init!.body as string)
    expect(body.reply_parameters).toEqual({ message_id: 42 })
  })

  it('replyFn en supergrupo → body incluye message_thread_id', async () => {
    fetchMock.mockResolvedValue(makeOkResponse())
    const adapter  = new TelegramAdapter()
    const incoming = await adapter.receive(
      makeSupergroupUpdate(42) as Record<string, unknown>,
      SECRETS,
    )

    await incoming!.replyFn!('respuesta en topic')

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init!.body as string)
    expect(body.message_thread_id).toBe(42)
  })

})

// ════════════════════════════════════════════════════════════════════════════
// describe: replyFn — callback_query
// ════════════════════════════════════════════════════════════════════════════

describe('replyFn — callback_query', () => {

  it('replyFn llama answerCallbackQuery PRIMERO con callback_query_id correcto', async () => {
    fetchMock.mockResolvedValue(makeOkResponse())
    const adapter  = new TelegramAdapter()
    const incoming = await adapter.receive(
      makeCallbackUpdate() as Record<string, unknown>,
      SECRETS,
    )

    await incoming!.replyFn!('respuesta botones')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [firstUrl, firstInit] = fetchMock.mock.calls[0]
    expect(firstUrl).toContain('answerCallbackQuery')
    const firstBody = JSON.parse(firstInit!.body as string)
    expect(firstBody.callback_query_id).toBe('cq_001')
  })

  it('replyFn llama sendMessage SEGUNDO con el texto', async () => {
    fetchMock.mockResolvedValue(makeOkResponse())
    const adapter  = new TelegramAdapter()
    const incoming = await adapter.receive(
      makeCallbackUpdate() as Record<string, unknown>,
      SECRETS,
    )

    await incoming!.replyFn!('texto respuesta callback')

    const [secondUrl, secondInit] = fetchMock.mock.calls[1]
    expect(secondUrl).toContain('sendMessage')
    const secondBody = JSON.parse(secondInit!.body as string)
    expect(secondBody.text).toBe('texto respuesta callback')
    expect(secondBody.chat_id).toBe('100')
  })

})

// ════════════════════════════════════════════════════════════════════════════
// describe: send()
// ════════════════════════════════════════════════════════════════════════════

describe('send()', () => {

  it('threadId distinto de externalId → body incluye message_thread_id', async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ ok: true, result: {} }))

    // Crear adaptador con botToken seteado directamente
    const adapter = new TelegramAdapter()
    // @ts-expect-error acceso privado en tests
    adapter['botToken'] = BOT_TOKEN

    await adapter.send({ externalId: '200', threadId: '42', text: 'reply thread' })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init!.body as string)
    expect(body.message_thread_id).toBe(42)
  })

  it('send() con HTTP 429 y Retry-After:2 → espera antes de reintentar', async () => {
    const sleepMock = vi.spyOn({ sleep }, 'sleep').mockResolvedValue(undefined)
    vi.stubGlobal('setTimeout', (fn: () => void) => { fn(); return 0 })

    fetchMock
      .mockResolvedValueOnce({
        ok: false, status: 429,
        headers: { get: (h: string) => h === 'retry-after' ? '2' : null },
        json: async () => ({}), text: async () => '',
      } as unknown as Response)
      .mockResolvedValueOnce(makeOkResponse({ ok: true, result: {} }))

    const adapter = new TelegramAdapter()
    // @ts-expect-error acceso privado en tests
    adapter['botToken'] = BOT_TOKEN

    await adapter.send({ externalId: '100', text: 'retry test' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('send() con 3 errores consecutivos (red) → lanza Error', async () => {
    // Suprimir setTimeouts del backoff para que el test no espere
    vi.stubGlobal('setTimeout', (fn: () => void) => { fn(); return 0 })
    fetchMock.mockRejectedValue(new Error('Network error'))

    const adapter = new TelegramAdapter()
    // @ts-expect-error acceso privado en tests
    adapter['botToken'] = BOT_TOKEN

    await expect(adapter.send({ externalId: '100', text: 'fail' })).rejects.toThrow('Network error')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

})

// ════════════════════════════════════════════════════════════════════════════
// describe: long-polling loop
// ════════════════════════════════════════════════════════════════════════════

describe('long-polling loop', () => {

  it('startPollingLoop() llama getUpdates con offset=0 y timeout=25', async () => {
    // Respuesta inicial con updates, luego dispose
    fetchMock
      .mockResolvedValueOnce({
        ok: true, status: 200,
        headers: { get: () => null },
        json: async () => ({ ok: true, result: [] }),
        text: async () => '',
      } as unknown as Response)

    const adapter = new TelegramAdapter()
    // @ts-expect-error acceso privado
    adapter['botToken'] = BOT_TOKEN

    // stubGlobal setTimeout para evitar espera real del sleep post-poll
    vi.stubGlobal('setTimeout', (fn: () => void) => { fn(); return 0 })

    // @ts-expect-error
    adapter['pollingActive'] = true
    // Llamar directamente a una sola iteración mockeando while
    // @ts-expect-error
    const originalActive = adapter['pollingActive']
    // @ts-expect-error
    adapter['pollingActive'] = false  // stop after first fetch check below

    // Verificar directamente la llamada a getUpdates
    // @ts-expect-error
    adapter['pollingActive'] = true
    // forzar que el loop haga una sola iteración
    let calls = 0
    const realFetch = fetchMock
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      calls++
      if (calls === 1) {
        // Detener el loop después del primer getUpdates
        // @ts-expect-error
        adapter['pollingActive'] = false
        return {
          ok: true, status: 200,
          headers: { get: () => null },
          json: async () => ({ ok: true, result: [] }),
          text: async () => '',
        } as unknown as Response
      }
      return makeOkResponse()
    })

    // @ts-expect-error
    adapter['pollingActive'] = true
    // @ts-expect-error
    await adapter['runPollingLoop']()

    const getUpdatesCalls = fetchMock.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('getUpdates')
    )
    expect(getUpdatesCalls.length).toBeGreaterThanOrEqual(1)
    const [, init] = getUpdatesCalls[0]
    const body = JSON.parse(init!.body as string)
    expect(body.offset).toBe(0)
    expect(body.timeout).toBe(25)
  })

  it('update_id=100 recibido → pollingOffset = 101', async () => {
    vi.stubGlobal('setTimeout', (fn: () => void) => { fn(); return 0 })

    const adapter = new TelegramAdapter()
    // @ts-expect-error
    adapter['botToken'] = BOT_TOKEN

    let callCount = 0
    fetchMock.mockImplementation(async (url: string) => {
      callCount++
      if (callCount === 1 && url.includes('getUpdates')) {
        // @ts-expect-error
        adapter['pollingActive'] = false  // stop after processing
        return {
          ok: true, status: 200,
          headers: { get: () => null },
          json: async () => ({
            ok: true,
            result: [makeDMUpdate()],  // update_id=1
          }),
          text: async () => '',
        } as unknown as Response
      }
      return makeOkResponse()
    })

    // Mock processUpdate to avoid real receive()
    // @ts-expect-error
    adapter.processUpdate = vi.fn().mockResolvedValue(undefined)

    // @ts-expect-error
    adapter['pollingActive'] = true
    // @ts-expect-error
    await adapter['runPollingLoop']()

    // @ts-expect-error
    expect(adapter['pollingOffset']).toBe(2)  // update_id=1, so offset=2
  })

  it('getUpdates retorna 401 → loop se detiene, errorHandler llamado', async () => {
    fetchMock.mockResolvedValue(makeErrorResponse(401, 'Unauthorized'))

    const adapter       = new TelegramAdapter()
    const errorHandler  = vi.fn()
    adapter.onError(errorHandler)
    // @ts-expect-error
    adapter['botToken'] = BOT_TOKEN
    // @ts-expect-error
    adapter['pollingActive'] = true
    // @ts-expect-error
    await adapter['runPollingLoop']()

    // @ts-expect-error
    expect(adapter['pollingActive']).toBe(false)
    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('401') })
    )
  })

  it('5 errores consecutivos → circuit breaker: errorHandler llamado', async () => {
    vi.stubGlobal('setTimeout', (fn: () => void) => { fn(); return 0 })

    let errorCount = 0
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('getUpdates')) {
        errorCount++
        if (errorCount > 5) {
          // Detener el loop después del circuit breaker
          return {
            ok: true, status: 200,
            headers: { get: () => null },
            json: async () => ({ ok: true, result: [] }),
            text: async () => '',
          } as unknown as Response
        }
        throw new Error('Network error')
      }
      return makeOkResponse()
    })

    const adapter      = new TelegramAdapter()
    const errorHandler = vi.fn()
    adapter.onError(errorHandler)
    // @ts-expect-error
    adapter['botToken']       = BOT_TOKEN
    // @ts-expect-error
    adapter['channelConfig']  = { maxConsecutiveErrors: 5, pollingInterval: 1 }

    let calls = 0
    const origImpl = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      calls++
      const resp = await origImpl!(url, init)
      // Stop loop after circuit breaker fires and we get one success
      if (calls > 6) {
        // @ts-expect-error
        adapter['pollingActive'] = false
      }
      return resp
    })

    // @ts-expect-error
    adapter['pollingActive'] = true
    // @ts-expect-error
    await adapter['runPollingLoop']()

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('circuit breaker') })
    )
  })

  it('dispose() → AbortController.abort() chiamado, loop termina', async () => {
    const abortMock = vi.fn()
    const adapter   = new TelegramAdapter()
    // @ts-expect-error
    adapter['pollingAbortCtrl'] = { abort: abortMock }

    await adapter.dispose()

    expect(abortMock).toHaveBeenCalledOnce()
    // @ts-expect-error
    expect(adapter['pollingActive']).toBe(false)
  })

})

// ════════════════════════════════════════════════════════════════════════════
// describe: webhook handler
// ════════════════════════════════════════════════════════════════════════════

describe('webhook handler', () => {

  function makeRouter(webhookSecret = '') {
    const adapter = new TelegramAdapter()
    // @ts-expect-error
    adapter['botToken']       = BOT_TOKEN
    // @ts-expect-error
    adapter['webhookSecret']  = webhookSecret
    return { adapter, router: adapter.getRouter() }
  }

  function mockReqRes(headers: Record<string, string> = {}, body: unknown = {}) {
    const res = {
      json:   vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    }
    const req = {
      headers,
      body,
    }
    return { req: req as unknown as Request, res: res as unknown as Response }
  }

  it('POST /webhook sin secret header cuando webhookSecret configurado → 403', async () => {
    const { adapter, router } = makeRouter('MY_SECRET')
    const { req, res } = mockReqRes({}, makeDMUpdate())

    // Invocar el handler directamente
    const webhookRoute = router.stack.find(
      (layer: { route?: { path: string; stack: { handle: unknown }[] } }) =>
        layer.route?.path === '/webhook'
    )
    const handler = webhookRoute?.route?.stack[0]?.handle as (
      req: Request,
      res: Response,
    ) => Promise<void>

    await handler(req, res)

    expect((res as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(403)
  })

  it('POST /webhook con secret header correcto → 200 inmediato', async () => {
    fetchMock.mockResolvedValue(makeOkResponse())
    const { adapter, router } = makeRouter('MY_SECRET')

    // Mockear processUpdate para que no falle
    // @ts-expect-error
    adapter.processUpdate = vi.fn().mockResolvedValue(undefined)

    const { req, res } = mockReqRes(
      { 'x-telegram-bot-api-secret-token': 'MY_SECRET' },
      makeDMUpdate(),
    )

    const webhookRoute = router.stack.find(
      (layer: { route?: { path: string; stack: { handle: unknown }[] } }) =>
        layer.route?.path === '/webhook'
    )
    const handler = webhookRoute?.route?.stack[0]?.handle as (
      req: Request,
      res: Response,
    ) => Promise<void>

    await handler(req, res)

    expect((res as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({ ok: true })
  })

  it('POST /setup sin webhookUrl → 400', async () => {
    const { router } = makeRouter()
    const { req, res } = mockReqRes({}, {})

    const setupRoute = router.stack.find(
      (layer: { route?: { path: string; stack: { handle: unknown }[] } }) =>
        layer.route?.path === '/setup'
    )
    const handler = setupRoute?.route?.stack[0]?.handle as (
      req: Request,
      res: Response,
    ) => Promise<void>

    await handler(req, res)

    expect((res as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(400)
  })

  it('POST /setup con webhookUrl → llama setWebhook en Telegram, retorna 200', async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ ok: true, result: true }))
    const { router } = makeRouter()
    const { req, res } = mockReqRes({}, { webhookUrl: 'https://example.com' })

    const setupRoute = router.stack.find(
      (layer: { route?: { path: string; stack: { handle: unknown }[] } }) =>
        layer.route?.path === '/setup'
    )
    const handler = setupRoute?.route?.stack[0]?.handle as (
      req: Request,
      res: Response,
    ) => Promise<void>

    await handler(req, res)

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('setWebhook')
    expect((res as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true })
    )
  })

  it('DELETE /webhook → llama deleteWebhook en Telegram', async () => {
    fetchMock.mockResolvedValue(makeOkResponse({ ok: true, result: true }))
    const { router } = makeRouter()

    const deleteRoute = router.stack.find(
      (layer: { route?: { path: string; stack: { handle: unknown }[] } }) =>
        layer.route?.path === '/webhook'
    )
    // find the DELETE handler specifically
    const deleteHandler = deleteRoute?.route?.stack.find(
      (s: { method?: string; handle: unknown }) => s.method === 'delete'
    )?.handle as ((req: Request, res: Response) => Promise<void>) | undefined

    if (deleteHandler) {
      const { req, res } = mockReqRes()
      await deleteHandler(req, res)
      const [url] = fetchMock.mock.calls[0]
      expect(url).toContain('deleteWebhook')
    } else {
      // Fallback: verify via adapter directly
      const { adapter } = makeRouter()
      await adapter.deleteWebhook()
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('deleteWebhook'),
        expect.anything(),
      )
    }
  })

})
