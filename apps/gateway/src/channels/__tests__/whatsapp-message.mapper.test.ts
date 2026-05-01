/**
 * whatsapp-message.mapper.test.ts — [F3a-24]
 *
 * Tests unitarios para baileysToIncoming(), jidToPhone(), isGroupJid().
 * Los objetos WAMessage se construyen como plain objects —
 * NO se importa @whiskeysockets/baileys directamente.
 */

import { describe, it, expect } from 'vitest'
import { baileysToIncoming, jidToPhone, isGroupJid } from '../whatsapp-message.mapper.js'

// ── Factory: WAMessage mínimo ──────────────────────────────────────────────────

function makeWAMsg(overrides: {
  fromMe?:     boolean
  remoteJid?:  string
  participant?: string
  message?:    Record<string, unknown>
  pushName?:   string
  messageTimestamp?: number
}) {
  return {
    key: {
      fromMe:     overrides.fromMe    ?? false,
      remoteJid:  overrides.remoteJid ?? '521234567890@s.whatsapp.net',
      id:         'test-msg-id',
      participant: overrides.participant,
    },
    message:          overrides.message ?? null,
    pushName:         overrides.pushName ?? 'Test User',
    messageTimestamp: overrides.messageTimestamp ?? 1700000000,
  } as any
}

// ── Tests: baileysToIncoming() ─────────────────────────────────────────────────

