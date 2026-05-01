/**
 * [F3a-02] channel-adapter.test.ts
 *
 * Verifica el contrato de IChannelAdapter, BaseChannelAdapter,
 * los tipos IncomingMessage / OutgoingMessage y la lógica
 * compartida de emit().
 */

import {
  BaseChannelAdapter,
  type ChannelType,
  type IncomingMessage,
  type OutgoingMessage,
  type IChannelAdapter,
  type IHttpChannelAdapter,
  type RichContent,
} from '../channel-adapter.interface'

// ── Concrete stub for testing BaseChannelAdapter ────────────────────

class TestAdapter extends BaseChannelAdapter {
  readonly channel = 'webchat' as const satisfies ChannelType
  sentMessages: OutgoingMessage[] = []
  initCalledWith: string | null = null
  disposed = false

  async initialize(channelConfigId: string): Promise<void> {
    this.channelConfigId = channelConfigId
    this.initCalledWith  = channelConfigId
  }

  async send(message: OutgoingMessage): Promise<void> {
    this.sentMessages.push(message)
  }

  async dispose(): Promise<void> {
    this.disposed = true
  }

  async testEmit(msg: IncomingMessage): Promise<void> {
    return this.emit(msg)
  }

  getTimestamp(): string {
    return this.makeTimestamp()
  }
}

function makeIncoming(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    channelConfigId: 'cfg-001',
    channelType:     'webchat',
    externalId:      'session-abc',
    senderId:        'user-xyz',
    text:            'Hello world',
    type:            'text',
    receivedAt:      new Date().toISOString(),
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────────────────────

describe('BaseChannelAdapter', () => {
  let adapter: TestAdapter

  beforeEach(() => {
    adapter = new TestAdapter()
  })

  it('initialize stores channelConfigId', async () => {
    await adapter.initialize('cfg-test')
    expect(adapter.initCalledWith).toBe('cfg-test')
  })

  it('dispose sets disposed flag', async () => {
    await adapter.dispose()
    expect(adapter.disposed).toBe(true)
  })

  it('channel property equals "webchat"', () => {
    expect(adapter.channel).toBe('webchat')
  })

  it('emit() calls registered handler with the message', async () => {
    const received: IncomingMessage[] = []
    adapter.onMessage(async (msg) => { received.push(msg) })

    const msg = makeIncoming()
    await adapter.testEmit(msg)

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual(msg)
  })

  it('emit() drops message and warns if no handler registered', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const msg = makeIncoming()
    await adapter.testEmit(msg)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No message handler'))
    warnSpy.mockRestore()
  })

  it('emit() drops message and warns if channelConfigId is empty', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    adapter.onMessage(async () => {})
    const msg = makeIncoming({ channelConfigId: '' })
    await adapter.testEmit(msg)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('without channelConfigId'))
    warnSpy.mockRestore()
  })

  it('onMessage replaces previously registered handler', async () => {
    const calls1: string[] = []
    const calls2: string[] = []
    adapter.onMessage(async (msg) => { calls1.push(msg.text) })
    adapter.onMessage(async (msg) => { calls2.push(msg.text) })

    await adapter.testEmit(makeIncoming({ text: 'hi' }))

    expect(calls1).toHaveLength(0)
    expect(calls2).toHaveLength(1)
  })

  it('makeTimestamp() returns valid ISO 8601 string', () => {
    const ts = adapter.getTimestamp()
    expect(new Date(ts).toISOString()).toBe(ts)
  })

  it('send() stores message in sentMessages', async () => {
    const msg: OutgoingMessage = { externalId: 'session-1', text: 'Hi there' }
    await adapter.send(msg)
    expect(adapter.sentMessages).toHaveLength(1)
    expect(adapter.sentMessages[0].text).toBe('Hi there')
  })
})

// ── IncomingMessage contract ───────────────────────────────────────────────────────────────────────────────────────────────────

describe('IncomingMessage shape', () => {
  it('accepts all required fields', () => {
    const msg = makeIncoming()
    expect(msg.channelConfigId).toBeDefined()
    expect(msg.channelType).toBeDefined()
    expect(msg.externalId).toBeDefined()
    expect(msg.senderId).toBeDefined()
    expect(msg.text).toBeDefined()
    expect(msg.type).toBeDefined()
    expect(msg.receivedAt).toBeDefined()
  })

  it('channelType is a valid ChannelType', () => {
    const validTypes: ChannelType[] = ['webchat', 'telegram', 'whatsapp', 'discord', 'slack', 'webhook']
    const msg = makeIncoming({ channelType: 'telegram' })
    expect(validTypes).toContain(msg.channelType)
  })

  it('accepts optional attachments array', () => {
    const msg = makeIncoming({
      attachments: [{ type: 'image', url: 'https://example.com/img.png' }],
    })
    expect(msg.attachments).toHaveLength(1)
    expect(msg.attachments![0].type).toBe('image')
  })
})

// ── RichContent discriminated union ─────────────────────────────────────────────────────────────────────────────────────

describe('RichContent discriminated union', () => {
  it('quick_replies variant has replies array', () => {
    const rc: RichContent = {
      type: 'quick_replies',
      replies: [{ label: 'Yes', payload: 'yes' }, { label: 'No', payload: 'no' }],
    }
    expect(rc.type).toBe('quick_replies')
    if (rc.type === 'quick_replies') {
      expect(rc.replies).toHaveLength(2)
    }
  })

  it('card variant has title', () => {
    const rc: RichContent = {
      type: 'card',
      card: { title: 'Test Card', subtitle: 'A subtitle' },
    }
    expect(rc.type).toBe('card')
    if (rc.type === 'card') {
      expect(rc.card.title).toBe('Test Card')
    }
  })

  it('image variant has url', () => {
    const rc: RichContent = { type: 'image', url: 'https://cdn.example.com/pic.jpg' }
    expect(rc.type).toBe('image')
    if (rc.type === 'image') {
      expect(rc.url).toContain('https://')
    }
  })
})

// ── IHttpChannelAdapter duck-typing ────────────────────────────────────────────────────────────────────────────────────────────────

describe('IHttpChannelAdapter duck-typing check', () => {
  it('adapter without getRouter does not satisfy IHttpChannelAdapter', () => {
    const adapter: IChannelAdapter = new TestAdapter()
    expect('getRouter' in adapter).toBe(false)
  })

  it('adapter with getRouter satisfies IHttpChannelAdapter detection', () => {
    const adapterWithRouter = {
      ...new TestAdapter(),
      channel: 'webchat' as ChannelType,
      getRouter: () => ({}),
    } as unknown as IHttpChannelAdapter
    expect('getRouter' in adapterWithRouter).toBe(true)
  })
})
