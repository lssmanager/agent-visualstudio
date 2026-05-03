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
 *   - @@unique([channelConfigId, externalUserId]) → selector channelConfigId_externalUserId
 *   - buildSessionKey() centraliza la lógica de clave del Map
 *   - fallbacks a externalId/externalUserId para retrocompatibilidad con callers legacy
 *
 * FIX [PR#252 CR]: selector canónico corregido de channelConfigId_externalId a
 *   channelConfigId_externalUserId para alinearse con el @@unique real del schema
 *   Prisma. Sin este fix los tests E2E pasaban contra un constraint inexistente
 *   en producción, enmascarando regressions de resolución de sesión.
 */

import { vi } from 'vitest'
import {
  CHANNEL_CONFIG_ID,
  TELEGRAM_BOT_TOKEN,
  WEBHOOK_SECRET,
  AGENT_ID,
} from './telegram.fixtures.js'

// Estado en memoria
const sessions = new Map<string, Record<string, unknown>>()

/**
 * Construye la clave canónica del Map para una sesión.
 * Usa channelConfigId + externalUserId para alinearse con el
 * @@unique([channelConfigId, externalUserId]) del schema Prisma.
 */
function buildSessionKey(channelConfigId: string, externalUserId: string): string {
  return `${channelConfigId}:${externalUserId}`
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
      // FIX [PR#252 CR]: selector canónico channelConfigId_externalUserId (@@unique real)
      // con fallback a channelConfigId_externalId y externalId/externalUserId para
      // retrocompatibilidad con callers legacy.
      const canonicalNew = args.where.channelConfigId_externalUserId as
        | { channelConfigId: string; externalUserId: string }
        | undefined
      const canonicalLegacy = args.where.channelConfigId_externalId as
        | { channelConfigId: string; externalId: string }
        | undefined

      const channelId = canonicalNew?.channelConfigId
        ?? canonicalLegacy?.channelConfigId
        ?? String(args.where.channelConfigId ?? CHANNEL_CONFIG_ID)
      const extId     = canonicalNew?.externalUserId
        ?? canonicalLegacy?.externalId
        ?? String(args.where.externalUserId ?? args.where.externalId ?? args.where.id ?? '')

      const key      = buildSessionKey(channelId, extId)
      const existing = sessions.get(key) ?? {}
      const updated  = { ...existing, ...args.create, ...args.update, id: key }
      sessions.set(key, updated)
      return Promise.resolve(updated)
    }),

    findFirst: vi.fn((args: {
      where: {
        channelConfigId?: string
        externalUserId?:  string
        externalId?:      string   // legacy — aceptar pero preferir externalUserId
      }
    }) => {
      // FIX [PR#252 CR]: preferir externalUserId (campo canónico @@unique),
      // aceptar externalId como fallback para callers legacy.
      const channelId = args.where.channelConfigId ?? CHANNEL_CONFIG_ID
      const extId     = args.where.externalUserId ?? args.where.externalId ?? ''
      const key = buildSessionKey(channelId, extId)
      return Promise.resolve(sessions.get(key) ?? null)
    }),

    findUnique: vi.fn(() => Promise.resolve(null)),

    create: vi.fn((args: { data: Record<string, unknown> }) => {
      // FIX [PR#252 CR]: preferir externalUserId (campo canónico) en data
      const extId = String(args.data.externalUserId ?? args.data.externalId ?? '')
      const key   = buildSessionKey(CHANNEL_CONFIG_ID, extId)
      const record = { ...args.data, id: key }
      sessions.set(key, record)
      return Promise.resolve(record)
    }),

    update: vi.fn((args: {
      where: Record<string, unknown>
      data:  Record<string, unknown>
    }) => {
      // FIX [PR#252 CR]: selector canónico channelConfigId_externalUserId con fallback
      const canonicalNew = args.where.channelConfigId_externalUserId as
        | { channelConfigId: string; externalUserId: string }
        | undefined
      const canonicalLegacy = args.where.channelConfigId_externalId as
        | { channelConfigId: string; externalId: string }
        | undefined

      const channelId = canonicalNew?.channelConfigId
        ?? canonicalLegacy?.channelConfigId
        ?? String(args.where.channelConfigId ?? CHANNEL_CONFIG_ID)
      const extId     = canonicalNew?.externalUserId
        ?? canonicalLegacy?.externalId
        ?? String(args.where.externalUserId ?? args.where.externalId ?? args.where.id ?? '')

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
