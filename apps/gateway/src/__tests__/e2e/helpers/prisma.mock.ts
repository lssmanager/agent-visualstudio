/**
 * [F3a-10] prisma.mock.ts
 *
 * Mock en memoria de los modelos Prisma relevantes para el E2E de Telegram.
 * No hay conexión a ninguna BD real.
 *
 * Modelos mockeados:
 *   channelConfig.findUnique  → devuelve config de test fija
 *   gatewaySession.upsert     → persiste en Map en memoria
 *   gatewaySession.findFirst  → lee del Map en memoria
 *   agentProfile.findFirst    → devuelve perfil fijo de test
 *
 * _reset(): limpia el estado entre tests (llamar en beforeEach).
 *
 * FIX [PR#144-C2]: Selectores alineados con el schema Prisma canónico:
 *   - @@unique([channelConfigId, externalId]) → selector channelConfigId_externalId
 *   - externalUserId → externalId en todos los where y data
 *   - buildSessionKey() centraliza la lógica de clave del Map
 */

import { vi } from 'vitest'
import {
  CHANNEL_CONFIG_ID,
  TELEGRAM_BOT_TOKEN,
  WEBHOOK_SECRET,
  AGENT_ID,
} from './telegram.fixtures'

// Estado en memoria
const sessions = new Map<string, Record<string, unknown>>()

/** Construye la clave canónica del Map para una sesión. */
function buildSessionKey(channelConfigId: string, externalId: string): string {
  return `${channelConfigId}:${externalId}`
}

export const prismaMock = {
  channelConfig: {
    findUnique: vi.fn((args: { where: { id: string } }) => {
      if (args.where.id === CHANNEL_CONFIG_ID) {
        return Promise.resolve({
          id:               CHANNEL_CONFIG_ID,
          type:             'telegram',
          name:             'Test Telegram Channel',
          isActive:         true,
          secretsEncrypted: JSON.stringify({
            botToken:      TELEGRAM_BOT_TOKEN,
            webhookSecret: WEBHOOK_SECRET,
          }),
          config: {},
          bindings: [
            {
              agentId:    AGENT_ID,
              isDefault:  true,
              scopeLevel: 'agent',
              scopeId:    AGENT_ID,
            },
          ],
        })
      }
      return Promise.resolve(null)
    }),
  },

  gatewaySession: {
    upsert: vi.fn((args: {
      where:  Record<string, unknown>
      create: Record<string, unknown>
      update: Record<string, unknown>
    }) => {
      // FIX [PR#144-C2]: selector canónico channelConfigId_externalId (@@unique)
      // con fallback a externalUserId para retrocompatibilidad con callers legacy.
      const canonical = args.where.channelConfigId_externalId as
        | { channelConfigId: string; externalId: string }
        | undefined

      const channelId = canonical?.channelConfigId
        ?? String(args.where.channelConfigId ?? CHANNEL_CONFIG_ID)
      const extId     = canonical?.externalId
        ?? String(args.where.externalId ?? args.where.externalUserId ?? args.where.id ?? '')

      const key      = buildSessionKey(channelId, extId)
      const existing = sessions.get(key) ?? {}
      const updated  = { ...existing, ...args.create, ...args.update, id: key }
      sessions.set(key, updated)
      return Promise.resolve(updated)
    }),

    findFirst: vi.fn((args: {
      where: {
        channelConfigId?: string
        externalId?:      string
        externalUserId?:  string   // legacy — aceptar pero preferir externalId
      }
    }) => {
      // FIX [PR#144-C2]: preferir externalId, aceptar externalUserId como fallback
      const channelId = args.where.channelConfigId ?? CHANNEL_CONFIG_ID
      const extId     = args.where.externalId ?? args.where.externalUserId ?? ''
      const key = buildSessionKey(channelId, extId)
      return Promise.resolve(sessions.get(key) ?? null)
    }),

    findUnique: vi.fn(() => Promise.resolve(null)),

    create: vi.fn((args: { data: Record<string, unknown> }) => {
      // FIX [PR#144-C2]: preferir externalId en data
      const extId = String(args.data.externalId ?? args.data.externalUserId ?? '')
      const key   = buildSessionKey(CHANNEL_CONFIG_ID, extId)
      const record = { ...args.data, id: key }
      sessions.set(key, record)
      return Promise.resolve(record)
    }),

    update: vi.fn((args: {
      where: Record<string, unknown>
      data:  Record<string, unknown>
    }) => {
      // FIX [PR#144-C2]: selector canónico con fallback
      const canonical = args.where.channelConfigId_externalId as
        | { channelConfigId: string; externalId: string }
        | undefined

      const channelId = canonical?.channelConfigId
        ?? String(args.where.channelConfigId ?? CHANNEL_CONFIG_ID)
      const extId     = canonical?.externalId
        ?? String(args.where.externalId ?? args.where.externalUserId ?? args.where.id ?? '')

      const key      = buildSessionKey(channelId, extId)
      const existing = sessions.get(key) ?? {}
      const updated  = { ...existing, ...args.data }
      sessions.set(key, updated)
      return Promise.resolve(updated)
    }),
  },

  agentProfile: {
    findFirst: vi.fn(() =>
      Promise.resolve({
        id:            'profile-001',
        agentId:       AGENT_ID,
        systemPrompt:  'You are a test agent.',
        persona:       null,
        knowledgeBase: null,
      })
    ),
  },

  conversationMessage: {
    create:   vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve(args.data)),
    findMany: vi.fn(() => Promise.resolve([])),
  },

  agent: {
    findUnique: vi.fn(() =>
      Promise.resolve({
        id:           AGENT_ID,
        name:         'Test Agent',
        systemPrompt: 'You are a test agent.',
        model:        'openai/gpt-4o',
      })
    ),
  },

  /** Resetea estado entre tests */
  _reset() {
    sessions.clear()
    vi.clearAllMocks()
  },
}

export type PrismaMock = typeof prismaMock