describe('baileysToIncoming()', () => {

  it('returns null when fromMe=true', () => {
    const msg = makeWAMsg({ fromMe: true, message: { conversation: 'hello' } })
    expect(baileysToIncoming(msg)).toBeNull()
  })

  it('returns null when message is null', () => {
    const msg = makeWAMsg({ message: undefined })
    expect(baileysToIncoming(msg)).toBeNull()
  })

  it('returns null for protocolMessage (system message)', () => {
    const msg = makeWAMsg({ message: { protocolMessage: { type: 0 } } })
    expect(baileysToIncoming(msg)).toBeNull()
  })

  // ── conversation ──────────────────────────────────────────────────────

  it('maps conversation text to type=text', () => {
    const msg = makeWAMsg({ message: { conversation: 'hello world' } })
    const result = baileysToIncoming(msg)!
    expect(result).not.toBeNull()
    expect(result.type).toBe('text')
    expect(result.text).toBe('hello world')
    expect(result.externalId).toBe('521234567890')
  })

  it('maps conversation with / prefix to type=command', () => {
    const msg = makeWAMsg({ message: { conversation: '/start' } })
    expect(baileysToIncoming(msg)!.type).toBe('command')
  })

  it('externalId strips @s.whatsapp.net suffix', () => {
    const msg = makeWAMsg({
      remoteJid: '521234567890@s.whatsapp.net',
      message:   { conversation: 'hi' },
    })
    expect(baileysToIncoming(msg)!.externalId).toBe('521234567890')
  })

  // ── extendedTextMessage ─────────────────────────────────────────────

  it('maps extendedTextMessage to type=text with previewUrl in metadata', () => {
    const msg = makeWAMsg({
      message: {
        extendedTextMessage: {
          text:        'check this out',
          canonicalUrl: 'https://example.com',
        },
      },
    })
    const result = baileysToIncoming(msg)!
    expect(result.type).toBe('text')
    expect(result.text).toBe('check this out')
    expect(result.metadata?.previewUrl).toBe('https://example.com')
  })

  // ── imageMessage ──────────────────────────────────────────────────

  it('maps imageMessage with caption to type=image', () => {
    const msg = makeWAMsg({
      message: {
        imageMessage: { caption: 'my photo', mimetype: 'image/jpeg' },
      },
    })
    const result = baileysToIncoming(msg)!
    expect(result.type).toBe('image')
    expect(result.text).toBe('my photo')
    expect(result.attachments?.[0]?.type).toBe('image')
  })

  // ── audioMessage ──────────────────────────────────────────────────

  it('maps audioMessage ptt=true to attachment type=voice_note', () => {
    const msg = makeWAMsg({
      message: { audioMessage: { ptt: true, mimetype: 'audio/ogg; codecs=opus', seconds: 5 } },
    })
    const result = baileysToIncoming(msg)!
    expect(result.type).toBe('audio')
    expect(result.attachments?.[0]?.type).toBe('voice_note')
  })

  it('maps audioMessage ptt=false to attachment type=audio', () => {
    const msg = makeWAMsg({
      message: { audioMessage: { ptt: false, mimetype: 'audio/mp4', seconds: 10 } },
    })
    const result = baileysToIncoming(msg)!
    expect(result.type).toBe('audio')
    expect(result.attachments?.[0]?.type).toBe('audio')
  })

  // ── videoMessage ──────────────────────────────────────────────────

  it('maps videoMessage to type=file with attachment type=video', () => {
    const msg = makeWAMsg({
      message: { videoMessage: { caption: 'clip', mimetype: 'video/mp4', seconds: 30 } },
    })
    const result = baileysToIncoming(msg)!
    expect(result.type).toBe('file')
    expect(result.attachments?.[0]?.type).toBe('video')
  })

  // ── documentMessage ────────────────────────────────────────────────

  it('maps documentMessage to type=file with fileName in attachment data', () => {
    const msg = makeWAMsg({
      message: {
        documentMessage: {
          fileName: 'report.pdf',
          mimetype: 'application/pdf',
          fileLength: 1024,
        },
      },
    })
    const result = baileysToIncoming(msg)!
    expect(result.type).toBe('file')
    expect((result.attachments?.[0]?.data as any)?.fileName).toBe('report.pdf')
  })

  // ── locationMessage ───────────────────────────────────────────────

  it('maps locationMessage to type=text with coordinates in text and metadata', () => {
    const msg = makeWAMsg({
      message: {
        locationMessage: { degreesLatitude: 19.4326, degreesLongitude: -99.1332, name: 'CDMX' },
      },
    })
    const result = baileysToIncoming(msg)!
    expect(result.type).toBe('text')
    expect(result.text).toContain('19.4326')
    expect(result.text).toContain('-99.1332')
    expect((result.metadata?.location as any)?.lat).toBe(19.4326)
    expect((result.metadata?.location as any)?.lng).toBe(-99.1332)
  })

  // ── contactMessage ────────────────────────────────────────────────

  it('maps contactMessage with vcard TEL to type=text with phone in text', () => {
    const msg = makeWAMsg({
      message: {
        contactMessage: {
          displayName: 'Juan',
          vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Juan\nTEL;type=CELL:+521234567890\nEND:VCARD',
        },
      },
    })
    const result = baileysToIncoming(msg)!
    expect(result.type).toBe('text')
    expect(result.text).toContain('+521234567890')
  })

  // ── reactionMessage ───────────────────────────────────────────────

  it('reactionMessage with processReactions=false returns null', () => {
    const msg = makeWAMsg({
      message: { reactionMessage: { text: '\ud83d\udc4d', key: { id: 'orig-id' } } },
    })
    expect(baileysToIncoming(msg)).toBeNull()
  })

  it('reactionMessage with processReactions=true returns type=command with emoji', () => {
    const msg = makeWAMsg({
      message: { reactionMessage: { text: '\ud83d\udc4d', key: { id: 'orig-id' } } },
    })
    const result = baileysToIncoming(msg, { processReactions: true })!
    expect(result.type).toBe('command')
    expect(result.text).toBe('\ud83d\udc4d')
    expect((result.metadata?.reaction as any)?.emoji).toBe('\ud83d\udc4d')
  })

  // ── rawPayload y threadId ────────────────────────────────────────────

  it('result always has rawPayload and threadId', () => {
    const msg = makeWAMsg({ message: { conversation: 'test' } })
    const result = baileysToIncoming(msg)!
    expect(result.rawPayload).toBeDefined()
    expect(result.threadId).toBeDefined()
    expect(result.threadId).toBe(result.externalId)
  })
})

// ── Tests: jidToPhone() ───────────────────────────────────────────────────────────

describe('jidToPhone()', () => {
  it('strips @s.whatsapp.net suffix', () => {
    expect(jidToPhone('521234567890@s.whatsapp.net')).toBe('521234567890')
  })

  it('strips multi-device suffix :N', () => {
    expect(jidToPhone('521234567890:5@s.whatsapp.net')).toBe('521234567890')
  })

  it('strips @g.us suffix for groups', () => {
    expect(jidToPhone('120363@g.us')).toBe('120363')
  })

  it('returns empty string for empty input', () => {
    expect(jidToPhone('')).toBe('')
  })
})

// ── Tests: isGroupJid() ────────────────────────────────────────────────────────

describe('isGroupJid()', () => {
  it('returns true for group JIDs', () => {
    expect(isGroupJid('120363123456@g.us')).toBe(true)
  })

  it('returns false for personal JIDs', () => {
    expect(isGroupJid('521234567890@s.whatsapp.net')).toBe(false)
  })
})
