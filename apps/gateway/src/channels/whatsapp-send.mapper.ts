/**
 * whatsapp-send.mapper.ts — [F3a-24]
 *
 * Convierte OutgoingMessage (interfaz genérica del gateway) al payload
 * que acepta sock.sendMessage(jid, content) de Baileys.
 *
 * Función principal: outgoingToBaileys()
 *
 * Tipos de richContent soportados:
 *   richContent.type = 'buttons'   → ButtonMessage de Baileys
 *   richContent.type = 'list'      → ListMessage de Baileys
 *   richContent.type = 'template'  → TemplateMessage (WA Business)
 *   (sin richContent)              → texto plano
 *
 * Función auxiliar: phoneToJid()
 *   Convierte número de teléfono a JID de Baileys.
 *   '521234567890' → '521234567890@s.whatsapp.net'
 *   Idempotente: si recibe un JID ya formado, lo retorna tal cual.
 */

import type { OutgoingMessage } from './channel-adapter.interface.js'

// AnyMessageContent de Baileys es Record<string,unknown> en nuestra capa de tipos
type BaileysContent = Record<string, unknown>

// ── Tipos de richContent ──────────────────────────────────────────────────

export interface ButtonsRichContent {
  type:    'buttons'
  body:    string
  footer?: string
  buttons: Array<{ id: string; title: string }>
}

export interface ListRichContent {
  type:        'list'
  title:       string
  description: string
  buttonText:  string
  footer?:     string
  sections:    Array<{
    title: string
    rows:  Array<{ id: string; title: string; description?: string }>
  }>
}

export interface TemplateRichContent {
  type:    'template'
  text:    string
  footer?: string
  buttons: Array<{
    index:             number
    urlButton?:        { displayText: string; url: string }
    callButton?:       { displayText: string; phoneNumber: string }
    quickReplyButton?: { displayText: string; id: string }
  }>
}

type WARichContent = ButtonsRichContent | ListRichContent | TemplateRichContent

// ── Función principal ────────────────────────────────────────────────────────

/**
 * Convierte OutgoingMessage al payload de sock.sendMessage().
 * Nunca lanza excepciones — hace fallback a texto plano para tipos desconocidos.
 *
 * @returns { jid, content } donde content es el payload de Baileys
 */
export function outgoingToBaileys(message: OutgoingMessage): {
  jid:     string
  content: BaileysContent
} {
  const jid = phoneToJid(message.externalId)

  // Sin richContent → texto plano
  if (!message.richContent) {
    return { jid, content: { text: message.text ?? '' } }
  }

  const rich = message.richContent as WARichContent

  switch (rich.type) {

    // ── Botones ──────────────────────────────────────────────────────
    case 'buttons': {
      const r = rich as ButtonsRichContent
      return {
        jid,
        content: {
          buttons: r.buttons.map((b) => ({
            buttonId:   b.id,
            buttonText: { displayText: b.title },
            type:       1,
          })),
          text:       r.body,
          footerText: r.footer ?? '',
        },
      }
    }

    // ── Lista ──────────────────────────────────────────────────────────
    case 'list': {
      const r = rich as ListRichContent
      return {
        jid,
        content: {
          listMessage: {
            title:       r.title,
            description: r.description,
            buttonText:  r.buttonText,
            footerText:  r.footer ?? '',
            listType:    1,
            sections:    r.sections.map((s) => ({
              title: s.title,
              rows:  s.rows.map((row) => ({
                rowId:       row.id,
                title:       row.title,
                description: row.description ?? '',
              })),
            })),
          },
        },
      }
    }

    // ── Template (WA Business) ───────────────────────────────────────────
    case 'template': {
      const r = rich as TemplateRichContent
      return {
        jid,
        content: {
          templateMessage: {
            fourRowTemplate: {
              content: {
                highlyStructuredMessage: {
                  namespace:         '',
                  elementName:       '',
                  params:            [],
                  fallbackLg:        'en',
                  fallbackLc:        'US',
                  localizableParams: [],
                  deterministicLg:   '',
                  deterministicLc:   '',
                  overrideBodyText:  r.text,
                },
              },
              buttons: r.buttons,
            },
          },
        },
      }
    }

    // ── Fallback ────────────────────────────────────────────────────────────
    default:
      console.warn(
        `[wa-send-mapper] Unknown richContent type: ${(rich as any)?.type ?? 'undefined'} — falling back to text`,
      )
      return { jid, content: { text: message.text ?? JSON.stringify(message.richContent) } }
  }
}

// ── Helper público ──────────────────────────────────────────────────────────────

/**
 * Convierte número de teléfono a JID de WhatsApp.
 * Idempotente: si recibe un JID ya formado (contiene '@'), lo retorna tal cual.
 *
 * '+52 123-456-7890'  → '521234567890@s.whatsapp.net'
 * '+521234567890'     → '521234567890@s.whatsapp.net'
 * '521234567890'      → '521234567890@s.whatsapp.net'
 * '120363@g.us'       → '120363@g.us'
 */
export function phoneToJid(phone: string): string {
  if (phone.includes('@')) return phone
  const cleaned = phone.replace(/[\s\-+()]/g, '')
  return `${cleaned}@s.whatsapp.net`
}
