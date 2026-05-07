/**
 * whatsapp-message.mapper.ts — [F3a-24]
 *
 * Normaliza WAMessage (proto.IWebMessageInfo de Baileys) a IncomingMessage.
 *
 * Función principal: baileysToIncoming()
 *   - Retorna IncomingMessage si el mensaje es procesable
 *   - Retorna null si el mensaje debe ignorarse:
 *       * mensajes del propio bot (fromMe = true)
 *       * mensajes de sistema (protocolMessage, ephemeralMessage, etc.)
 *       * tipos no soportados
 *
 * Diseño:
 *   - Función pura — sin efectos secundarios, sin imports de servicios
 *   - Los datos raw de Baileys siempre se preservan en rawPayload
 *   - La URL de media NO se descarga aquí — el caller puede pedirla
 *     via sock.downloadMediaMessage() usando rawPayload
 *
 * FIX [PR#229]: baileysToIncoming() ahora requiere channelConfigId como
 * segundo parámetro. Todos los retornos incluyen channelConfigId y
 * channelType: 'whatsapp' para satisfacer el contrato de IncomingMessage.
 */

import type { proto }          from '@whiskeysockets/baileys'
import type { IncomingMessage } from './channel-adapter.interface'

// ── Tipos de mensajes que silenciosamente ignoramos ─────────────────────

const IGNORED_MSG_TYPES = new Set([
  'protocolMessage',
  'ephemeralMessage',
  'senderKeyDistributionMessage',
  'pollCreationMessage',
  'pollUpdateMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'liveLocationMessage',
  'callLogMesssage',
  'requestPaymentMessage',
  'sendPaymentMessage',
])

// ── Opciones ─────────────────────────────────────────────────────────────────

