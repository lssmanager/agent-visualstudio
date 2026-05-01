/**
 * whatsapp-send.mapper.test.ts — [F3a-24]
 *
 * Tests unitarios para outgoingToBaileys() y phoneToJid().
 */

import { describe, it, expect, vi } from 'vitest'
import { outgoingToBaileys, phoneToJid } from '../whatsapp-send.mapper.js'
import type { OutgoingMessage } from '../channel-adapter.interface.js'

function makeMsg(overrides: Partial<OutgoingMessage>): OutgoingMessage {
  return {
    externalId:  '521234567890',
    text:        'Hello',
    ...overrides,
  }
}

// ── Tests: outgoingToBaileys() ─────────────────────────────────────────────────

describe('outgoingToBaileys()', () => {

  it('without richContent returns { text } and correct jid', () => {
    const { jid, content } = outgoingToBaileys(makeMsg({}))
    expect(jid).toBe('521234567890@s.whatsapp.net')
    expect(content).toEqual({ text: 'Hello' })
  })

  it('richContent type=buttons maps buttons array correctly', () => {
    const { content } = outgoingToBaileys(makeMsg({
      richContent: {
        type: 'buttons',
        body: 'Choose one',
        buttons: [
          { id: 'btn1', title: 'Option 1' },
          { id: 'btn2', title: 'Option 2' },
        ],
      },
    }))
    const buttons = (content as any).buttons
    expect(buttons).toHaveLength(2)
    expect(buttons[0].buttonId).toBe('btn1')
    expect(buttons[0].buttonText.displayText).toBe('Option 1')
  })

  it('richContent type=list maps listMessage.sections correctly', () => {
    const { content } = outgoingToBaileys(makeMsg({
      richContent: {
        type: 'list',
        title:       'Menu',
        description: 'Pick an option',
        buttonText:  'Options',
        sections: [{
          title: 'Section 1',
          rows:  [{ id: 'r1', title: 'Row 1' }],
        }],
      },
    }))
    const lm = (content as any).listMessage
    expect(lm).toBeDefined()
    expect(lm.sections).toHaveLength(1)
    expect(lm.sections[0].rows[0].rowId).toBe('r1')
  })

  it('richContent type=template maps templateMessage', () => {
    const { content } = outgoingToBaileys(makeMsg({
      richContent: {
        type:    'template',
        text:    'Hello template',
        buttons: [{ index: 0, quickReplyButton: { displayText: 'Yes', id: 'yes' } }],
      },
    }))
    expect((content as any).templateMessage).toBeDefined()
  })

  it('unknown richContent type falls back to text without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { content } = outgoingToBaileys(makeMsg({
      richContent: { type: 'unknown_type', someData: 123 } as any,
    }))
    expect((content as any).text).toBeDefined()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

// ── Tests: phoneToJid() ───────────────────────────────────────────────────────────

describe('phoneToJid()', () => {
  it('adds @s.whatsapp.net to plain number', () => {
    expect(phoneToJid('521234567890')).toBe('521234567890@s.whatsapp.net')
  })

  it('strips + prefix', () => {
    expect(phoneToJid('+521234567890')).toBe('521234567890@s.whatsapp.net')
  })

  it('strips spaces and dashes', () => {
    expect(phoneToJid('52 123 456-7890')).toBe('521234567890@s.whatsapp.net')
  })

  it('is idempotent for existing JIDs', () => {
    expect(phoneToJid('521234567890@s.whatsapp.net')).toBe('521234567890@s.whatsapp.net')
  })
})
