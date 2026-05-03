/**
 * security.middleware.ts — Middleware de seguridad del gateway
 *
 * Aplica en este orden:
 *   1. Helmet (headers de seguridad HTTP)
 *   2. CORS configurado por workspace
 *   3. Rate limiting por IP (express-rate-limit)
 *   4. JWT híbrido: Logto SSO + token local (F3B-01a)
 *
 * Comportamiento de degradación JWT:
 *   JWT_SECRET + LOGTO_ISSUER → acepta ambos
 *   JWT_SECRET solo           → solo tokens locales
 *   LOGTO_ISSUER solo         → solo tokens Logto
 *   Ninguno                   → dev mode, pasa sin validar (warn)
 *
 * Inspirado en:
 * - n8n: CORS y rate limiting en servidor webhook
 * - Flowise: autenticación Bearer configurable
 * - Semantic Kernel: claim-based auth
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface SecurityOptions {
  /** Orígenes CORS permitidos. Default: proceso env CORS_ORIGINS o '*' */
  corsOrigins?: string | string[];
  /** Máx. requests por ventana por IP para rutas de webhook */
  webhookRateLimit?: number;
  /** Máx. requests por ventana por IP para rutas de API */
  apiRateLimit?: number;
  /** Ventana en ms (default: 60_000 = 1 min) */
  windowMs?: number;
  /** Si true, valida JWT en rutas /api/** (excluye /api/auth/) */
  requireAuth?: boolean;
}

/**
 * F3B-01a: Claims extraídos del JWT (Logto o local) y adjuntados a req.user.
 * source indica el proveedor que firmó el token.
 */
export interface AuthenticatedUser {
  sub: string;
  email?: string;
  role?: string;
  source: 'logto' | 'local';
}

// ---------------------------------------------------------------------------
// Helmet (headers de seguridad)
// ---------------------------------------------------------------------------

export function helmetMiddleware(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // necesario para SSE
    hsts: { maxAge: 31_536_000, includeSubDomains: true },
  });
}

// ---------------------------------------------------------------------------
// CORS manual (más granular que el cors() de express)
// ---------------------------------------------------------------------------

export function corsMiddleware(origins?: string | string[]): RequestHandler {
  const allowed: string[] =
    typeof origins === 'string'
      ? [origins]
      : origins ??
        (process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()) ?? ['*']);

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin ?? '';
    const isAllowed =
      allowed.includes('*') || allowed.includes(origin);

    if (isAllowed && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else if (allowed.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, X-Telegram-Bot-Api-Secret-Token, X-Hub-Signature-256',
    );
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

export function webhookRateLimiter(opts?: Pick<SecurityOptions, 'webhookRateLimit' | 'windowMs'>): RequestHandler {
  return rateLimit({
    windowMs: opts?.windowMs ?? 60_000,
    max: opts?.webhookRateLimit ?? 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many requests — slow down' },
    skip: (req) => {
      // Webhooks de Meta (WhatsApp) deben poder mandar muchos mensajes
      return req.path.includes('/whatsapp/webhook');
    },
  });
}

export function apiRateLimiter(opts?: Pick<SecurityOptions, 'apiRateLimit' | 'windowMs'>): RequestHandler {
  return rateLimit({
    windowMs: opts?.windowMs ?? 60_000,
    max: opts?.apiRateLimit ?? 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many requests' },
  });
}

// ---------------------------------------------------------------------------
// JWT validation — híbrido: acepta Logto SSO o token local (F3B-01a)
// ---------------------------------------------------------------------------

/**
 * Middleware JWT híbrido.
 *
 * Tabla de comportamiento por combinación de variables de entorno:
 *   JWT_SECRET ✅ + LOGTO_ISSUER ✅ → acepta ambos: local y Logto
 *   JWT_SECRET ✅ + LOGTO_ISSUER ❌ → solo acepta tokens locales
 *   JWT_SECRET ❌ + LOGTO_ISSUER ✅ → solo acepta tokens Logto
 *   JWT_SECRET ❌ + LOGTO_ISSUER ❌ → dev mode — pasa todo sin validar (warn)
 *
 * El operador NO necesita distinguir qué tipo de token entra —
 * el middleware detecta el issuer automáticamente.
 */
export function jwtAuthMiddleware(): RequestHandler {
  const logtoIssuer = process.env.LOGTO_ISSUER;
  const logtoAudience = process.env.LOGTO_AUDIENCE;
  const jwtSecret = process.env.JWT_SECRET;

  const devMode = !logtoIssuer && !jwtSecret;
  if (devMode) {
    console.warn('[security] No JWT config found — auth disabled (dev mode)');
    return (_req, _res, next) => next();
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ ok: false, error: 'Missing Bearer token' });
      return;
    }

    const token = authHeader.slice(7);

    try {
      // Importar jsonwebtoken dinámicamente (compatible con ESM y CJS)
      const jsonwebtoken = await import('jsonwebtoken');
      const decoded = jsonwebtoken.default.decode(token, { complete: true });
      const iss = (decoded?.payload as Record<string, unknown> | null)?.iss as string | undefined;

      if (iss === 'agent-studio-local') {
        // ── Token local ──
        if (!jwtSecret) {
          res.status(401).json({ ok: false, error: 'JWT_SECRET not configured' });
          return;
        }
        const payload = jsonwebtoken.default.verify(token, jwtSecret) as Record<string, unknown>;
        (req as Request & { user: AuthenticatedUser }).user = {
          sub: payload['sub'] as string,
          email: payload['email'] as string | undefined,
          role: payload['role'] as string | undefined,
          source: 'local',
        };
        next();
        return;
      }

      // ── Token Logto (o cualquier otro issuer) ──
      if (!logtoIssuer) {
        // Logto no configurado todavía — el sistema sigue funcionando con login local
        res.status(401).json({
          ok: false,
          error: 'Logto SSO not configured. Use local login or configure LOGTO_ISSUER in settings.',
        });
        return;
      }

      const { createRemoteJWKSet, jwtVerify } = await import('jose');
      const JWKS = createRemoteJWKSet(new URL(`${logtoIssuer}/jwks`));
      const { payload } = await jwtVerify(token, JWKS, {
        issuer: logtoIssuer,
        audience: logtoAudience ?? logtoIssuer,
      });

      (req as Request & { user: AuthenticatedUser }).user = {
        sub: payload.sub as string,
        email: (payload as Record<string, unknown>)['email'] as string | undefined,
        role: ((payload as Record<string, unknown>)['role'] as string | undefined) ?? 'operator',
        source: 'logto',
      };
      next();

    } catch (err) {
      console.error('[security] JWT validation failed:', err);
      res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }
  };
}

// ---------------------------------------------------------------------------
// Bundle: aplica todo en orden
// ---------------------------------------------------------------------------

export function applySecurityMiddleware(
  app: import('express').Application,
  opts?: SecurityOptions,
): void {
  app.use(helmetMiddleware());
  app.use(corsMiddleware(opts?.corsOrigins));

  // Rate limiters
  app.use('/gateway/', webhookRateLimiter(opts));
  app.use('/api/', apiRateLimiter(opts));

  // Auth JWT — solo en rutas de API, excluye /api/auth/ (login/register no requieren token)
  if (opts?.requireAuth ?? process.env.REQUIRE_AUTH === 'true') {
    app.use('/api/', (req: Request, res: Response, next: NextFunction) => {
      // Excluir /api/auth/* para que login y register no requieran token
      if (req.path.startsWith('/auth/')) return next();
      return jwtAuthMiddleware()(req, res, next);
    });
  }
}
