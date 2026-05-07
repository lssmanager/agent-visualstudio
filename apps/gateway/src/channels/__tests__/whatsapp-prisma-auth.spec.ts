/**
 * whatsapp-prisma-auth.spec.ts
 * [F5-02] Tests para usePrismaAuthState() y clearSessionInDb()
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals'

// ── Mock de @whiskeysockets/baileys ─────────────────────────────────────

const mockInitAuthCreds = jest.fn().mockReturnValue({
  noiseKey:                    { type: 'Buffer', data: [1, 2, 3] },
  pairingEphemeralKeyPair:     { type: 'Buffer', data: [4, 5, 6] },
  signedIdentityKey:           { type: 'Buffer', data: [7, 8, 9] },
  signedPreKey:                { type: 'Buffer', data: [10, 11, 12] },
  registrationId:              42,
  advSecretKey:                'test-adv-secret',
  nextPreKeyId:                1,
  firstUnappendedPreKeyId:     1,
  serverHasPreKeys:            false,
  account:                     null,
})

const BufferJSON = {
  replacer: (_key: string, value: unknown) => value,
  reviver:  (_key: string, value: unknown) => value,
}

jest.mock('@whiskeysockets/baileys', () => ({
  initAuthCreds: mockInitAuthCreds,
  BufferJSON,
}))

// ── Import del módulo bajo test ─────────────────────────────────────────
// Importamos DESPUÉS de configurar el mock
const { usePrismaAuthState, clearSessionInDb } = await import('../whatsapp-prisma-auth')

// ── Mock de PrismaClient ────────────────────────────────────────────────

const makePrismaMock = () => ({
  gatewaySession: {
    findFirst:  jest.fn<() => Promise<{ metadata: unknown } | null>>(),
    upsert:     jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'gs-test-1' }),
    updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
  },
})

type PrismaMock = ReturnType<typeof makePrismaMock>

// ── Tests ───────────────────────────────────────────────────────────────

describe('usePrismaAuthState', () => {
  const CHANNEL_ID = 'test-channel-config-id'
  let prismaMock: PrismaMock

  beforeEach(() => {
    prismaMock = makePrismaMock()
    jest.clearAllMocks()
  })

  // ────────────────────────────────────────────────────────────────────
  it('primera vez: devuelve initAuthCreds() cuando no hay registro en BD', async () => {
    prismaMock.gatewaySession.findFirst.mockResolvedValue(null)

    const { state, saveCreds } = await usePrismaAuthState(
      prismaMock as unknown as import('@prisma/client').PrismaClient,
      CHANNEL_ID,
    )

    expect(mockInitAuthCreds).toHaveBeenCalledTimes(1)
    expect(state.creds).toBeDefined()
    expect(state.creds.registrationId).toBe(42)
    expect(typeof saveCreds).toBe('function')
  })

  // ────────────────────────────────────────────────────────────────────
  it('segunda vez: carga creds desde BD con BufferJSON.reviver', async () => {
    const savedCreds = {
      noiseKey:                { type: 'Buffer', data: [99, 100] },
      pairingEphemeralKeyPair: { type: 'Buffer', data: [101] },
      signedIdentityKey:       { type: 'Buffer', data: [102] },
      signedPreKey:            { type: 'Buffer', data: [103] },
      registrationId:          99,
      advSecretKey:            'loaded-from-db',
      nextPreKeyId:            10,
      firstUnappendedPreKeyId: 10,
      serverHasPreKeys:        true,
      account:                 null,
    }

    prismaMock.gatewaySession.findFirst.mockResolvedValue({ metadata: savedCreds })

    const { state } = await usePrismaAuthState(
      prismaMock as unknown as import('@prisma/client').PrismaClient,
      CHANNEL_ID,
    )

    // initAuthCreds NO debe ser llamado cuando hay datos en BD
    expect(mockInitAuthCreds).not.toHaveBeenCalled()
    expect(state.creds.registrationId).toBe(99)
    expect(state.creds.advSecretKey).toBe('loaded-from-db')
  })

  // ────────────────────────────────────────────────────────────────────
  it('saveCreds() hace upsert en BD con el channelConfigId correcto', async () => {
    prismaMock.gatewaySession.findFirst.mockResolvedValue(null)

    const { saveCreds } = await usePrismaAuthState(
      prismaMock as unknown as import('@prisma/client').PrismaClient,
      CHANNEL_ID,
    )

    await saveCreds()

    expect(prismaMock.gatewaySession.upsert).toHaveBeenCalledTimes(1)

    const upsertCall = prismaMock.gatewaySession.upsert.mock.calls[0]?.[0] as {
      where: { channelConfigId_externalUserId: { channelConfigId: string; externalUserId: string } }
      create: { channelConfigId: string; externalUserId: string; status: string }
      update: { status: string }
    }

    expect(upsertCall.where.channelConfigId_externalUserId.channelConfigId).toBe(CHANNEL_ID)
    expect(upsertCall.where.channelConfigId_externalUserId.externalUserId).toBe('__baileys_creds__')
    expect(upsertCall.create.channelConfigId).toBe(CHANNEL_ID)
    expect(upsertCall.create.status).toBe('connected')
    expect(upsertCall.update.status).toBe('connected')
  })

  // ────────────────────────────────────────────────────────────────────
  it('clearSessionInDb() llama updateMany con metadata=null y status=logged_out', async () => {
    await clearSessionInDb(
      prismaMock as unknown as import('@prisma/client').PrismaClient,
      CHANNEL_ID,
    )

    expect(prismaMock.gatewaySession.updateMany).toHaveBeenCalledTimes(1)

    const updateCall = prismaMock.gatewaySession.updateMany.mock.calls[0]?.[0] as {
      where: { channelConfigId: string; externalUserId: string }
      data:  { status: string; metadata: null }
    }

    expect(updateCall.where.channelConfigId).toBe(CHANNEL_ID)
    expect(updateCall.where.externalUserId).toBe('__baileys_creds__')
    expect(updateCall.data.status).toBe('logged_out')
    expect(updateCall.data.metadata).toBeNull()
  })

  // ────────────────────────────────────────────────────────────────────
  it('creds corruptos en BD → fallback a initAuthCreds() sin lanzar error', async () => {
    // metadata inválida que falla al deserializar
    prismaMock.gatewaySession.findFirst.mockResolvedValue({
      metadata: 'string-invalida-no-es-objeto',
    })

    // No debe lanzar — debe usar initAuthCreds() como fallback
    await expect(
      usePrismaAuthState(
        prismaMock as unknown as import('@prisma/client').PrismaClient,
        CHANNEL_ID,
      )
    ).resolves.toBeDefined()
  })
})
