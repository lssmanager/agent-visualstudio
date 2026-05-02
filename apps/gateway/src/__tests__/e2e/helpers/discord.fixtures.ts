/**
 * discord.fixtures.ts — [F3a-39]
 *
 * Fixtures para interacciones de Discord (slash commands e interactions endpoint).
 * El gateway Discord recibe POST a /gateway/discord/:channelId/interactions.
 *
 * Referencia: https://discord.com/developers/docs/interactions/receiving-and-responding
 */

export const DISCORD_CHANNEL_ID = 'channel-discord-test-001'
export const DISCORD_GUILD_ID   = 'guild-test-001'
export const DISCORD_APP_ID     = 'app-test-001'
export const DISCORD_USER_ID    = 'user-discord-001'
export const DISCORD_AGENT_ID   = 'agent-test-discord-001'

// En modo test el adapter bypasea la verificación Ed25519 cuando
// recibe este header especial (NODE_ENV=test)
export const DISCORD_TEST_BYPASS_HEADER = 'x-discord-test-bypass'

/**
 * Headers de firma para tests — el adapter debe aceptarlos en NODE_ENV=test.
 * En producción, se verifican con la clave pública Ed25519 real.
 */
export function makeDiscordSignatureHeaders(
  _body    = '',
  timestamp = String(Math.floor(Date.now() / 1000)),
): Record<string, string> {
  return {
    'x-signature-ed25519':   'test-signature-bypass',
    'x-signature-timestamp':  timestamp,
    [DISCORD_TEST_BYPASS_HEADER]: 'true',
  }
}

/** Payload PING (type=1) — Discord verifica el endpoint con esto primero */
export function makeDiscordPing(): object {
  return { type: 1 }
}

/** Payload APPLICATION_COMMAND (type=2) — slash command /ask */
export function makeDiscordSlashAsk(query: string): object {
  return {
    type:           2,
    id:             `interaction-${Date.now()}`,
    application_id: DISCORD_APP_ID,
    guild_id:       DISCORD_GUILD_ID,
    channel_id:     `dchannel-001`,
    member: {
      user: {
        id:            DISCORD_USER_ID,
        username:      'testuser',
        discriminator: '0001',
      },
    },
    data: {
      id:      'cmd-ask-001',
      name:    'ask',
      type:    1,
      options: [{
        name:  'query',
        type:  3,
        value: query,
      }],
    },
    token:   `interaction-token-${Date.now()}`,
    version: 1,
  }
}

/** Payload APPLICATION_COMMAND /status */
export function makeDiscordSlashStatus(): object {
  return {
    type:           2,
    id:             `interaction-status-${Date.now()}`,
    application_id: DISCORD_APP_ID,
    guild_id:       DISCORD_GUILD_ID,
    channel_id:     `dchannel-001`,
    member: {
      user: { id: DISCORD_USER_ID, username: 'testuser', discriminator: '0001' },
    },
    data: {
      id:   'cmd-status-001',
      name: 'status',
      type: 1,
    },
    token:   `interaction-token-status-${Date.now()}`,
    version: 1,
  }
}

/** Payload MESSAGE_COMPONENT (type=3) — button click */
export function makeDiscordButtonClick(customId: string): object {
  return {
    type:           3,
    id:             `interaction-btn-${Date.now()}`,
    application_id: DISCORD_APP_ID,
    guild_id:       DISCORD_GUILD_ID,
    channel_id:     `dchannel-001`,
    member: {
      user: { id: DISCORD_USER_ID, username: 'testuser', discriminator: '0001' },
    },
    data: { component_type: 2, custom_id: customId },
    token:   `btn-token-${Date.now()}`,
    version: 1,
  }
}
