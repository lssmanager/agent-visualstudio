import { describe, it, expect } from 'vitest'
import {
  ChannelNotFoundError,
  InvalidTransitionError,
  ChannelAlreadyInStateError,
  WebhookRegistrationError,
} from '../channel-lifecycle.errors'

// ─────────────────────────────────────────────────────────────────────────────
describe('ChannelNotFoundError', () => {
  it('is an instance of Error', () => {
    const err = new ChannelNotFoundError('ch-999')
    expect(err).toBeInstanceOf(Error)
  })

  it('has name "ChannelNotFoundError"', () => {
    const err = new ChannelNotFoundError('ch-999')
    expect(err.name).toBe('ChannelNotFoundError')
  })

  it('includes channelConfigId in the message', () => {
    const err = new ChannelNotFoundError('ch-abc')
    expect(err.message).toContain('ch-abc')
  })

  it('formats the message with the expected prefix and surrounding quotes', () => {
    const err = new ChannelNotFoundError('ch-123')
    expect(err.message).toBe('[ChannelLifecycle] ChannelConfig "ch-123" not found.')
  })

  it('can be caught as ChannelNotFoundError', () => {
    function thrower() {
      throw new ChannelNotFoundError('ch-x')
    }
    expect(thrower).toThrow(ChannelNotFoundError)
  })

  it('can be caught as generic Error', () => {
    function thrower() {
      throw new ChannelNotFoundError('ch-x')
    }
    expect(thrower).toThrow(Error)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('InvalidTransitionError', () => {
  it('is an instance of Error', () => {
    const err = new InvalidTransitionError('ch-001', 'active', 'starting')
    expect(err).toBeInstanceOf(Error)
  })

  it('has name "InvalidTransitionError"', () => {
    const err = new InvalidTransitionError('ch-001', 'active', 'starting')
    expect(err.name).toBe('InvalidTransitionError')
  })

  it('includes channelConfigId in the message', () => {
    const err = new InvalidTransitionError('ch-xyz', 'active', 'starting')
    expect(err.message).toContain('ch-xyz')
  })

  it('includes from status in the message', () => {
    const err = new InvalidTransitionError('ch-001', 'stopping', 'starting')
    expect(err.message).toContain('stopping')
  })

  it('includes to status in the message', () => {
    const err = new InvalidTransitionError('ch-001', 'active', 'restart')
    expect(err.message).toContain('restart')
  })

  it('formats message with expected structure', () => {
    const err = new InvalidTransitionError('ch-001', 'active', 'starting')
    expect(err.message).toContain('Cannot transition channel "ch-001"')
    expect(err.message).toContain('from status="active"')
    expect(err.message).toContain('to "starting"')
    expect(err.message).toContain('TRANSITIONS')
  })

  it('can be caught as InvalidTransitionError', () => {
    function thrower() {
      throw new InvalidTransitionError('ch-1', 'active', 'starting')
    }
    expect(thrower).toThrow(InvalidTransitionError)
  })

  it('handles boundary: stopping → starting (not allowed)', () => {
    const err = new InvalidTransitionError('ch-stop', 'stopping', 'starting')
    expect(err.message).toContain('stopping')
    expect(err.message).toContain('starting')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('ChannelAlreadyInStateError', () => {
  it('is an instance of Error', () => {
    const err = new ChannelAlreadyInStateError('ch-001', 'active')
    expect(err).toBeInstanceOf(Error)
  })

  it('has name "ChannelAlreadyInStateError"', () => {
    const err = new ChannelAlreadyInStateError('ch-001', 'active')
    expect(err.name).toBe('ChannelAlreadyInStateError')
  })

  it('includes channelConfigId in the message', () => {
    const err = new ChannelAlreadyInStateError('ch-abc', 'stopped')
    expect(err.message).toContain('ch-abc')
  })

  it('includes current status in the message', () => {
    const err = new ChannelAlreadyInStateError('ch-001', 'stopped')
    expect(err.message).toContain('stopped')
  })

  it('formats message with expected structure', () => {
    const err = new ChannelAlreadyInStateError('ch-001', 'active')
    expect(err.message).toBe(
      '[ChannelLifecycle] Channel "ch-001" is already in status="active".'
    )
  })

  it('works for stopped state as well', () => {
    const err = new ChannelAlreadyInStateError('ch-002', 'stopped')
    expect(err.message).toContain('"stopped"')
  })

  it('can be caught as ChannelAlreadyInStateError', () => {
    function thrower() {
      throw new ChannelAlreadyInStateError('ch-1', 'active')
    }
    expect(thrower).toThrow(ChannelAlreadyInStateError)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('WebhookRegistrationError', () => {
  it('is an instance of Error', () => {
    const err = new WebhookRegistrationError('ch-001', 'timeout')
    expect(err).toBeInstanceOf(Error)
  })

  it('has name "WebhookRegistrationError"', () => {
    const err = new WebhookRegistrationError('ch-001', 'timeout')
    expect(err.name).toBe('WebhookRegistrationError')
  })

  it('includes channelConfigId in the message', () => {
    const err = new WebhookRegistrationError('ch-xyz', 'connection refused')
    expect(err.message).toContain('ch-xyz')
  })

  it('includes cause in the message', () => {
    const err = new WebhookRegistrationError('ch-001', 'network timeout after 30s')
    expect(err.message).toContain('network timeout after 30s')
  })

  it('formats message with expected structure', () => {
    const err = new WebhookRegistrationError('ch-001', 'timeout')
    expect(err.message).toContain('Failed to register webhook for channel "ch-001"')
    expect(err.message).toContain('timeout')
  })

  it('can be caught as WebhookRegistrationError', () => {
    function thrower() {
      throw new WebhookRegistrationError('ch-1', 'err')
    }
    expect(thrower).toThrow(WebhookRegistrationError)
  })

  it('handles multi-word cause strings', () => {
    const cause = 'SSL handshake failed: certificate expired'
    const err = new WebhookRegistrationError('ch-tls', cause)
    expect(err.message).toContain(cause)
    expect(err.message).toContain('ch-tls')
  })
})