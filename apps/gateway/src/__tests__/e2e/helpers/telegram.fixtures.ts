/**
 * [F3a-10] telegram.fixtures.ts
 *
 * Payloads predefinidos que Telegram enviaría al webhook del gateway.
 * Todos los valores son controlados — nunca leer de .env en tests.
 */

export const TELEGRAM_CHAT_ID   = 12345
export const TELEGRAM_USER_ID   = 67890
export const TELEGRAM_BOT_TOKEN = 'test-bot-token-abc123'
export const WEBHOOK_SECRET     = 'test-webhook-secret'
export const CHANNEL_CONFIG_ID  = 'cc-telegram-test-001'
export const AGENT_ID           = 'agent-test-001'

/** Payload normal: mensaje de texto */
export function makeTelegramTextUpdate(
  text:    string,
  chatId = TELEGRAM_CHAT_ID,
  userId = TELEGRAM_USER_ID,
) {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: {
      message_id: Math.floor(Math.random() * 10_000),
      chat: { id: chatId },
      from: { id: userId, username: 'testuser' },
      text,
    },
  }
}

/** Payload de comando: /start (u otro comando arbitrario) */
export function makeTelegramCommandUpdate(command = '/start') {
  return makeTelegramTextUpdate(command)
}

/** Payload de callback_query (botón inline) */
export function makeTelegramCallbackQuery(data: string) {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    callback_query: {
      id:      'cbq-001',
      data,
      message: { chat: { id: TELEGRAM_CHAT_ID } },
      from:    { id: TELEGRAM_USER_ID },
    },
  }
}

/**
 * Payload sin campo text (foto, sticker, etc.).
 * El adapter debe ignorarlo — AgentExecutor nunca debe ser llamado.
 */
export function makeTelegramPhotoUpdate() {
  return {
    update_id: 999_001,
    message: {
      message_id: 1,
      chat:  { id: TELEGRAM_CHAT_ID },
      from:  { id: TELEGRAM_USER_ID },
      photo: [{ file_id: 'abc', width: 100, height: 100 }],
      // Intencionalmente SIN campo text
    },
  }
}
