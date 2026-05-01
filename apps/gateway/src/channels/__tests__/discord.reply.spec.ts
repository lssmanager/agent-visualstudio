/**
 * discord.reply.spec.ts — [F3a-29]
 *
 * Tests unitarios para discord.reply.ts.
 * Usa jest.spyOn(global, 'fetch') — sin servidor real.
 */

import {
  buildEmbed,
  splitMessage,
  sendToChannel,
  sendFollowup,
  sendEphemeralFollowup,
  MAX_CONTENT_LENGTH,
  type RichContent,
} from '../discord.reply.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetchOk() {
  return jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok:     true,
    status: 200,
    text:   async () => '',
    json:   async () => ({}),
  } as unknown as Response)
}

function mockFetchError(status: number, body = 'Error') {
  return jest.spyOn(global, 'fetch').mockResolvedValueOnce({
    ok:     false,
    status,
    text:   async () => body,
    json:   async () => ({}),
  } as unknown as Response)
}

function mockFetchNetworkError(message = 'fetch failed') {
  return jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error(message))
}

// Captura el body JSON enviado en el último fetch
async function captureRequestBody(spy: jest.SpyInstance): Promise<Record<string, unknown>> {
  const call = spy.mock.calls[0] as [string, RequestInit]
  return JSON.parse(call[1].body as string)
}

// ── Suites ────────────────────────────────────────────────────────────────────

beforeEach(() => jest.restoreAllMocks())

// ── buildEmbed ───────────────────────────────────────────────────────────────────

describe('buildEmbed()', () => {
  it('mapea todos los campos de RichContent a embed Discord', () => {
    const rc: RichContent = {
      title:       'Test Title',
      description: 'Test body',
      color:       0x5865F2,
      footer:      'Footer text',
      imageUrl:    'https://example.com/img.png',
      thumbnail:   'https://example.com/thumb.png',
      fields:      [{ name: 'Field', value: 'Value', inline: true }],
    }
    const embed = buildEmbed(rc)
    expect(embed.title).toBe('Test Title')
    expect(embed.description).toBe('Test body')
    expect(embed.color).toBe(0x5865F2)
    expect(embed.footer).toEqual({ text: 'Footer text' })
    expect(embed.image).toEqual({ url: 'https://example.com/img.png' })
    expect(embed.thumbnail).toEqual({ url: 'https://example.com/thumb.png' })
    expect(embed.fields).toHaveLength(1)
  })

  it('genera _components con ACTION_ROW cuando hay buttons', () => {
    const rc: RichContent = {
      buttons: [
        { label: 'Yes', value: 'yes' },
        { label: 'No',  value: 'no'  },
      ],
    }
    const embed = buildEmbed(rc)
    expect(embed._components).toHaveLength(1)
    const row = embed._components![0] as any
    expect(row.type).toBe(1)  // ACTION_ROW
    expect(row.components).toHaveLength(2)
    expect(row.components[0].label).toBe('Yes')
    expect(row.components[1].custom_id).toBe('no')
  })

  it('no genera _components si no hay buttons', () => {
    const embed = buildEmbed({ title: 'No buttons' })
    expect(embed._components).toBeUndefined()
  })

  it('devuelve embed vacío para RichContent sin campos', () => {
    const embed = buildEmbed({})
    expect(Object.keys(embed).filter(k => k !== '_components')).toHaveLength(0)
  })
})

// ── splitMessage ────────────────────────────────────────────────────────────────

describe('splitMessage()', () => {
  it('devuelve el texto como un único chunk si cabe en maxLen', () => {
    expect(splitMessage('hello', 2000)).toEqual(['hello'])
  })

  it('devuelve [] para texto vacío', () => {
    expect(splitMessage('')).toEqual([])
  })

  it('divide en chunks respetando espacios', () => {
    const text = 'aaa bbb ccc ddd'
    const chunks = splitMessage(text, 7)
    expect(chunks.every(c => c.length <= 7)).toBe(true)
    expect(chunks.join(' ')).toBe(text.trim())
  })

  it('fuerza corte en maxLen cuando no hay espacio', () => {
    const text = 'a'.repeat(2500)
    const chunks = splitMessage(text, 2000)
    expect(chunks[0]).toHaveLength(2000)
    expect(chunks[1]).toHaveLength(500)
  })

  it('ningún chunk supera MAX_CONTENT_LENGTH por defecto', () => {
    const text = 'word '.repeat(500)  // 2500 chars
    const chunks = splitMessage(text)
    expect(chunks.every(c => c.length <= MAX_CONTENT_LENGTH)).toBe(true)
  })
})

// ── sendToChannel ─────────────────────────────────────────────────────────────

