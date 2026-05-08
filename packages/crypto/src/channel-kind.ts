/**
 * channel-kind.ts — Runtime enum para ChannelKind / ChannelType
 *
 * Prisma genera estos enums en @prisma/client, pero solo después de
 * `prisma generate`. En CI (tsc antes de generate) causan TS2305.
 *
 * SOLUCIÓN: definir aquí como const object (valor runtime + tipo).
 * DEBE mantenerse en sync con enum ChannelKind en prisma/schema.prisma.
 *
 * Sync check: si añades un canal al schema.prisma, añádelo aquí también.
 */

// Const object — funciona como runtime enum
export const ChannelKind = {
  telegram: 'telegram',
  whatsapp: 'whatsapp',
  discord:  'discord',
  webchat:  'webchat',
  slack:    'slack',
  teams:    'teams',
  webhook:  'webhook',
} as const;

export type ChannelKind = typeof ChannelKind[keyof typeof ChannelKind];

// Alias backward-compat (schema tiene ChannelType como alias de ChannelKind)
export const ChannelType = ChannelKind;
export type ChannelType = ChannelKind;
