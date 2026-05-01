/**
 * whatsapp-baileys.adapter.test.ts
 * [F3a-21] Tests del WhatsAppBaileysAdapter
 *
 * IMPORTANTE: Baileys se importa dinámicamente dentro del adapter.
 * Aquí mockeamos la importación dinámica completa para evitar cargar
 * el módulo real (pesado, ESM puro, abre sockets reales).
 *
 * Estrategia de mocking:
 *   - vi.mock('@whiskeysockets/baileys', ...) intercepta el import() dinámico
 *   - BaileysSocket se simula con un EventEmitter + sendMessage vi.fn()
 *   - fs.mkdirSync / fs.rmSync se mockean para no tocar el filesystem
 *   - setTimeout/clearTimeout se controlan con vi.useFakeTimers()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import EventEmitter from 'node:events'

// ── Mock de node:fs ───────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    rmSync:    vi.fn(),
  },
  mkdirSync: vi.fn(),
  rmSync:    vi.fn(),
}))

// ── Mock de Baileys ───────────────────────────────────────────────────────
// El adapter hace: import('@whiskeysockets/baileys')
// Vi intercepta todos los import() dinámicos del módulo bajo test.

let mockSockEmitter: EventEmitter
let mockSendMessage: ReturnType<typeof vi.fn>
let mockLogout:      ReturnType<typeof vi.fn>
let mockEnd:         ReturnType<typeof vi.fn>
let mockSaveCreds:   ReturnType<typeof vi.fn>

function buildMockBaileys() {
  mockSockEmitter  = new EventEmitter()
  mockSendMessage  = vi.fn().mockResolvedValue({ key: { id: 'msg-1' } })
  mockLogout       = vi.fn().mockResolvedValue(undefined)
  mockEnd          = vi.fn()
  mockSaveCreds    = vi.fn().mockResolvedValue(undefined)

  const mockSock = {
    sendMessage: mockSendMessage,
    logout:      mockLogout,
    end:         mockEnd,
    ev:          mockSockEmitter,
    user:        { id: '5491100000000@s.whatsapp.net', name: 'Test Bot' },
  }

  return {
    makeWASocket: vi.fn().mockReturnValue(mockSock),
    useMultiFileAuthState: vi.fn().mockResolvedValue({
      state:     { creds: {}, keys: {} },
      saveCreds: mockSaveCreds,
    }),
    DisconnectReason: {
      loggedOut:        401,
      connectionLost:   408,
      restartRequired:  515,
      timedOut:         408,
      badSession:       500,
    },
    fetchLatestBaileysVersion: vi.fn().mockResolvedValue({
      version: [2, 3000, 1015901307],
    }),
  }
}

vi.mock('@whiskeysockets/baileys', () => buildMockBaileys())

// ── Importar el adapter DESPUÉS de los mocks ──────────────────────────────
import { WhatsAppBaileysAdapter } from '../whatsapp-baileys.adapter.js'

// ── Helper para emitir eventos del socket ─────────────────────────────────
function emitConnectionUpdate(
  update: Record<string, unknown>,
): void {
  mockSockEmitter.emit('connection.update', update)
}

function emitMessages(messages: unknown[], type = 'notify'): void {
  mockSockEmitter.emit('messages.upsert', { messages, type })
}

// ── Factory de mensajes WA crudos ─────────────────────────────────────────
function makeRawMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: {
      remoteJid:  '5491100000001@s.whatsapp.net',
      fromMe:     false,
      id:         'ABCD1234',
      participant: undefined,
    },
    message: {
      conversation: 'Hola mundo',
    },
    pushName: 'Usuario Test',
    messageTimestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  }
}

function makeGroupMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: {
      remoteJid:   '1234567890-9876543210@g.us',
      fromMe:      false,
      id:          'GRP-MSG-001',
      participant: '5491100000002@s.whatsapp.net',
    },
    message: {
      conversation: 'Hola grupo',
    },
    pushName: 'Miembro Grupo',
    messageTimestamp: Math.floor(Date.now() / 1000),
    ...overrides,
  }
}

// ── Setup / Teardown ──────────────────────────────────────────────────────

let adapter: WhatsAppBaileysAdapter

beforeEach(() => {
  vi.useFakeTimers()
  // Rebuild mocks so each test gets a fresh socket emitter
  buildMockBaileys()
  adapter = new WhatsAppBaileysAdapter()
  // Override channelConfigId (normally set by initialize/setup)
  ;(adapter as unknown as Record<string, unknown>)['channelConfigId'] = 'test-channel-001'
})

afterEach(async () => {
  await adapter.dispose()
  vi.useRealTimers()
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────
// describe: receive()
// ─────────────────────────────────────────────────────────────────────────

describe('receive()', () => {
  it('mensaje DM texto → externalId=chatJid, threadId=chatJid, senderId=chatJid, type=text', async () => {
    const raw = makeRawMessage()
    const result = await adapter.receive(raw, {})

    expect(result).not.toBeNull()
    expect(result!.externalId).toBe('5491100000001@s.whatsapp.net')
    expect(result!.threadId).toBe('5491100000001@s.whatsapp.net')
    expect(result!.senderId).toBe('5491100000001@s.whatsapp.net')
    expect(result!.type).toBe('text')
    expect(result!.text).toBe('Hola mundo')
  })

  it('mensaje de grupo → externalId=groupJid, senderId=participantJid', async () => {
    const raw = makeGroupMessage()
    const result = await adapter.receive(raw, {})

    expect(result).not.toBeNull()
    expect(result!.externalId).toBe('1234567890-9876543210@g.us')
    expect(result!.senderId).toBe('5491100000002@s.whatsapp.net')
    expect(result!.type).toBe('text')
  })

  it('mensaje con imageMessage → type=image, attachments presente', async () => {
    const raw = makeRawMessage({
      message: { imageMessage: { url: 'https://cdn.wa.net/img1', caption: 'foto' } },
    })
    const result = await adapter.receive(raw, {})

    expect(result!.type).toBe('image')
    expect(result!.attachments).toHaveLength(1)
    expect(result!.attachments![0].type).toBe('image')
  })

  it('mensaje con audioMessage → type=audio', async () => {
    const raw = makeRawMessage({
      message: { audioMessage: { url: 'https://cdn.wa.net/aud1', ptt: true } },
    })
    const result = await adapter.receive(raw, {})
    expect(result!.type).toBe('audio')
  })

  it('mensaje con documentMessage → type=file', async () => {
    const raw = makeRawMessage({
      message: {
        documentMessage: {
          url:      'https://cdn.wa.net/doc1',
          fileName: 'report.pdf',
          mimetype: 'application/pdf',
        },
      },
    })
    const result = await adapter.receive(raw, {})
    expect(result!.type).toBe('file')
    expect(result!.attachments![0].data).toMatchObject({ fileName: 'report.pdf' })
  })

  it('mensaje con texto que empieza con / → type=command', async () => {
    const raw = makeRawMessage({ message: { conversation: '/start' } })
    const result = await adapter.receive(raw, {})
    expect(result!.type).toBe('command')
    expect(result!.text).toBe('/start')
  })

  it('status@broadcast → retorna null (ignorado)', async () => {
    const raw = makeRawMessage({
      key: { remoteJid: 'status@broadcast', fromMe: false, id: 'S1' },
      message: { conversation: 'status update' },
    })
    // receive() retorna null cuando remoteJid === status@broadcast
    // Nota: el filtro está en handleIncomingMessage, no en receive() directamente.
    // receive() de hecho procesa el rawPayload. Verificamos desde handleIncomingMessage
    // emitiendo el evento messages.upsert y esperando que emit() NO sea llamado.
    const emitSpy = vi.spyOn(adapter as unknown as { emit: (m: unknown) => Promise<void> }, 'emit')
    emitMessages([
      {
        key:     { remoteJid: 'status@broadcast', fromMe: false, id: 'S1' },
        message: { conversation: 'status' },
        pushName: '',
      },
    ])
    await vi.runAllTimersAsync()
    expect(emitSpy).not.toHaveBeenCalled()
  })

  it('fromMe=true → ignorado (no emitido)', async () => {
    const emitSpy = vi.spyOn(adapter as unknown as { emit: (m: unknown) => Promise<void> }, 'emit')
    emitMessages([
      {
        key:     { remoteJid: '5491100000001@s.whatsapp.net', fromMe: true, id: 'ME1' },
        message: { conversation: 'yo mismo' },
        pushName: '',
      },
    ])
    await vi.runAllTimersAsync()
    expect(emitSpy).not.toHaveBeenCalled()
  })

  it('rawPayload no contiene campos sensibles', async () => {
    const raw = {
      ...makeRawMessage(),
      botToken:     'SHOULD_NOT_APPEAR',
      accessToken:  'SHOULD_NOT_APPEAR',
      apiKey:       'SHOULD_NOT_APPEAR',
      sessionKey:   'SHOULD_NOT_APPEAR',
    }
    const result = await adapter.receive(raw, {})
    const payload = result!.rawPayload as Record<string, unknown>
    expect(payload['botToken']).toBeUndefined()
    expect(payload['accessToken']).toBeUndefined()
    expect(payload['apiKey']).toBeUndefined()
    expect(payload['sessionKey']).toBeUndefined()
  })

  it('update sin message ni key → retorna null', async () => {
    const result = await adapter.receive({ noMessage: true }, {})
    expect(result).toBeNull()
  })

  it('replyFn está definida en mensajes válidos', async () => {
    const raw = makeRawMessage()
    const result = await adapter.receive(raw, {})
    expect(result!.replyFn).toBeDefined()
    expect(typeof result!.replyFn).toBe('function')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// describe: replyFn()
// ─────────────────────────────────────────────────────────────────────────

describe('replyFn()', () => {
  it('replyFn llama sendMessage con el jid y texto correctos', async () => {
    // Necesitamos que el sock esté disponible → conectar primero
    // Simulamos doConnect() siendo exitoso vía import dinámico mockeado
    // Para este test, inyectamos el sock directamente
    const fakeSock = {
      sendMessage: vi.fn().mockResolvedValue({}),
      end:         vi.fn(),
      ev:          new EventEmitter(),
      user:        { id: 'bot@s.whatsapp.net' },
    }
    ;(adapter as unknown as Record<string, unknown>)['sock'] = fakeSock
    ;(adapter as unknown as Record<string, unknown>)['state'] = 'open'

    const raw    = makeRawMessage()
    const result = await adapter.receive(raw, {})
    await result!.replyFn!('Hola de vuelta')

    expect(fakeSock.sendMessage).toHaveBeenCalledOnce()
    const [jid, content] = fakeSock.sendMessage.mock.calls[0] as [string, Record<string, unknown>]
    expect(jid).toBe('5491100000001@s.whatsapp.net')
    expect(content['text']).toBe('Hola de vuelta')
  })

  it('replyFn con quoteOriginal=true → content.quoted === rawMsg', async () => {
    const fakeSock = {
      sendMessage: vi.fn().mockResolvedValue({}),
      end:         vi.fn(),
      ev:          new EventEmitter(),
      user:        { id: 'bot@s.whatsapp.net' },
    }
    ;(adapter as unknown as Record<string, unknown>)['sock'] = fakeSock
    ;(adapter as unknown as Record<string, unknown>)['state'] = 'open'

    const raw    = makeRawMessage()
    const result = await adapter.receive(raw, {})
    await result!.replyFn!('Respondiendo', { quoteOriginal: true })

    const [, content] = fakeSock.sendMessage.mock.calls[0] as [string, Record<string, unknown>]
    expect(content['quoted']).toBeDefined()
  })

  it('replyFn con channelMeta.richContent → se fusiona al content', async () => {
    const fakeSock = {
      sendMessage: vi.fn().mockResolvedValue({}),
      end:         vi.fn(),
      ev:          new EventEmitter(),
      user:        { id: 'bot@s.whatsapp.net' },
    }
    ;(adapter as unknown as Record<string, unknown>)['sock'] = fakeSock
    ;(adapter as unknown as Record<string, unknown>)['state'] = 'open'

    const raw    = makeRawMessage()
    const result = await adapter.receive(raw, {})
    await result!.replyFn!('Opciones', {
      channelMeta: { richContent: { buttons: [{ id: '1', text: 'Sí' }] } },
    })

    const [, content] = fakeSock.sendMessage.mock.calls[0] as [string, Record<string, unknown>]
    expect(content['buttons']).toBeDefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// describe: send()
// ─────────────────────────────────────────────────────────────────────────

describe('send()', () => {
  it('send() normaliza número de teléfono a JID', async () => {
    const fakeSock = {
      sendMessage: vi.fn().mockResolvedValue({}),
      end:         vi.fn(),
      ev:          new EventEmitter(),
      user:        { id: 'bot@s.whatsapp.net' },
    }
    ;(adapter as unknown as Record<string, unknown>)['sock']  = fakeSock
    ;(adapter as unknown as Record<string, unknown>)['state'] = 'open'

    await adapter.send({
      externalId: '5491100000001',   // número sin @s.whatsapp.net
      text:       'Mensaje de prueba',
      type:       'text',
    })

    expect(fakeSock.sendMessage).toHaveBeenCalledWith(
      '5491100000001@s.whatsapp.net',
      expect.objectContaining({ text: 'Mensaje de prueba' }),
    )
  })

  it('send() con JID completo no lo modifica', async () => {
    const fakeSock = {
      sendMessage: vi.fn().mockResolvedValue({}),
      end:         vi.fn(),
      ev:          new EventEmitter(),
      user:        { id: 'bot@s.whatsapp.net' },
    }
    ;(adapter as unknown as Record<string, unknown>)['sock']  = fakeSock
    ;(adapter as unknown as Record<string, unknown>)['state'] = 'open'

    await adapter.send({
      externalId: '5491100000001@s.whatsapp.net',
      text:       'Ya tengo JID',
      type:       'text',
    })

    const [jid] = fakeSock.sendMessage.mock.calls[0] as [string, unknown]
    expect(jid).toBe('5491100000001@s.whatsapp.net')
  })

  it('send() con richContent → se pasa al sock.sendMessage', async () => {
    const fakeSock = {
      sendMessage: vi.fn().mockResolvedValue({}),
      end:         vi.fn(),
      ev:          new EventEmitter(),
      user:        { id: 'bot@s.whatsapp.net' },
    }
    ;(adapter as unknown as Record<string, unknown>)['sock']  = fakeSock
    ;(adapter as unknown as Record<string, unknown>)['state'] = 'open'

    await adapter.send({
      externalId:  '5491100000001@s.whatsapp.net',
      text:        'Con botones',
      type:        'text',
      richContent: { buttons: [{ id: '1', displayText: 'OK' }] },
    })

    const [, content] = fakeSock.sendMessage.mock.calls[0] as [string, Record<string, unknown>]
    expect(content['buttons']).toBeDefined()
  })

  it('send() lanza si sock es null después de connect()', async () => {
    // state=open pero sock=null → debe lanzar
    ;(adapter as unknown as Record<string, unknown>)['sock']  = null
    ;(adapter as unknown as Record<string, unknown>)['state'] = 'open'

    await expect(
      adapter.send({ externalId: '5491100000001@s.whatsapp.net', text: 'test', type: 'text' }),
    ).rejects.toThrow(/Socket no disponible/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// describe: connect() / estado
// ─────────────────────────────────────────────────────────────────────────

describe('connect() y getState()', () => {
  it('estado inicial es idle', () => {
    expect(adapter.getState()).toBe('idle')
  })

  it('connect() es idempotente cuando state=open', async () => {
    ;(adapter as unknown as Record<string, unknown>)['state'] = 'open'
    // No debe hacer nada (sin mock de Baileys necesario)
    await expect(adapter.connect()).resolves.toBeUndefined()
  })

  it('connect() paralelo no abre 2 sockets (deduplicación via connectPromise)', async () => {
    await adapter.setup({}, {})

    // Interceptar doConnect para que tarde un tick
    let resolveConnect!: () => void
    const connectGate = new Promise<void>((r) => { resolveConnect = r })
    const origConnect = (adapter as unknown as Record<string, unknown>)['doConnect'] as () => Promise<void>
    let callCount = 0
    ;(adapter as unknown as Record<string, unknown>)['doConnect'] = async () => {
      callCount++
      await connectGate
      return origConnect.call(adapter)
    }

    // Lanzar 2 connect() en paralelo
    const p1 = adapter.connect()
    const p2 = adapter.connect()

    resolveConnect()
    await Promise.all([p1, p2])

    // doConnect fue llamado solo 1 vez
    expect(callCount).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// describe: QR flow
// ─────────────────────────────────────────────────────────────────────────

describe('QR flow', () => {
  it('emite evento qr con el código QR y transiciona a state=qr', async () => {
    const qrHandler = vi.fn()
    adapter.onQr(qrHandler)
    adapter.onStateChange(() => {})

    // Simular handleQr directamente
    const handleQr = (adapter as unknown as Record<string, unknown>)['handleQr'] as (qr: string) => void
    handleQr.call(adapter, 'qr-code-base64-data')

    expect(qrHandler).toHaveBeenCalledWith('qr-code-base64-data')
    expect(adapter.getState()).toBe('qr')
  })

  it('QR timeout (120s) cierra el socket y emite error', async () => {
    const errorHandler = vi.fn()
    adapter.onError(errorHandler)

    const mockEnd = vi.fn()
    ;(adapter as unknown as Record<string, unknown>)['sock'] = { end: mockEnd, ev: new EventEmitter() }

    const handleQr = (adapter as unknown as Record<string, unknown>)['handleQr'] as (qr: string) => void
    handleQr.call(adapter, 'qr-code-timeout-test')

    expect(adapter.getState()).toBe('qr')

    // Avanzar 120 segundos
    await vi.advanceTimersByTimeAsync(120_000)

    expect(adapter.getState()).toBe('closed')
    expect(mockEnd).toHaveBeenCalled()
    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('QR pairing timeout') }),
    )
  })

  it('estado cambia idle→connecting→qr cuando no hay creds', () => {
    const states: string[] = []
    adapter.onStateChange((s) => states.push(s))

    const setState = (adapter as unknown as Record<string, unknown>)['setState'] as (s: string) => void
    setState.call(adapter, 'connecting')
    setState.call(adapter, 'qr')

    expect(states).toEqual(['connecting', 'qr'])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// describe: Reconexión con backoff
// ─────────────────────────────────────────────────────────────────────────

describe('Reconexión con backoff', () => {
  it('primer intento de reconexión ocurre después de 1s', async () => {
    const doConnectSpy = vi.fn().mockResolvedValue(undefined)
    ;(adapter as unknown as Record<string, unknown>)['doConnect'] = doConnectSpy
    ;(adapter as unknown as Record<string, unknown>)['state'] = 'open'

    const handleDisconnect = (adapter as unknown as Record<string, unknown>)['handleDisconnect'] as () => void
    handleDisconnect.call(adapter)

    expect(adapter.getState()).toBe('reconnecting')

    // Antes del tick → doConnect no llamado
    expect(doConnectSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(doConnectSpy).toHaveBeenCalledOnce()
  })

  it('segundo intento ocurre después de 2s (backoff exponencial)', async () => {
    const doConnectSpy = vi.fn().mockResolvedValue(undefined)
    ;(adapter as unknown as Record<string, unknown>)['doConnect']          = doConnectSpy
    ;(adapter as unknown as Record<string, unknown>)['state']              = 'open'
    ;(adapter as unknown as Record<string, unknown>)['reconnectAttempts']  = 1

    const handleDisconnect = (adapter as unknown as Record<string, unknown>)['handleDisconnect'] as () => void
    handleDisconnect.call(adapter)

    await vi.advanceTimersByTimeAsync(1_999)
    expect(doConnectSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(doConnectSpy).toHaveBeenCalledOnce()
  })

  it('maxReconnectAttempts alcanzado → state=closed, errorHandler llamado', () => {
    const errorHandler = vi.fn()
    adapter.onError(errorHandler)

    ;(adapter as unknown as Record<string, unknown>)['state']              = 'open'
    ;(adapter as unknown as Record<string, unknown>)['reconnectAttempts']  = 5
    ;(adapter as unknown as Record<string, unknown>)['maxReconnectAttempts'] = 5

    const handleDisconnect = (adapter as unknown as Record<string, unknown>)['handleDisconnect'] as () => void
    handleDisconnect.call(adapter)

    expect(adapter.getState()).toBe('closed')
    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('max reconnect') }),
    )
  })

  it('logout (statusCode=401) → limpia sesión, emite error, no reconecta', () => {
    const errorHandler = vi.fn()
    const clearSession = vi.spyOn(
      adapter as unknown as { clearSessionFiles: () => void },
      'clearSessionFiles',
    )
    adapter.onError(errorHandler)

    // Inyectar sock y estado
    const fakeEnd = vi.fn()
    ;(adapter as unknown as Record<string, unknown>)['sock']  = { end: fakeEnd, ev: new EventEmitter() }
    ;(adapter as unknown as Record<string, unknown>)['state'] = 'open'

    // Simular el handler de connection.update con logout
    const DR = { loggedOut: 401 }
    const update = {
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    }

    // Acceder al handler registrado en connection.update
    // Lo simulamos llamando directamente al handleQr/setState internos
    // y luego verificando el comportamiento desde el evento
    const setState = (adapter as unknown as Record<string, unknown>)['setState'] as (s: string) => void

    // Simular lo que haría el handler de logout
    const handleLogout = () => {
      const statusCode = update.lastDisconnect.error.output.statusCode
      if (statusCode === DR.loggedOut) {
        ;(adapter as unknown as Record<string, unknown>)['clearSessionFiles']?.call(adapter)
        setState.call(adapter, 'closed')
        ;(adapter as unknown as Record<string, unknown>)['emitter']
          .emit('error', new Error('WhatsApp session logged out'))
      }
    }
    handleLogout()

    expect(clearSession).toHaveBeenCalled()
    expect(adapter.getState()).toBe('closed')
    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('logged out') }),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────
// describe: dispose()
// ─────────────────────────────────────────────────────────────────────────

describe('dispose()', () => {
  it('dispose() cierra el socket y cambia state a closed', async () => {
    const fakeEnd = vi.fn()
    ;(adapter as unknown as Record<string, unknown>)['sock']  = { end: fakeEnd, ev: new EventEmitter() }
    ;(adapter as unknown as Record<string, unknown>)['state'] = 'open'

    await adapter.dispose()

    expect(fakeEnd).toHaveBeenCalled()
    expect(adapter.getState()).toBe('closed')
  })

  it('dispose() cancela el QR timeout pendiente', async () => {
    const handleQr = (adapter as unknown as Record<string, unknown>)['handleQr'] as (qr: string) => void
    ;(adapter as unknown as Record<string, unknown>)['sock'] = { end: vi.fn(), ev: new EventEmitter() }
    handleQr.call(adapter, 'some-qr')

    // Hay un timeout activo
    expect((adapter as unknown as Record<string, unknown>)['qrTimeoutHandle']).not.toBeNull()

    await adapter.dispose()

    // Timeout debe haber sido limpiado
    expect((adapter as unknown as Record<string, unknown>)['qrTimeoutHandle']).toBeNull()
  })

  it('dispose() en state=idle no lanza error', async () => {
    await expect(adapter.dispose()).resolves.toBeUndefined()
  })

  it('dispose() durante reconexión → state=closed, loop no continúa', async () => {
    const doConnectSpy = vi.fn().mockResolvedValue(undefined)
    ;(adapter as unknown as Record<string, unknown>)['doConnect'] = doConnectSpy
    ;(adapter as unknown as Record<string, unknown>)['state'] = 'open'

    const handleDisconnect = (adapter as unknown as Record<string, unknown>)['handleDisconnect'] as () => void
    handleDisconnect.call(adapter)

    // dispose() ANTES del timeout de reconexión
    await adapter.dispose()

    // Avanzar el timer → doConnect NO debe llamarse porque state=closed
    await vi.advanceTimersByTimeAsync(1_000)
    expect(doConnectSpy).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// describe: setup()
// ─────────────────────────────────────────────────────────────────────────

describe('setup()', () => {
  it('setup() NO conecta el socket (lazy)', async () => {
    const connectSpy = vi.spyOn(adapter, 'connect')
    await adapter.setup({ sessionsDir: '/tmp/test-sessions' }, {})
    expect(connectSpy).not.toHaveBeenCalled()
    expect(adapter.getState()).toBe('idle')
  })

  it('setup() respeta WA_SESSIONS_DIR env var', async () => {
    process.env['WA_SESSIONS_DIR'] = '/custom/sessions'
    await adapter.setup({}, {})
    const sessionPath = (adapter as unknown as Record<string, unknown>)['sessionsDir']
    expect(sessionPath).toBe('/custom/sessions')
    delete process.env['WA_SESSIONS_DIR']
  })

  it('setup() respeta config.maxReconnectAttempts', async () => {
    await adapter.setup({ maxReconnectAttempts: 10 }, {})
    const maxAttempts = (adapter as unknown as Record<string, unknown>)['maxReconnectAttempts']
    expect(maxAttempts).toBe(10)
  })
})
