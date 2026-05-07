/**
 * Tests for SlackAdapter.initialize() — AUDIT-11 (#178)
 *
 * Verifica que initialize() lanza Error si falta credentials.signingSecret,
 * sin console.warn ni fallback a env global.
 */

import { SlackAdapter } from '../slack.adapter'

// Mock getPrisma para evitar conexión real a BD
jest.mock('../../../lib/prisma', () => ({
  getPrisma: jest.fn(),
}))

import { getPrisma } from '../../../lib/prisma'
const mockGetPrisma = getPrisma as jest.MockedFunction<typeof getPrisma>

function makePrismaWithCredentials(credentials: Record<string, unknown>) {
  return {
    channelConfig: {
      findUnique: jest.fn().mockResolvedValue({
        id:          'test-channel-id',
        type:        'slack',
        credentials,
        config:      {},
        isActive:    false,
        workspaceId: 'ws-1',
      }),
    },
  } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  // Asegurar que SLACK_SOCKET_MODE no fuerza Socket Mode en estos tests
  delete process.env.SLACK_SOCKET_MODE
})

describe('SlackAdapter.initialize() — AUDIT-11 (#178)', () => {

  it('lanza Error cuando credentials.signingSecret está ausente', async () => {
    mockGetPrisma.mockReturnValue(
      makePrismaWithCredentials({ botToken: 'xoxb-test' })
    )
    const adapter = new SlackAdapter()
    await expect(adapter.initialize('test-channel-id')).rejects.toThrow(
      /signingSecret is required/
    )
  })

  it('lanza Error cuando credentials.signingSecret es string vacío', async () => {
    mockGetPrisma.mockReturnValue(
      makePrismaWithCredentials({ botToken: 'xoxb-test', signingSecret: '' })
    )
    const adapter = new SlackAdapter()
    await expect(adapter.initialize('test-channel-id')).rejects.toThrow(
      /signingSecret is required/
    )
  })

  it('NO usa console.warn como fallback — la ausencia de signingSecret lanza Error inmediato', async () => {
    const warnSpy = jest.spyOn(console, 'warn')
    mockGetPrisma.mockReturnValue(
      makePrismaWithCredentials({ botToken: 'xoxb-test' })
    )
    const adapter = new SlackAdapter()
    await expect(adapter.initialize('test-channel-id')).rejects.toThrow()
    // Debe lanzar ANTES de llegar a cualquier console.warn de fallback
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/signingSecret/)
    )
    warnSpy.mockRestore()
  })

  it('NO usa env global SLACK_SIGNING_SECRET como fallback', async () => {
    process.env.SLACK_SIGNING_SECRET = 'env-secret'
    mockGetPrisma.mockReturnValue(
      makePrismaWithCredentials({ botToken: 'xoxb-test' }) // sin signingSecret en credentials
    )
    const adapter = new SlackAdapter()
    await expect(adapter.initialize('test-channel-id')).rejects.toThrow(
      /signingSecret is required/
    )
    delete process.env.SLACK_SIGNING_SECRET
  })

  it('lanza Error que incluye el channelConfigId en el mensaje', async () => {
    mockGetPrisma.mockReturnValue(
      makePrismaWithCredentials({ botToken: 'xoxb-test' })
    )
    const adapter = new SlackAdapter()
    await expect(adapter.initialize('test-channel-id')).rejects.toThrow(
      /test-channel-id/
    )
  })

  it('inicializa correctamente cuando signingSecret y botToken están presentes (sin socketMode)', async () => {
    mockGetPrisma.mockReturnValue(
      makePrismaWithCredentials({
        botToken:      'xoxb-test-token',
        signingSecret: 'test-signing-secret',
        socketMode:    false,
      })
    )
    const adapter = new SlackAdapter()
    // No debe lanzar
    await expect(adapter.initialize('test-channel-id')).resolves.toBeUndefined()
  })

})
