/**
 * session-manager.test.ts
 *
 * 17 tests. PrismaClient completamente mockeado con vi.fn().
 * NO usa base de datos real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SessionManager } from '../session-manager.service.js'
import type { IncomingMessage, OutboundMessage } from '../types.js'

// ── Helpers de fixture ────────────────────────────────────────────────

const CHANNEL_CONFIG_ID = 'cfg-001'
const AGENT_ID          = 'agent-001'
const EXTERNAL_USER_ID  = 'tg-123456'
const SESSION_ID        = 'session-abc'

const NOW     = new Date('2026-04-30T20:00:00Z')
const STALE   = new Date('2026-04-28T20:00:00Z') // > 24h atrás
const FRESH   = new Date('2026-04-30T19:00:00Z') // < 24h atrás

function makeIncoming(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    externalId:  EXTERNAL_USER_ID,
    senderId:    EXTERNAL_USER_ID,
    text:        'Hola',
    type:        'text',
    receivedAt:  NOW.toISOString(),
    ...overrides,
  }
}

function makeSessionRow(updatedAt = FRESH) {
  return {
    id:              SESSION_ID,
    channelConfigId: CHANNEL_CONFIG_ID,
    externalUserId:  EXTERNAL_USER_ID,
    agentId:         AGENT_ID,
    updatedAt,
    createdAt:       NOW,
  }
}

function makeTurnRow(role: 'user' | 'assistant', text = 'msg', i = 0) {
  return {
    id:          `turn-${i}`,
    role,
    contentText: text,
    contentJson: { type: 'text', text, metadata: null },
    createdAt:   new Date(NOW.getTime() + i * 1000),
  }
}

// ── Mock PrismaClient ───────────────────────────────────────────────────

function makeMockDb() {
  return {
    gatewaySession: {
      upsert:     vi.fn(),
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
    conversationMessage: {
      create:     vi.fn(),
      findMany:   vi.fn(),
      deleteMany: vi.fn(),
    },
  } as unknown as any
}

// ── Tests ────────────────────────────────────────────────────────────

describe('SessionManager', () => {
  let db:      ReturnType<typeof makeMockDb>
  let manager: SessionManager

  beforeEach(() => {
    db      = makeMockDb()
    manager = new SessionManager(db as any)
  })

  // ── receiveUserMessage() ───────────────────────────────────────

  describe('receiveUserMessage()', () => {
    it('primera vez: crea sesión nueva y retorna history=[]', async () => {
      const row = makeSessionRow(NOW) // updatedAt = NOW = sesión recién creada
      db.gatewaySession.upsert.mockResolvedValue(row)
      db.conversationMessage.create.mockResolvedValue(makeTurnRow('user'))
      db.conversationMessage.findMany.mockResolvedValue([])

      const dto = await manager.receiveUserMessage(
        CHANNEL_CONFIG_ID, AGENT_ID, makeIncoming(),
      )

      expect(db.gatewaySession.upsert).toHaveBeenCalledOnce()
      expect(dto.id).toBe(SESSION_ID)
      expect(dto.history).toEqual([])
    })

    it('segunda vez: actualiza updatedAt y retorna turn anterior', async () => {
      const row = makeSessionRow(FRESH)
      db.gatewaySession.upsert.mockResolvedValue(row)
      db.conversationMessage.create.mockResolvedValue(makeTurnRow('user', 'Hola', 0))
      db.conversationMessage.findMany.mockResolvedValue([
        makeTurnRow('user', 'Mensaje previo', 1),
      ])

      const dto = await manager.receiveUserMessage(
        CHANNEL_CONFIG_ID, AGENT_ID, makeIncoming({ text: 'Hola' }),
      )

      expect(dto.history).toHaveLength(1)
      expect(dto.history[0]?.role).toBe('user')
    })

    it('crea ConversationMessage con role=user y el texto correcto', async () => {
      db.gatewaySession.upsert.mockResolvedValue(makeSessionRow(FRESH))
      db.conversationMessage.create.mockResolvedValue(makeTurnRow('user', 'Test msg'))
      db.conversationMessage.findMany.mockResolvedValue([])

      await manager.receiveUserMessage(
        CHANNEL_CONFIG_ID, AGENT_ID, makeIncoming({ text: 'Test msg' }),
      )

      expect(db.conversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'user', contentText: 'Test msg' }),
        }),
      )
    })

    it('sesión fría (>24h): retorna history=[] aunque haya turns en DB', async () => {
      db.gatewaySession.upsert.mockResolvedValue(makeSessionRow(STALE))
      db.conversationMessage.create.mockResolvedValue(makeTurnRow('user'))
      // findMany NO debería ser llamado en sesión fría
      db.conversationMessage.findMany.mockResolvedValue([
        makeTurnRow('user', 'viejo', 0),
      ])

      const dto = await manager.receiveUserMessage(
        CHANNEL_CONFIG_ID, AGENT_ID, makeIncoming(),
      )

      expect(dto.history).toEqual([])
      expect(db.conversationMessage.findMany).not.toHaveBeenCalled()
    })

    it('sesión caliente (<24h): retorna turns de DB', async () => {
      db.gatewaySession.upsert.mockResolvedValue(makeSessionRow(FRESH))
      db.conversationMessage.create.mockResolvedValue(makeTurnRow('user'))
      db.conversationMessage.findMany.mockResolvedValue([
        makeTurnRow('assistant', 'Hola user', 0),
        makeTurnRow('user',      'Gracias',   1),
      ])

      const dto = await manager.receiveUserMessage(
        CHANNEL_CONFIG_ID, AGENT_ID, makeIncoming(),
      )

      expect(dto.history).toHaveLength(2)
    })

    it('el DTO contiene campos ISO string correctos', async () => {
      db.gatewaySession.upsert.mockResolvedValue(makeSessionRow(FRESH))
      db.conversationMessage.create.mockResolvedValue(makeTurnRow('user'))
      db.conversationMessage.findMany.mockResolvedValue([])

      const dto = await manager.receiveUserMessage(
        CHANNEL_CONFIG_ID, AGENT_ID, makeIncoming(),
      )

      expect(dto.id).toBe(SESSION_ID)
      expect(dto.channelConfigId).toBe(CHANNEL_CONFIG_ID)
      expect(dto.externalUserId).toBe(EXTERNAL_USER_ID)
      expect(dto.agentId).toBe(AGENT_ID)
      expect(typeof dto.createdAt).toBe('string')
      expect(typeof dto.updatedAt).toBe('string')
    })

    it('sesión queda cacheada — segunda llamada no hace upsert a DB', async () => {
      db.gatewaySession.upsert.mockResolvedValue(makeSessionRow(FRESH))
      db.conversationMessage.create.mockResolvedValue(makeTurnRow('user'))
      db.conversationMessage.findMany.mockResolvedValue([])

      // Primera llamada — puebla la caché
      await manager.receiveUserMessage(CHANNEL_CONFIG_ID, AGENT_ID, makeIncoming())

      // Invalidar caché es necesario para que la segunda vuelta vaya a DB;
      // si NO invalidamos, la caché solo se actualiza en receiveUserMessage.
      // El test verifica que la caché está viva: findSessionByUser no hace query.
      const cached = await manager.findSessionByUser(CHANNEL_CONFIG_ID, EXTERNAL_USER_ID)

      expect(cached).not.toBeNull()
      // findUnique NO llamado porque el resultado vino de la caché
      expect(db.gatewaySession.findUnique).not.toHaveBeenCalled()
    })
  })

  // ── recordAssistantReply() ────────────────────────────────────

  describe('recordAssistantReply()', () => {
    it('crea ConversationMessage con role=assistant y texto correcto', async () => {
      const replyMsg = { ...makeTurnRow('assistant', 'Hola!'), createdAt: NOW }
      db.conversationMessage.create.mockResolvedValue(replyMsg)
      db.gatewaySession.update.mockResolvedValue({})

      const outbound: OutboundMessage = {
        externalUserId: EXTERNAL_USER_ID,
        text:           'Hola!',
      }
      await manager.recordAssistantReply(SESSION_ID, outbound)

      expect(db.conversationMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'assistant', contentText: 'Hola!' }),
        }),
      )
    })

    it('actualiza updatedAt de la sesión en DB', async () => {
      db.conversationMessage.create.mockResolvedValue({ ...makeTurnRow('assistant'), createdAt: NOW })
      db.gatewaySession.update.mockResolvedValue({})

      await manager.recordAssistantReply(SESSION_ID, { externalUserId: EXTERNAL_USER_ID, text: 'Ok' })

      expect(db.gatewaySession.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SESSION_ID } }),
      )
    })

    it('si la sesión está en caché → el nuevo turn se añade al history en memoria', async () => {
      // Poblar caché primero
      db.gatewaySession.upsert.mockResolvedValue(makeSessionRow(FRESH))
      db.conversationMessage.create.mockResolvedValue(makeTurnRow('user'))
      db.conversationMessage.findMany.mockResolvedValue([])
      await manager.receiveUserMessage(CHANNEL_CONFIG_ID, AGENT_ID, makeIncoming())

      const replyMsg = { ...makeTurnRow('assistant', 'Respuesta'), createdAt: NOW }
      db.conversationMessage.create.mockResolvedValue(replyMsg)
      db.gatewaySession.update.mockResolvedValue({})

      await manager.recordAssistantReply(SESSION_ID, { externalUserId: EXTERNAL_USER_ID, text: 'Respuesta' })

      const cached = await manager.findSessionByUser(CHANNEL_CONFIG_ID, EXTERNAL_USER_ID)
      expect(cached?.history.some((t) => t.role === 'assistant' && t.text === 'Respuesta')).toBe(true)
    })

    it('si history supera MAX_HISTORY_TURNS (40) → se trunca al sliding window', async () => {
      // Poblar caché con 40 turns artificiales
      db.gatewaySession.upsert.mockResolvedValue(makeSessionRow(FRESH))
      db.conversationMessage.create.mockResolvedValue(makeTurnRow('user'))
      const fortyTurns = Array.from({ length: 40 }, (_, i) => makeTurnRow('user', `msg${i}`, i))
      db.conversationMessage.findMany.mockResolvedValue(fortyTurns)
      await manager.receiveUserMessage(CHANNEL_CONFIG_ID, AGENT_ID, makeIncoming())

      // Añadir un turn más via recordAssistantReply
      const extra = { ...makeTurnRow('assistant', 'extra'), createdAt: NOW }
      db.conversationMessage.create.mockResolvedValue(extra)
      db.gatewaySession.update.mockResolvedValue({})
      await manager.recordAssistantReply(SESSION_ID, { externalUserId: EXTERNAL_USER_ID, text: 'extra' })

      const cached = await manager.findSessionByUser(CHANNEL_CONFIG_ID, EXTERNAL_USER_ID)
      expect(cached!.history.length).toBeLessThanOrEqual(40)
    })
  })

  // ── findSession() ──────────────────────────────────────────────────

  describe('findSession()', () => {
    it('retorna null si la sesión no existe en DB', async () => {
      db.gatewaySession.findUnique.mockResolvedValue(null)

      const result = await manager.findSession('nonexistent')
      expect(result).toBeNull()
    })

    it('retorna GatewaySessionDto con turns si existe', async () => {
      db.gatewaySession.findUnique.mockResolvedValue(makeSessionRow(FRESH))
      db.conversationMessage.findMany.mockResolvedValue([
        makeTurnRow('user', 'hi', 0),
      ])

      const result = await manager.findSession(SESSION_ID)
      expect(result).not.toBeNull()
      expect(result?.history).toHaveLength(1)
    })

    it('caché hit → no hace query a DB', async () => {
      // Poblar caché
      db.gatewaySession.upsert.mockResolvedValue(makeSessionRow(FRESH))
      db.conversationMessage.create.mockResolvedValue(makeTurnRow('user'))
      db.conversationMessage.findMany.mockResolvedValue([])
      await manager.receiveUserMessage(CHANNEL_CONFIG_ID, AGENT_ID, makeIncoming())

      vi.clearAllMocks() // resetear call counts

      const result = await manager.findSession(SESSION_ID)
      expect(result).not.toBeNull()
      expect(db.gatewaySession.findUnique).not.toHaveBeenCalled()
    })
  })

  // ── clearSessionHistory() ────────────────────────────────────────

  describe('clearSessionHistory()', () => {
    it('llama deleteMany en DB con el sessionId correcto', async () => {
      db.conversationMessage.deleteMany.mockResolvedValue({ count: 5 })

      await manager.clearSessionHistory(SESSION_ID)

      expect(db.conversationMessage.deleteMany).toHaveBeenCalledWith({
        where: { sessionId: SESSION_ID },
      })
    })

    it('si la sesión está en caché → history queda vacío en memoria', async () => {
      // Poblar caché
      db.gatewaySession.upsert.mockResolvedValue(makeSessionRow(FRESH))
      db.conversationMessage.create.mockResolvedValue(makeTurnRow('user'))
      db.conversationMessage.findMany.mockResolvedValue([
        makeTurnRow('user', 'msg', 0),
      ])
      await manager.receiveUserMessage(CHANNEL_CONFIG_ID, AGENT_ID, makeIncoming())

      db.conversationMessage.deleteMany.mockResolvedValue({ count: 1 })
      await manager.clearSessionHistory(SESSION_ID)

      const cached = await manager.findSessionByUser(CHANNEL_CONFIG_ID, EXTERNAL_USER_ID)
      expect(cached?.history).toEqual([])
    })
  })

  // ── findSessionByUser() ─────────────────────────────────────────

  describe('findSessionByUser()', () => {
    it('retorna null si no hay sesión previa para ese canal+usuario', async () => {
      db.gatewaySession.findUnique.mockResolvedValue(null)

      const result = await manager.findSessionByUser(CHANNEL_CONFIG_ID, 'unknown-user')
      expect(result).toBeNull()
    })
  })
})
