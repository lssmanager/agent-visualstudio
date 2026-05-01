import { describe, it, expect } from 'vitest'
import { ChannelType } from '@prisma/client'
import {
  TelegramCredentialsSchema,
  WhatsAppCredentialsSchema,
  DiscordCredentialsSchema,
  TeamsCredentialsSchema,
  SlackCredentialsSchema,
  CREDENTIALS_SCHEMA_BY_TYPE,
  parseCredentials,
  safeParseCredentials,
} from '../credentials-schema.js'
import { CreateChannelConfigSchema } from '../../../apps/api/src/modules/channels/dto/create-channel-config.dto.js'

const VALID_TELEGRAM_TOKEN = '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij'

describe('TelegramCredentialsSchema', () => {
  it('parses valid bot token', () => {
    expect(() =>
      TelegramCredentialsSchema.parse({ botToken: VALID_TELEGRAM_TOKEN })
    ).not.toThrow()
  })

  it('rejects short token', () => {
    expect(() =>
      TelegramCredentialsSchema.parse({ botToken: 'short' })
    ).toThrow()
  })

  it('rejects token without colon separator (regex)', () => {
    expect(() =>
      TelegramCredentialsSchema.parse({ botToken: 'nodots_and_no_colon_____________________' })
    ).toThrow()
  })
})

describe('WhatsAppCredentialsSchema', () => {
  const base = {
    accessToken:        'longaccesstoken_here_12345',
    phoneNumberId:      '12345678901',
    wabaId:             '98765432109',
    webhookVerifyToken: 'verify_me_please',
  }

  it('parses valid full payload', () => {
    expect(() => WhatsAppCredentialsSchema.parse(base)).not.toThrow()
  })

  it('rejects missing accessToken', () => {
    const { accessToken: _, ...rest } = base
    expect(() => WhatsAppCredentialsSchema.parse(rest)).toThrow()
  })

  it('rejects missing webhookVerifyToken', () => {
    const { webhookVerifyToken: _, ...rest } = base
    expect(() => WhatsAppCredentialsSchema.parse(rest)).toThrow()
  })
})

describe('DiscordCredentialsSchema', () => {
  it('rejects publicKey with length != 64', () => {
    expect(() =>
      DiscordCredentialsSchema.parse({
        botToken:      'x'.repeat(50),
        publicKey:     'x'.repeat(63),
        applicationId: '1234567890',
      })
    ).toThrow()
  })

  it('accepts publicKey with exactly 64 chars', () => {
    expect(() =>
      DiscordCredentialsSchema.parse({
        botToken:      'x'.repeat(50),
        publicKey:     'a'.repeat(64),
        applicationId: '1234567890',
      })
    ).not.toThrow()
  })
})

describe('TeamsCredentialsSchema', () => {
  it('rejects non-uuid appId', () => {
    expect(() =>
      TeamsCredentialsSchema.parse({
        appId:       'not-a-uuid',
        appPassword: 'secret1234',
      })
    ).toThrow()
  })

  it('accepts valid uuid appId', () => {
    expect(() =>
      TeamsCredentialsSchema.parse({
        appId:       '550e8400-e29b-41d4-a716-446655440000',
        appPassword: 'secret1234',
      })
    ).not.toThrow()
  })
})

describe('SlackCredentialsSchema', () => {
  const validSigning = 'x'.repeat(20)

  it('accepts valid xoxb- token', () => {
    expect(() =>
      SlackCredentialsSchema.parse({ botToken: 'xoxb-abc123', signingSecret: validSigning })
    ).not.toThrow()
  })

  it('rejects token not starting with xoxb-', () => {
    expect(() =>
      SlackCredentialsSchema.parse({ botToken: 'xoxa-abc123', signingSecret: validSigning })
    ).toThrow()
  })
})

describe('parseCredentials / safeParseCredentials', () => {
  it('parseCredentials(telegram, valid) returns typed object', () => {
    const result = parseCredentials(ChannelType.telegram, { botToken: VALID_TELEGRAM_TOKEN })
    expect(result.botToken).toBe(VALID_TELEGRAM_TOKEN)
  })

  it('parseCredentials(telegram, invalid) throws ZodError', () => {
    expect(() => parseCredentials(ChannelType.telegram, { botToken: 'bad' })).toThrow()
  })

  it('safeParseCredentials(whatsapp, invalid) returns success=false', () => {
    const result = safeParseCredentials(ChannelType.whatsapp, { bad: 'data' })
    expect(result.success).toBe(false)
  })
})

describe('CREDENTIALS_SCHEMA_BY_TYPE', () => {
  it('has exactly 7 entries (one per ChannelType value)', () => {
    const channelTypeValues = Object.values(ChannelType)
    const schemaKeys = Object.keys(CREDENTIALS_SCHEMA_BY_TYPE)
    expect(schemaKeys.length).toBe(7)
    expect(schemaKeys.sort()).toEqual(channelTypeValues.sort())
  })
})

describe('CreateChannelConfigSchema discriminated union', () => {
  it('rejects telegram type paired with WhatsApp credentials', () => {
    const result = CreateChannelConfigSchema.safeParse({
      type:        ChannelType.telegram,
      name:        'Test',
      credentials: {
        accessToken:        'longaccesstoken_here_12345',
        phoneNumberId:      '12345678901',
        wabaId:             '98765432109',
        webhookVerifyToken: 'verify_me_please',
      },
      config: {},
    })
    expect(result.success).toBe(false)
  })
})
