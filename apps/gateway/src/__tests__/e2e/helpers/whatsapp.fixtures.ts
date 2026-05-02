/**
 * whatsapp.fixtures.ts — [F3a-39]
 *
 * Fixtures para webhooks de WhatsApp Business API (Meta, modo token).
 * NO cubre modo QR/Baileys — ese modo no usa webhooks HTTP.
 *
 * Referencia: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */

export const WA_CHANNEL_ID      = 'channel-whatsapp-test-001'
export const WA_PHONE_NUMBER_ID = '1234567890'
export const WA_FROM            = '5491112345678'
export const WA_BUSINESS_ID     = 'biz-001'
export const WA_WEBHOOK_TOKEN   = 'wa-verify-token-test'
export const WA_APP_SECRET      = 'wa-app-secret-test'
export const WA_AGENT_ID        = 'agent-test-wa-001'

/** Payload de verificación de webhook (GET, modo hub.challenge) */
export function makeWaVerifyChallenge(
  token = WA_WEBHOOK_TOKEN,
): Record<string, string> {
  return {
    'hub.mode':          'subscribe',
    'hub.challenge':     'CHALLENGE_CODE',
    'hub.verify_token':  token,
  }
}

/** Payload de mensaje de texto entrante (POST) */
export function makeWaTextMessage(
  text: string,
  from = WA_FROM,
): object {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: WA_BUSINESS_ID,
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '15550000001',
            phone_number_id:      WA_PHONE_NUMBER_ID,
          },
          contacts: [{ profile: { name: 'Test User' }, wa_id: from }],
          messages: [{
            from,
            id:        `wamid.${Date.now()}`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            text:      { body: text },
            type:      'text',
          }],
        },
        field: 'messages',
      }],
    }],
  }
}

/** Payload de mensaje de imagen (para test de skip de contenido no-texto) */
export function makeWaImageMessage(
  from = WA_FROM,
): object {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: WA_BUSINESS_ID,
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '15550000001',
            phone_number_id:      WA_PHONE_NUMBER_ID,
          },
          contacts: [{ profile: { name: 'Test User' }, wa_id: from }],
          messages: [{
            from,
            id:        `wamid.img.${Date.now()}`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            image:     { id: 'img-001', mime_type: 'image/jpeg', sha256: 'abc', caption: '' },
            type:      'image',
          }],
        },
        field: 'messages',
      }],
    }],
  }
}

/** Entry vacío sin messages (e.g. status update) — debe ignorarse */
export function makeWaStatusUpdate(): object {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: WA_BUSINESS_ID,
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '15550000001',
            phone_number_id:      WA_PHONE_NUMBER_ID,
          },
          statuses: [{
            id:          `wamid.status.${Date.now()}`,
            status:      'delivered',
            timestamp:   String(Math.floor(Date.now() / 1000)),
            recipient_id: WA_FROM,
          }],
        },
        field: 'messages',
      }],
    }],
  }
}

/**
 * Genera el header de firma HMAC-SHA256 para un payload dado.
 * Usado para simular una petición legítima de Meta.
 */
export function makeWaSignatureHeader(
  payload: string,
  secret  = WA_APP_SECRET,
): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('node:crypto') as typeof import('node:crypto')
  const hmac   = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `sha256=${hmac}`
}
