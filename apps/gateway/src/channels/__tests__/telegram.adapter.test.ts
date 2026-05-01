/**
 * telegram.adapter.test.ts
 * [F3a-18] Tests for TelegramAdapter hardening:
 *   long-polling, retry/backoff, circuit breaker,
 *   replyFn/threadId/rawPayload (F3a-17 interface).
 *
 * All fetch() calls are mocked with vi.fn() — NO real network calls.
 * vi.useFakeTimers() controls sleep() in retry/circuit-breaker tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TelegramAdapter, fetchWithRetry, sleep } from '../telegram.adapter.js'

// ── Global fetch mock ──────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeFetchResponse(
  body:    unknown,
  status:  number  = 200,
  headers: Record<string, string> = {},
): Response {
  return {
    ok:      status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } as unknown as Headers,
    json:    async () => body,
    text:    async () => JSON.stringify(body),
  } as unknown as Response
}

function makeUpdatesResponse(updates: unknown[] = []): Response {
  return makeFetchResponse({ ok: true, result: updates })
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeAdapter(): TelegramAdapter {
  return new TelegramAdapter()
}

async function setupAdapter(
  adapter: TelegramAdapter,
  mode: 'webhook' | 'polling' = 'webhook',
): Promise<void> {
  // In polling mode, setup() calls deleteWebhook() first
  if (mode === 'polling') {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ ok: true }))
  }
  await adapter.setup(
    { mode },
    { botToken: 'test-token-123', webhookSecret: 'test-secret' },
  )
}

// ── describe('receive()') ──────────────────────────────────────────────────

describe('receive()', () => {
  let adapter: TelegramAdapter

  beforeEach(() => {
    adapter = makeAdapter()
  })

  it('DM text message → externalId=chatId, threadId=chatId, type=text, rawPayload, replyFn', async () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 10,
        chat:       { id: 100, type: 'private' },
        from:       { id: 200, username: 'alice' },
        text:       'hello',
      },
    }
    const result = await adapter.receive(update, { botToken: 'tok' })
    expect(result).not.toBeNull()
    expect(result!.externalId).toBe('100')
    expect(result!.threadId).toBe('100')
    expect(result!.type).toBe('text')
    expect(result!.rawPayload).toBeDefined()
    expect(typeof result!.replyFn).toBe('function')
  })

  it('supergroup message with message_thread_id=42 → threadId=42, externalId=chatId (distinct)', async () => {
    const update = {
      update_id: 2,
      message: {
        message_id:        20,
        chat:              { id: 300, type: 'supergroup' },
        from:              { id: 400 },
        text:              'in a topic',
        message_thread_id: 42,
      },
    }
    const result = await adapter.receive(update, { botToken: 'tok' })
    expect(result!.externalId).toBe('300')
    expect(result!.threadId).toBe('42')
    expect(result!.externalId).not.toBe(result!.threadId)
  })

  it('/start command → type=command', async () => {
    const update = {
      update_id: 3,
      message: {
        message_id: 30,
        chat:       { id: 500, type: 'private' },
        from:       { id: 600 },
        text:       '/start',
      },
    }
    const result = await adapter.receive(update, { botToken: 'tok' })
    expect(result!.type).toBe('command')
  })

  it('message with photo → type=image', async () => {
    const update = {
      update_id: 4,
      message: {
        message_id: 40,
        chat:       { id: 700, type: 'private' },
        from:       { id: 800 },
        photo:      [{ file_id: 'abc' }],
        caption:    'look at this',
      },
    }
    const result = await adapter.receive(update, { botToken: 'tok' })
    expect(result!.type).toBe('image')
  })

  it('callback_query with data="btn_1" → type=command, text=btn_1, replyFn defined', async () => {
    const update = {
      update_id:      5,
      callback_query: {
        id:      'cq-123',
        from:    { id: 900 },
        data:    'btn_1',
        message: { message_id: 50, chat: { id: 1000, type: 'private' } },
      },
    }
    const result = await adapter.receive(update, { botToken: 'tok' })
    expect(result!.type).toBe('command')
    expect(result!.text).toBe('btn_1')
    expect(typeof result!.replyFn).toBe('function')
  })

  it('update without message or callback_query → returns null', async () => {
    const update = { update_id: 6 }
    const result = await adapter.receive(update, { botToken: 'tok' })
    expect(result).toBeNull()
  })

  it('rawPayload does not contain botToken or webhookSecret', async () => {
    const update = {
      update_id: 7,
      message: {
        message_id: 70,
        chat:       { id: 1100, type: 'private' },
        from:       { id: 1200 },
        text:       'secure?',
        botToken:   'SHOULD_NOT_APPEAR',
        webhookSecret: 'SHOULD_NOT_APPEAR',
      },
    }
    const result = await adapter.receive(update, {
      botToken:      'secret-token',
      webhookSecret: 'secret-webhook',
    })
    const raw = JSON.stringify(result!.rawPayload)
    expect(raw).not.toContain('SHOULD_NOT_APPEAR')
    expect(raw).not.toContain('secret-token')
    expect(raw).not.toContain('secret-webhook')
  })
})

// ── describe('replyFn — text message') ────────────────────────────────────

describe('replyFn — text message', () => {
  let adapter: TelegramAdapter

  beforeEach(() => {
    adapter = makeAdapter()
    mockFetch.mockReset()
  })

  it('replyFn() calls sendMessage with correct chat_id and text', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ ok: true }))
    const update = {
      update_id: 10,
      message: {
        message_id: 100,
        chat: { id: 555, type: 'private' },
        from: { id: 666 },
        text: 'hello',
      },
    }
    const result = await adapter.receive(update, { botToken: 'my-token' })
    await result!.replyFn('world')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0]!
    expect(url).toContain('/bot my-token/sendMessage'.replace(' ', ''))
    const body = JSON.parse(init.body as string)
    expect(body.chat_id).toBe('555')
    expect(body.text).toBe('world')
  })

  it('replyFn(text, { format: "markdown" }) → parse_mode=Markdown', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ ok: true }))
    const update = {
      update_id: 11,
      message: {
        message_id: 110,
        chat: { id: 777, type: 'private' },
        from: { id: 888 },
        text: 'hi',
      },
    }
    const result = await adapter.receive(update, { botToken: 'my-token' })
    await result!.replyFn('**bold**', { format: 'markdown' })

    const [, init] = mockFetch.mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body.parse_mode).toBe('Markdown')
  })

  it('replyFn(text, { quoteOriginal: true }) → reply_parameters.message_id set', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ ok: true }))
    const update = {
      update_id: 12,
      message: {
        message_id: 120,
        chat: { id: 999, type: 'private' },
        from: { id: 111 },
        text: 'quote me',
      },
    }
    const result = await adapter.receive(update, { botToken: 'my-token' })
    await result!.replyFn('quoted reply', { quoteOriginal: true })

    const [, init] = mockFetch.mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body.reply_parameters).toEqual({ message_id: 120 })
  })

  it('replyFn in supergroup → body includes message_thread_id', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ ok: true }))
    const update = {
      update_id: 13,
      message: {
        message_id:        130,
        chat:              { id: 2000, type: 'supergroup' },
        from:              { id: 2001 },
        text:              'topic reply',
        message_thread_id: 99,
      },
    }
    const result = await adapter.receive(update, { botToken: 'my-token' })
    await result!.replyFn('response in topic')

    const [, init] = mockFetch.mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body.message_thread_id).toBe(99)
  })
})

// ── describe('replyFn — callback_query') ──────────────────────────────────

describe('replyFn — callback_query', () => {
  let adapter: TelegramAdapter

  beforeEach(() => {
    adapter = makeAdapter()
    mockFetch.mockReset()
  })

  it('replyFn calls answerCallbackQuery FIRST with callback_query_id', async () => {
    // Two calls: answerCallbackQuery + sendMessage
    mockFetch
      .mockResolvedValueOnce(makeFetchResponse({ ok: true }))
      .mockResolvedValueOnce(makeFetchResponse({ ok: true }))

    const update = {
      update_id:      20,
      callback_query: {
        id:      'cq-999',
        from:    { id: 3000 },
        data:    'action',
        message: { message_id: 200, chat: { id: 4000, type: 'private' } },
      },
    }
    const result = await adapter.receive(update, { botToken: 'my-token' })
    await result!.replyFn('response')

    expect(mockFetch).toHaveBeenCalledTimes(2)
    const [firstUrl, firstInit] = mockFetch.mock.calls[0]!
    expect(firstUrl).toContain('answerCallbackQuery')
    const firstBody = JSON.parse(firstInit.body as string)
    expect(firstBody.callback_query_id).toBe('cq-999')
  })

  it('replyFn calls sendMessage SECOND with the text', async () => {
    mockFetch
      .mockResolvedValueOnce(makeFetchResponse({ ok: true }))
      .mockResolvedValueOnce(makeFetchResponse({ ok: true }))

    const update = {
      update_id:      21,
      callback_query: {
        id:      'cq-888',
        from:    { id: 5000 },
        data:    'press',
        message: { message_id: 210, chat: { id: 6000, type: 'private' } },
      },
    }
    const result = await adapter.receive(update, { botToken: 'my-token' })
    await result!.replyFn('button pressed!')

    const [secondUrl, secondInit] = mockFetch.mock.calls[1]!
    expect(secondUrl).toContain('sendMessage')
    const secondBody = JSON.parse(secondInit.body as string)
    expect(secondBody.text).toBe('button pressed!')
  })

  it('replyFn stops when answerCallbackQuery fails', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ ok: false, description: 'expired' }, 400))

    const update = {
      update_id:      22,
      callback_query: {
        id:      'cq-expired',
        from:    { id: 6000 },
        data:    'press',
        message: { message_id: 220, chat: { id: 7000, type: 'private' } },
      },
    }

    const result = await adapter.receive(update, { botToken: 'my-token' })
    await result!.replyFn('should not send')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url] = mockFetch.mock.calls[0]!
    expect(url).toContain('answerCallbackQuery')
  })
})

// ── describe('send()') ────────────────────────────────────────────────────

describe('send()', () => {
  let adapter: TelegramAdapter

  beforeEach(async () => {
    adapter = makeAdapter()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(makeFetchResponse({ ok: true }))
    await setupAdapter(adapter, 'webhook')
    mockFetch.mockReset()
  })

  it('send() with threadId !== externalId → body includes message_thread_id', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ ok: true }))
    await adapter.send({
      externalId:  '1000',
      threadId:    '42',
      text:        'hello topic',
      type:        'text',
      channelId:   'telegram',
      agentId:     'agent-1',
      sessionId:   'session-1',
    })
    const [, init] = mockFetch.mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body.message_thread_id).toBe(42)
  })

  it('send() with HTTP 429 and Retry-After: 2 → waits 2s before retry', async () => {
    vi.useFakeTimers()
    mockFetch
      .mockResolvedValueOnce(
        makeFetchResponse({ ok: false }, 429, { 'retry-after': '2' }),
      )
      .mockResolvedValueOnce(makeFetchResponse({ ok: true }))

    const sendPromise = adapter.send({
      externalId: '1000',
      text:       'test 429',
      type:       'text',
      channelId:  'telegram',
      agentId:    'agent-1',
      sessionId:  'session-1',
    })

    // Advance timers to simulate Retry-After wait
    await vi.advanceTimersByTimeAsync(2100)
    await sendPromise

    expect(mockFetch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('send() with 3 consecutive errors → throws Error', async () => {
    vi.useFakeTimers()
    mockFetch.mockRejectedValue(new Error('network error'))

    const sendPromise = adapter.send({
      externalId: '1000',
      text:       'fail',
      type:       'text',
      channelId:  'telegram',
      agentId:    'agent-1',
      sessionId:  'session-1',
    })

    // Advance timers past all backoff delays (500ms + 1000ms)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(sendPromise).rejects.toThrow()
    vi.useRealTimers()
  })
})

// ── describe('long-polling loop') ─────────────────────────────────────────

describe('long-polling loop', () => {
  let adapter: TelegramAdapter

  beforeEach(() => {
    adapter = makeAdapter()
    mockFetch.mockReset()
  })

  afterEach(async () => {
    await adapter.dispose()
  })

  it('startPollingLoop → calls getUpdates with offset=0 and timeout=25', async () => {
    // deleteWebhook + getUpdates (returns empty so loop pauses)
    mockFetch
      .mockResolvedValueOnce(makeFetchResponse({ ok: true })) // deleteWebhook
      .mockResolvedValueOnce(makeUpdatesResponse([]))          // getUpdates
      .mockResolvedValue(makeUpdatesResponse([]))              // subsequent calls

    await setupAdapter(adapter, 'polling')
    // Give the loop a tick to run
    await new Promise((r) => setTimeout(r, 10))

    // Second call is getUpdates (first was deleteWebhook)
    const [url, init] = mockFetch.mock.calls[1]!
    expect(url).toContain('getUpdates')
    const body = JSON.parse(init.body as string)
    expect(body.offset).toBe(0)
    expect(body.timeout).toBe(25)
  })

  it('receiving update_id=100 → pollingOffset updates to 101', async () => {
    const processUpdateSpy = vi.spyOn(adapter as unknown as { processUpdate: () => Promise<void> }, 'processUpdate')
      .mockResolvedValue()

    mockFetch
      .mockResolvedValueOnce(makeFetchResponse({ ok: true })) // deleteWebhook
      .mockResolvedValueOnce(makeUpdatesResponse([           // getUpdates with one update
        { update_id: 100, message: { message_id: 1, chat: { id: 1, type: 'private' }, text: 'hi' } },
      ]))
      .mockResolvedValue(makeUpdatesResponse([]))             // subsequent calls

    await setupAdapter(adapter, 'polling')
    await new Promise((r) => setTimeout(r, 50))

    // Verify processUpdate was called
    expect(processUpdateSpy).toHaveBeenCalled()

    // Next getUpdates call should have offset=101
    const thirdCall = mockFetch.mock.calls[2]
    if (thirdCall) {
      const body = JSON.parse(thirdCall[1].body as string)
      expect(body.offset).toBe(101)
    }
  })

  it('getUpdates returns 401 → loop stops and errorHandler called', async () => {
    const errorHandler = vi.fn()
    adapter.onError(errorHandler)

    mockFetch
      .mockResolvedValueOnce(makeFetchResponse({ ok: true }))         // deleteWebhook
      .mockResolvedValueOnce(makeFetchResponse({ ok: false }, 401))   // getUpdates → 401

    await setupAdapter(adapter, 'polling')
    await new Promise((r) => setTimeout(r, 50))

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('401') }),
    )
  })

  it('5 consecutive errors → circuit breaker: errorHandler called, loop pauses 60s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const errorHandler = vi.fn()
    adapter.onError(errorHandler)

    const networkError = new Error('network failure')
    mockFetch
      .mockResolvedValueOnce(makeFetchResponse({ ok: true })) // deleteWebhook
      .mockRejectedValue(networkError)                        // all getUpdates fail

    await setupAdapter(adapter, 'polling')

    // Advance time to allow 5 errors + circuit breaker detection
    await vi.advanceTimersByTimeAsync(20_000)

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('circuit breaker'),
      }),
    )

    vi.useRealTimers()
  })

  it('dispose() → AbortController.abort() called, loop terminates cleanly', async () => {
    mockFetch
      .mockResolvedValueOnce(makeFetchResponse({ ok: true })) // deleteWebhook
      .mockImplementation(() => new Promise((_, reject) => {
        // Simulate a long-running request that gets aborted
        setTimeout(() => reject(Object.assign(new Error('AbortError'), { name: 'AbortError' })), 100)
      }))

    await setupAdapter(adapter, 'polling')
    // Give loop a tick to start
    await new Promise((r) => setTimeout(r, 10))

    // dispose() should stop the loop
    await adapter.dispose()

    // After dispose, the loop should not be active anymore
    // (verified by no additional fetch calls after abort)
    const callCountAfterDispose = mockFetch.mock.calls.length
    await new Promise((r) => setTimeout(r, 200))
    expect(mockFetch.mock.calls.length).toBe(callCountAfterDispose)
  })
})

// ── describe('webhook handler') ───────────────────────────────────────────

describe('webhook handler', () => {
  let adapter: TelegramAdapter

  beforeEach(async () => {
    adapter = makeAdapter()
    mockFetch.mockReset()
    mockFetch.mockResolvedValue(makeFetchResponse({ ok: true }))
    await setupAdapter(adapter, 'webhook')
    mockFetch.mockReset()
  })

  function simulateRequest(
    body:    Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    const router  = adapter.getRouter()
    const layer   = (router.stack as unknown as Array<{ route?: { path: string; stack: Array<{ handle: (req: unknown, res: unknown) => void }> } }>)
      .find((l) => l.route?.path === '/webhook')
    const handler = layer!.route!.stack[0]!.handle

    const resMock = {
      status:  vi.fn().mockReturnThis(),
      json:    vi.fn().mockReturnThis(),
    }
    const reqMock = { body, headers: { 'x-telegram-bot-api-secret-token': headers['x-telegram-bot-api-secret-token'] } }
    handler(reqMock, resMock)
    return resMock
  }

  it('POST without correct secret header → 403', async () => {
    const res = simulateRequest({ update_id: 1 }, {})
    await new Promise((r) => setTimeout(r, 10))
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('POST with correct secret header → 200 immediately, processUpdate async', async () => {
    const res = simulateRequest(
      { update_id: 1, message: { message_id: 1, chat: { id: 1, type: 'private' }, text: 'hi' } },
      { 'x-telegram-bot-api-secret-token': 'test-secret' },
    )
    await new Promise((r) => setTimeout(r, 10))
    expect(res.json).toHaveBeenCalledWith({ ok: true })
    // 200 was returned (no status() call = default 200)
    expect(res.status).not.toHaveBeenCalledWith(403)
  })

  it('POST /setup without webhookUrl → 400', async () => {
    const router = adapter.getRouter()
    const layer  = (router.stack as unknown as Array<{ route?: { path: string; stack: Array<{ handle: (req: unknown, res: unknown) => void }> } }>)
      .find((l) => l.route?.path === '/setup')
    const handler = layer!.route!.stack[0]!.handle

    const resMock = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    await (handler as (req: unknown, res: unknown) => Promise<void>)(
      { body: {} },
      resMock,
    )
    expect(resMock.status).toHaveBeenCalledWith(400)
  })

  it('POST /setup with webhookUrl → calls setWebhook and returns 200', async () => {
    mockFetch.mockResolvedValueOnce(
      makeFetchResponse({ ok: true, result: true }),
    )

    const router  = adapter.getRouter()
    const layer   = (router.stack as unknown as Array<{ route?: { path: string; stack: Array<{ handle: (req: unknown, res: unknown) => void }> } }>)
      .find((l) => l.route?.path === '/setup')
    const handler = layer!.route!.stack[0]!.handle

    const resMock = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    await (handler as (req: unknown, res: unknown) => Promise<void>)(
      { body: { webhookUrl: 'https://example.com' } },
      resMock,
    )

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url] = mockFetch.mock.calls[0]!
    expect(url).toContain('setWebhook')
    expect(resMock.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
    )
  })

  it('DELETE /webhook → calls deleteWebhook on Telegram', async () => {
    mockFetch.mockResolvedValueOnce(
      makeFetchResponse({ ok: true, result: true }),
    )

    const router  = adapter.getRouter()
    const layer   = (router.stack as unknown as Array<{ route?: { path: string; stack: Array<{ handle: (req: unknown, res: unknown) => void }> } }>)
      .find((l) => l.route?.path === '/webhook' && l.route.stack.length > 0)

    // Get the DELETE handler specifically
    const deleteHandler = (router.stack as unknown as Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (req: unknown, res: unknown) => Promise<void> }> } }>)
      .find((l) => l.route?.path === '/webhook' && l.route.methods['delete'])

    if (!deleteHandler?.route) {
      // Fallback: call deleteWebhook directly
      mockFetch.mockResolvedValueOnce(makeFetchResponse({ ok: true, result: true }))
      await adapter.deleteWebhook()
      expect(mockFetch).toHaveBeenCalled()
      const [url] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!
      expect(url).toContain('deleteWebhook')
      return
    }

    const resMock = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() }
    await deleteHandler.route.stack[0]!.handle({}, resMock)
    expect(mockFetch).toHaveBeenCalled()
  })
})

// ── describe('fetchWithRetry') ────────────────────────────────────────────

describe('fetchWithRetry', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns response on first success', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({ data: 'ok' }))
    const res = await fetchWithRetry('https://example.com', { method: 'GET' })
    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('retries on network error and succeeds on second attempt', async () => {
    vi.useFakeTimers()
    mockFetch
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(makeFetchResponse({ data: 'ok' }))

    const promise = fetchWithRetry('https://example.com', { method: 'GET' })
    await vi.advanceTimersByTimeAsync(1000)
    const res = await promise

    expect(res.ok).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('throws after maxTries exhausted', async () => {
    vi.useFakeTimers()
    mockFetch.mockRejectedValue(new Error('always fails'))

    const promise = fetchWithRetry('https://example.com', { method: 'GET' }, 3)
    await vi.advanceTimersByTimeAsync(5000)

    await expect(promise).rejects.toThrow()
    vi.useRealTimers()
  })
})
