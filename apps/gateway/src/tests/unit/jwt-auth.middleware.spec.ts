/**
 * jwt-auth.middleware.spec.ts
 *
 * Tests unitarios para jwtAuthMiddleware() (F3B-01a).
 *
 * Cubre los 7 casos del spec sin necesidad de mockear jose ni JWKS.
 * Los tests de Logto real se añaden en F3b cuando se implemente
 * la pantalla de configuración de auth en Settings.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jwtAuthMiddleware, applySecurityMiddleware } from '../../middleware/security.middleware.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-secret-for-unit-tests-minimum-32-chars-long';

function makeLocalToken(overrides?: Partial<jwt.JwtPayload>, secret = TEST_SECRET): string {
  return jwt.sign(
    {
      sub: 'user-001',
      email: 'test@example.com',
      role: 'OPERATOR',
      iss: 'agent-studio-local',
      ...overrides,
    },
    secret,
    { expiresIn: '1h' },
  );
}

function makeExpiredLocalToken(): string {
  return jwt.sign(
    {
      sub: 'user-001',
      email: 'test@example.com',
      role: 'OPERATOR',
      iss: 'agent-studio-local',
    },
    TEST_SECRET,
    { expiresIn: '-1s' }, // ya expirado
  );
}

function makeNonLocalToken(): string {
  // Simula un token con issuer externo (como si viniera de Logto)
  return jwt.sign(
    {
      sub: 'logto-user-001',
      email: 'sso@example.com',
      iss: 'https://auth.logto.example.com/oidc',
    },
    TEST_SECRET, // la firma no importa aquí, solo el issuer
    { expiresIn: '1h' },
  );
}

function mockRequest(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
    path: '/some-protected-route',
  } as unknown as Request;
}

function mockResponse(): { res: Response; status: jest.Mock; json: jest.Mock } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('jwtAuthMiddleware', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Limpiar variables de entorno relevantes antes de cada test
    delete process.env.JWT_SECRET;
    delete process.env.LOGTO_ISSUER;
    delete process.env.LOGTO_AUDIENCE;
  });

  afterEach(() => {
    // Restaurar entorno original
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
    process.env.LOGTO_ISSUER = originalEnv.LOGTO_ISSUER;
    process.env.LOGTO_AUDIENCE = originalEnv.LOGTO_AUDIENCE;
  });

  // ── Test 1: Token local válido ───────────────────────────────────────────────────────────
  it('token local válido → next() llamado + req.user.source === local', async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    const token = makeLocalToken();
    const req = mockRequest(`Bearer ${token}`) as Request & { user?: unknown };
    const next = vi.fn() as unknown as NextFunction;
    const { res } = mockResponse();

    const middleware = jwtAuthMiddleware();
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect((req as any).user).toMatchObject({
      sub: 'user-001',
      email: 'test@example.com',
      role: 'OPERATOR',
      source: 'local',
    });
  });

  // ── Test 2: Token local con secret incorrecto ─────────────────────────────────────────────
  it('token local con secret incorrecto → 401', async () => {
    process.env.JWT_SECRET = 'different-secret-that-wont-match-the-token';

    const token = makeLocalToken({}, 'original-secret-used-to-sign');
    const req = mockRequest(`Bearer ${token}`);
    const next = vi.fn() as unknown as NextFunction;
    const { res, status, json } = mockResponse();

    const middleware = jwtAuthMiddleware();
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: 'Invalid or expired token' }),
    );
  });

  // ── Test 3: Token local expirado ──────────────────────────────────────────────────────────
  it('token local expirado → 401', async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    const token = makeExpiredLocalToken();
    const req = mockRequest(`Bearer ${token}`);
    const next = vi.fn() as unknown as NextFunction;
    const { res, status, json } = mockResponse();

    const middleware = jwtAuthMiddleware();
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: 'Invalid or expired token' }),
    );
  });

  // ── Test 4: Sin header Authorization ─────────────────────────────────────────────────────
  it('sin header Authorization → 401 Missing Bearer token', async () => {
    process.env.JWT_SECRET = TEST_SECRET;

    const req = mockRequest(); // sin header
    const next = vi.fn() as unknown as NextFunction;
    const { res, status, json } = mockResponse();

    const middleware = jwtAuthMiddleware();
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ ok: false, error: 'Missing Bearer token' });
  });

  // ── Test 5: Token no-local sin LOGTO_ISSUER ───────────────────────────────────────────────
  it('token no-local sin LOGTO_ISSUER → 401 con mensaje claro', async () => {
    process.env.JWT_SECRET = TEST_SECRET;
    // LOGTO_ISSUER no configurado (delete en beforeEach)

    const token = makeNonLocalToken();
    const req = mockRequest(`Bearer ${token}`);
    const next = vi.fn() as unknown as NextFunction;
    const { res, status, json } = mockResponse();

    const middleware = jwtAuthMiddleware();
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining('Logto SSO not configured'),
      }),
    );
  });

  // ── Test 6: Dev mode (ninguna variable configurada) ──────────────────────────────────────
  it('dev mode (sin JWT_SECRET ni LOGTO_ISSUER) → siempre next()', async () => {
    // Ambas variables eliminadas en beforeEach

    const req = mockRequest(); // ni siquiera token
    const next = vi.fn() as unknown as NextFunction;
    const { res } = mockResponse();

    const middleware = jwtAuthMiddleware();
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  // ── Test 7: Ruta /api/auth/login excluida del middleware ─────────────────────────────────
  it('/api/auth/login sin token → pasa (excluida del middleware)', () => {
    process.env.JWT_SECRET = TEST_SECRET;
    process.env.REQUIRE_AUTH = 'true';

    // Simular Express app minimal para verificar que /api/auth/ no pasa por JWT
    const middlewareStack: Array<(req: Request, res: Response, next: NextFunction) => void> = [];

    const fakeApp = {
      use: (path: string, handler: (req: Request, res: Response, next: NextFunction) => void) => {
        if (path === '/api/') {
          middlewareStack.push(handler);
        }
      },
    } as unknown as import('express').Application;

    // Registrar el middleware (captura el handler de /api/)
    // applySecurityMiddleware registra helmet, cors, rate limiters y JWT
    // Solo nos interesa el JWT handler de /api/
    const capturedHandlers: Array<(req: Request, res: Response, next: NextFunction) => void> = [];
    const mockApp = {
      use: (pathOrHandler: unknown, handler?: unknown) => {
        if (typeof pathOrHandler === 'string' && pathOrHandler === '/api/' && handler) {
          capturedHandlers.push(handler as (req: Request, res: Response, next: NextFunction) => void);
        }
      },
    } as unknown as import('express').Application;

    applySecurityMiddleware(mockApp, { requireAuth: true });

    // Debe haber al menos un handler registrado para /api/
    expect(capturedHandlers.length).toBeGreaterThan(0);

    // Simular request a /api/auth/login sin token
    const req = {
      headers: {},
      path: '/auth/login', // relativo a /api/
    } as unknown as Request;
    const next = vi.fn() as unknown as NextFunction;
    const { res } = mockResponse();

    // Ejecutar el handler de /api/ con la ruta /auth/login
    // Debe llamar next() sin validar JWT
    const apiHandler = capturedHandlers[capturedHandlers.length - 1];
    apiHandler(req, res, next);

    expect(next).toHaveBeenCalledOnce();

    delete process.env.REQUIRE_AUTH;
  });
});