export interface BaileysMapperOptions {
  /** Si true, los mensajes de reacción se procesan como type 'command'. Default: false */
  processReactions?: boolean
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Convierte un WAMessage de Baileys en IncomingMessage normalizado.
 *
 * @param waMsg           - Mensaje raw de Baileys (proto.IWebMessageInfo)
 * @param channelConfigId - ID del ChannelConfig en BD (requerido para el contrato)
 * @param opts            - Opciones de procesamiento
 * @returns IncomingMessage normalizado, o null si debe ignorarse
 */
export function baileysToIncoming(
  waMsg: proto.IWebMessageInfo,
  channelConfigId: string,
  opts: BaileysMapperOptions = {},
): IncomingMessage | null {

  // 1. Ignorar mensajes propios (el bot enviando)
  if (waMsg.key.fromMe) return null

  // 2. Ignorar status broadcasts
  const remoteJid = waMsg.key.remoteJid ?? ''
  if (remoteJid === 'status@broadcast') return null

  // 3. Extraer JID del remitente y del chat
  const senderJid = waMsg.key.participant ?? remoteJid   // en grupos, participant ≠ jid
  const isGroup   = isGroupJid(remoteJid)

  // 4. Normalizar JID → número de teléfono
  const externalId = jidToPhone(remoteJid)
  const senderId   = jidToPhone(senderJid)

  if (!externalId) {
    console.warn('[wa-mapper] Could not extract phone from JID:', remoteJid)
    return null
  }

  // 5. Obtener el contenido del mensaje
  const msgContent = waMsg.message
  if (!msgContent) return null

  // 6. Detectar tipo y comprobar si debe ignorarse
  const msgKey = detectMessageKey(msgContent)
  if (!msgKey) return null

  // 7. Ignorar tipos de sistema (reactionMessage se ignora por defecto)
  if (IGNORED_MSG_TYPES.has(msgKey)) return null
  if (msgKey === 'reactionMessage' && !opts.processReactions) return null

  // 8. Timestamp normalizado
  const timestamp = waMsg.messageTimestamp
    ? new Date(Number(waMsg.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString()

  // 9. rawPayload: el WAMessage completo (sin secretos — Baileys no los incluye aquí)
  const rawPayload = waMsg as unknown as Record<string, unknown>

  // 10. Base metadata
  const baseMetadata: Record<string, unknown> = {
    msgId:   waMsg.key.id ?? '',
    jid:     remoteJid,
    isGroup,
    pushName: (waMsg as any).pushName ?? '',
  }

  // 11. Mapear por tipo — pasamos channelConfigId para incluirlo en base
  return mapByType(msgKey, msgContent, {
    channelConfigId,
    externalId,
    senderId,
    threadId:    externalId,   // WA no tiene threads — threadId === externalId
    rawPayload,
    timestamp,
    baseMetadata,
  })
}

// ── Detectar tipo de mensaje ───────────────────────────────────────────────────

const KNOWN_KEYS: (keyof proto.IMessage)[] = [
  'conversation',
  'extendedTextMessage',
  'imageMessage',
  'audioMessage',
  'videoMessage',
  'documentMessage',
  'stickerMessage',
  'locationMessage',
  'contactMessage',
  'reactionMessage',
  'protocolMessage',
  'ephemeralMessage',
  'senderKeyDistributionMessage',
  'pollCreationMessage',
  'pollUpdateMessage',
]

function detectMessageKey(msg: proto.IMessage): string | null {
  for (const key of KNOWN_KEYS) {
    if (msg[key] != null) return key as string
  }
  const fallback = Object.keys(msg).find((k) => (msg as any)[k] != null)
  return fallback ?? null
}

// ── Contexto de mapeo ────────────────────────────────────────────────────────────

interface MapCtx {
  channelConfigId: string    // FIX [PR#229]: requerido para contrato IncomingMessage
  externalId:      string
  senderId:        string
  threadId:        string
  rawPayload:      Record<string, unknown>
  timestamp:       string
  baseMetadata:    Record<string, unknown>
}

// ── Mapeo por tipo ────────────────────────────────────────────────────────────────

function mapByType(
  key:     string,
  content: proto.IMessage,
  ctx:     MapCtx,
): IncomingMessage | null {

  // FIX [PR#229]: base incluye channelConfigId y channelType en todos los retornos
  const base = {
    channelConfigId: ctx.channelConfigId,
    channelType:     'whatsapp' as const,
    externalId:  ctx.externalId,
    senderId:    ctx.senderId,
    threadId:    ctx.threadId,
    rawPayload:  ctx.rawPayload,
    receivedAt:  ctx.timestamp,
  }

  switch (key) {

    // ── Texto plano ─────────────────────────────────────────────────
    case 'conversation': {
      const text = content.conversation ?? ''
      return {
        ...base,
        text,
        type: text.startsWith('/') ? 'command' : 'text',
        metadata: { ...ctx.baseMetadata },
      }
    }

    // ── Texto enriquecido ──────────────────────────────────────────────
    case 'extendedTextMessage': {
      const text = content.extendedTextMessage?.text ?? ''
      return {
        ...base,
        text,
        type: text.startsWith('/') ? 'command' : 'text',
        metadata: {
          ...ctx.baseMetadata,
          contextInfo: content.extendedTextMessage?.contextInfo,
          previewUrl:  content.extendedTextMessage?.canonicalUrl,
        },
      }
    }

    // ── Imagen ────────────────────────────────────────────────────
    case 'imageMessage':
      return {
        ...base,
        text:  content.imageMessage?.caption ?? '',
        type:  'image',
        attachments: [{
          type: 'image',
          data: {
            mimetype: content.imageMessage?.mimetype ?? 'image/jpeg',
            caption:  content.imageMessage?.caption  ?? '',
          },
        }],
        metadata: { ...ctx.baseMetadata },
      }

    // ── Audio / nota de voz ───────────────────────────────────────────
    case 'audioMessage':
      return {
        ...base,
        text: '',
        type: 'audio',
        attachments: [{
          type: content.audioMessage?.ptt ? 'voice_note' : 'audio',
          data: {
            mimetype: content.audioMessage?.mimetype ?? 'audio/ogg',
            seconds:  content.audioMessage?.seconds  ?? 0,
            ptt:      content.audioMessage?.ptt      ?? false,
          },
        }],
        metadata: { ...ctx.baseMetadata },
      }

    // ── Video ─────────────────────────────────────────────────────
    case 'videoMessage':
      return {
        ...base,
        text:  content.videoMessage?.caption ?? '',
        type:  'file',
        attachments: [{
          type: 'video',
          data: {
            mimetype: content.videoMessage?.mimetype ?? 'video/mp4',
            caption:  content.videoMessage?.caption  ?? '',
            seconds:  content.videoMessage?.seconds  ?? 0,
          },
        }],
        metadata: { ...ctx.baseMetadata },
      }

    // ── Documento ───────────────────────────────────────────────────
    case 'documentMessage':
      return {
        ...base,
        text:  content.documentMessage?.caption ?? '',
        type:  'file',
        attachments: [{
          type: 'document',
          data: {
            fileName: content.documentMessage?.fileName ?? 'document',
            mimetype: content.documentMessage?.mimetype ?? 'application/octet-stream',
            fileSize: content.documentMessage?.fileLength ?? 0,
          },
        }],
        metadata: { ...ctx.baseMetadata },
      }

    // ── Sticker ────────────────────────────────────────────────────
    case 'stickerMessage':
      return {
        ...base,
        text:  '[sticker]',
        type:  'image',
        attachments: [{
          type: 'sticker',
          data: {
            mimetype:   content.stickerMessage?.mimetype    ?? 'image/webp',
            isAnimated: content.stickerMessage?.isAnimated ?? false,
          },
        }],
        metadata: { ...ctx.baseMetadata },
      }

    // ── Ubicación ──────────────────────────────────────────────────
    case 'locationMessage': {
      const lat  = content.locationMessage?.degreesLatitude  ?? 0
      const lng  = content.locationMessage?.degreesLongitude ?? 0
      const name = content.locationMessage?.name ?? ''
      return {
        ...base,
        text: name
          ? `📍 ${name} (${lat}, ${lng})`
          : `📍 Location: ${lat}, ${lng}`,
        type: 'text',
        metadata: {
          ...ctx.baseMetadata,
          location: { lat, lng, name },
        },
      }
    }

    // ── Contacto ───────────────────────────────────────────────────
    case 'contactMessage': {
      const displayName = content.contactMessage?.displayName ?? 'Contact'
      const vcard       = content.contactMessage?.vcard ?? ''
      const telMatch    = vcard.match(/TEL[^:]*:([^\r\n]+)/)
      const phone       = telMatch?.[1]?.trim() ?? ''
      return {
        ...base,
        text: phone
          ? `👤 ${displayName}: ${phone}`
          : `👤 ${displayName}`,
        type: 'text',
        metadata: {
          ...ctx.baseMetadata,
          contact: { displayName, phone, vcard },
        },
      }
    }

    // ── Reacción ───────────────────────────────────────────────────
    case 'reactionMessage': {
      const emoji    = content.reactionMessage?.text ?? ''
      const targetId = content.reactionMessage?.key?.id ?? ''
      return {
        ...base,
        text:  emoji,
        type:  'command',
        metadata: {
          ...ctx.baseMetadata,
          reaction: { emoji, targetMessageId: targetId },
        },
      }
    }

    default:
      return null
  }
}

// ── Helpers públicos ────────────────────────────────────────────────────────────

/**
 * Convierte un JID de Baileys al número de teléfono sin sufijo.
 * Ejemplos:
 *   '521234567890@s.whatsapp.net'   → '521234567890'
 *   '521234567890:5@s.whatsapp.net' → '521234567890'  (multi-device)
 *   '120363123456@g.us'             → '120363123456'  (grupo)
 *   ''                              → ''
 */
export function jidToPhone(jid: string): string {
  if (!jid) return ''
  const withoutSuffix = jid.split('@')[0] ?? ''
  return withoutSuffix.split(':')[0] ?? ''
}

/**
 * Retorna true si el JID corresponde a un grupo de WhatsApp.
 */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us')
}
