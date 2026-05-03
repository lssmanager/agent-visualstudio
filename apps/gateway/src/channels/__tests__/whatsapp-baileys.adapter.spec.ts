/**
 * whatsapp-baileys.adapter.spec.ts — F5-01
 *
 * Tests unitarios de WhatsAppBaileysAdapter.
 * Jest puro — sin TestingModule NestJS.
 * Cubre los 6 casos del criterio de aceptación F5-01.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockEvHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};

const mockSock = {
  ev: {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!mockEvHandlers[event]) mockEvHandlers[event] = [];
      mockEvHandlers[event].push(handler);
    }),
    off:                jest.fn(),
    removeAllListeners: jest.fn(),
  },
  sendMessage: jest.fn().mockResolvedValue({}),
  logout:      jest.fn().mockResolvedValue(undefined),
  end:         jest.fn(),
  user:        { id: '5491155000000@s.whatsapp.net', name: 'Test' },
};

const mockSaveCreds = jest.fn().mockResolvedValue(undefined);

jest.mock('@whiskeysockets/baileys', () => ({
  makeWASocket: jest.fn(() => mockSock),
  useMultiFileAuthState: jest.fn().mockResolvedValue({
    state:     { creds: {}, keys: {} },
    saveCreds: mockSaveCreds,
  }),
  fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: [2, 3000, 1] }),
  DisconnectReason: { loggedOut: 401, connectionLost: 408, restartRequired: 515, badSession: 500, connectionReplaced: 440, timedOut: 408 },
}));

// Mock PrismaService — credenciales en BD
const prismaMock = {
  gatewaySession: {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert:     jest.fn().mockResolvedValue({ id: 'sess-1', channelConfigId: 'ch-1' }),
    update:     jest.fn().mockResolvedValue({}),
  },
};

jest.mock('../../../prisma/prisma.service.js', () => ({
  PrismaService: jest.fn().mockImplementation(() => prismaMock),
}));

// Mock fs para que setup() no falle en el entorno de CI
jest.mock('node:fs', () => ({
  mkdirSync: jest.fn(),
  rmSync:    jest.fn(),
}));

// ── Helper: emitir evento Baileys ──────────────────────────────────────────
function emitBaileysEvent(event: string, payload: unknown): void {
  const handlers = mockEvHandlers[event] ?? [];
  handlers.forEach(h => h(payload));
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('WhatsAppBaileysAdapter', () => {
  let adapter: import('../whatsapp-baileys.adapter.js').WhatsAppBaileysAdapter;
  let dispatchMock: jest.Mock;

  beforeEach(async () => {
    // Limpiar handlers entre tests
    Object.keys(mockEvHandlers).forEach(k => delete mockEvHandlers[k]);
    jest.clearAllMocks();

    const mod = await import('../whatsapp-baileys.adapter.js');
    adapter = new mod.WhatsAppBaileysAdapter();
    await adapter.setup({ sessionsDir: '/tmp/wa-test' }, {});
    await adapter.initialize('ch-test-1');

    dispatchMock = jest.fn().mockResolvedValue(undefined);
    adapter.onMessage(dispatchMock);
  });

  // ── Caso 1: connect() arranca socket Baileys ──────────────────────────────
  it('connect() arranca socket Baileys y registra handlers de eventos', async () => {
    const baileys = await import('@whiskeysockets/baileys');
    await adapter.connect();

    expect(baileys.makeWASocket).toHaveBeenCalledTimes(1);
    // Al menos connection.update, creds.update y messages.upsert deben estar registrados
    expect(Object.keys(mockEvHandlers)).toEqual(
      expect.arrayContaining(['connection.update', 'creds.update', 'messages.upsert']),
    );
  });

  // ── Caso 2: mensaje entrante fromMe=false → dispatcher llamado ────────────
  it('mensaje entrante fromMe=false → onMessage handler llamado', async () => {
    await adapter.connect();

    emitBaileysEvent('messages.upsert', {
      type:     'notify',
      messages: [{
        key:     { remoteJid: '5491155000000@s.whatsapp.net', fromMe: false, id: 'MSG-001' },
        message: { conversation: 'Hola mundo' },
        messageTimestamp: Math.floor(Date.now() / 1000),
        pushName: 'Test User',
      }],
    });

    // Esperar micro-tarea del .catch()
    await Promise.resolve();
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  // ── Caso 3: mensaje fromMe=true → dispatcher NO llamado ──────────────────
  it('mensaje fromMe=true → onMessage handler NO llamado', async () => {
    await adapter.connect();

    emitBaileysEvent('messages.upsert', {
      type:     'notify',
      messages: [{
        key:     { remoteJid: '5491155000000@s.whatsapp.net', fromMe: true, id: 'MSG-002' },
        message: { conversation: 'Mensaje propio' },
        messageTimestamp: Math.floor(Date.now() / 1000),
      }],
    });

    await Promise.resolve();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  // ── Caso 4: status@broadcast → dispatcher NO llamado ─────────────────────
  it('status@broadcast → onMessage handler NO llamado', async () => {
    await adapter.connect();

    emitBaileysEvent('messages.upsert', {
      type:     'notify',
      messages: [{
        key:     { remoteJid: 'status@broadcast', fromMe: false, id: 'MSG-003' },
        message: { conversation: 'Status update' },
        messageTimestamp: Math.floor(Date.now() / 1000),
      }],
    });

    await Promise.resolve();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  // ── Caso 5: disconnect() limpio ───────────────────────────────────────────
  it('logout() llama sock.logout() y deja estado closed', async () => {
    await adapter.connect();
    expect(adapter.state).toBe('connecting'); // socket abierto, aún no 'open' sin evento

    await adapter.logout();

    expect(mockSock.logout).toHaveBeenCalledTimes(1);
    expect(mockSock.ev.removeAllListeners).toHaveBeenCalled();
    expect(adapter.state).toBe('closed');
  });

  // ── Caso 6: QR emitido como evento 'qr' antes del primer login ───────────
  it('QR emitido via onQr() callback como string antes del primer login', async () => {
    const qrHandler = jest.fn();
    adapter.onQr(qrHandler);

    await adapter.connect();

    // Simular evento QR de Baileys
    emitBaileysEvent('connection.update', { qr: 'data:image/png;base64,QRCODE==' });

    expect(qrHandler).toHaveBeenCalledWith('data:image/png;base64,QRCODE==');
    expect(adapter.state).toBe('qr');
  });
});