describe('sendToChannel()', () => {
  it('devuelve { ok: true, chunks: 1 } para mensaje corto', async () => {
    mockFetchOk()
    const result = await sendToChannel({
      botToken:  'tok',
      channelId: 'ch1',
      text:      'Hello!',
    })
    expect(result).toEqual({ ok: true, chunks: 1 })
  })

  it('adjunta embed en el último chunk cuando hay richContent', async () => {
    const spy = mockFetchOk()
    await sendToChannel({
      botToken:    'tok',
      channelId:   'ch1',
      text:        'Result:',
      richContent: { title: 'Answer', description: 'Details' },
    })
    const body = await captureRequestBody(spy)
    expect(body['embeds']).toBeDefined()
    expect((body['embeds'] as any[])[0].title).toBe('Answer')
  })

  it('envía múltiples chunks para texto largo', async () => {
    // Mock 3 fetchs OK
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, status: 200, text: async () => '', json: async () => ({}),
    } as unknown as Response)
    const longText = 'word '.repeat(500)  // ~2500 chars → 2 chunks
    const result = await sendToChannel({ botToken: 'tok', channelId: 'ch1', text: longText })
    expect(result.ok).toBe(true)
    expect(result.chunks).toBeGreaterThan(1)
  })

  it('devuelve { ok: false } cuando Discord rechaza', async () => {
    mockFetchError(403, 'Missing Access')
    const result = await sendToChannel({ botToken: 'tok', channelId: 'ch1', text: 'Hi' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('403')
  })

  it('devuelve { ok: false } en error de red', async () => {
    mockFetchNetworkError('ECONNREFUSED')
    const result = await sendToChannel({ botToken: 'tok', channelId: 'ch1', text: 'Hi' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('ECONNREFUSED')
  })

  it('usa Authorization: Bot <token> en el header', async () => {
    const spy = mockFetchOk()
    await sendToChannel({ botToken: 'mytoken', channelId: 'ch1', text: 'X' })
    const call = spy.mock.calls[0] as [string, RequestInit]
    expect((call[1].headers as Record<string, string>)['Authorization']).toBe('Bot mytoken')
  })
})

// ── sendFollowup ────────────────────────────────────────────────────────────────

describe('sendFollowup()', () => {
  const BASE = {
    botToken:         'tok',
    applicationId:    'app123',
    interactionToken: 'itoken',
  }

  it('devuelve { ok: true, chunks: 1 } en éxito', async () => {
    mockFetchOk()
    const result = await sendFollowup({ ...BASE, text: 'Reply' })
    expect(result).toEqual({ ok: true, chunks: 1 })
  })

  it('usa PATCH method y URL correcta de followup', async () => {
    const spy = mockFetchOk()
    await sendFollowup({ ...BASE, text: 'Reply' })
    const call = spy.mock.calls[0] as [string, RequestInit]
    expect(call[1].method).toBe('PATCH')
    expect(call[0]).toContain(`/webhooks/app123/itoken/messages/@original`)
  })

  it('adjunta embed cuando hay richContent', async () => {
    const spy = mockFetchOk()
    await sendFollowup({ ...BASE, text: 'OK', richContent: { title: 'Done' } })
    const body = await captureRequestBody(spy)
    expect((body['embeds'] as any[])[0].title).toBe('Done')
  })

  it('devuelve { ok: false } cuando Discord rechaza', async () => {
    mockFetchError(400, 'Bad interaction')
    const result = await sendFollowup({ ...BASE, text: 'X' })
    expect(result.ok).toBe(false)
    expect(result.chunks).toBe(0)
  })

  it('devuelve { ok: false } en error de red', async () => {
    mockFetchNetworkError('timeout')
    const result = await sendFollowup({ ...BASE, text: 'X' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('timeout')
  })
})

// ── sendEphemeralFollowup ───────────────────────────────────────────────────────

describe('sendEphemeralFollowup()', () => {
  it('incluye flags=64 en el body (EPHEMERAL)', async () => {
    const spy = mockFetchOk()
    await sendEphemeralFollowup({
      botToken:         'tok',
      applicationId:    'app123',
      interactionToken: 'itoken',
      text:             'Only you can see this',
    })
    const body = await captureRequestBody(spy)
    expect(body['flags']).toBe(64)
  })

  it('devuelve { ok: true, chunks: 1 } en éxito', async () => {
    mockFetchOk()
    const result = await sendEphemeralFollowup({
      botToken:         'tok',
      applicationId:    'app123',
      interactionToken: 'itoken',
      text:             'Secret',
    })
    expect(result).toEqual({ ok: true, chunks: 1 })
  })
})
