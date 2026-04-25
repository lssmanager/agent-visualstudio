/**
 * security.middleware.ts — Middleware de seguridad del gateway
 *
 * Aplica en este orden:
 *   1. Helmet (headers de seguridad HTTP)
 *   2. CORS configurado por workspace
 *   3. Rate limiting por IP (express-rate-limit)
 *   4. Validación de Logto JWT (si LOGTO_ISSUER está en env)
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
  /** Si true, valida JWT de Logto en rutas /api/** */
  requireAuth?: boolean;
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
// Logto JWT validation
// ---------------------------------------------------------------------------

/**
 * Middleware que valida el Bearer JWT emitido por Logto.
 * Requiere:
 *   LOGTO_ISSUER   = https://auth.tu-dominio.com/oidc
 *   LOGTO_AUDIENCE = https://api.agent-studio.com (o el identifier configurado)
 *
 * En desarrollo sin LOGTO_ISSUER, pasa sin validar (warn en consola).
 */
export function logtoJwtMiddleware(): RequestHandler {
  const issuer = process.env.LOGTO_ISSUER;
  const audience = process.env.LOGTO_AUDIENCE;

  if (!issuer) {
    console.warn(
      '[security] LOGTO_ISSUER not set — JWT validation disabled (dev mode)',
    );
    // En dev, pasar siempre
    return (_req, _res, next) => next();
  }

  // Validación real usando jose (jsonwebtoken no soporta JWKS remoto bien)
  // jose se importa dinámicamente para no requerir el paquete si no está configurado
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ ok: false, error: 'Missing Bearer token' });
      return;
    }

    const token = authHeader.slice(7);

    try {
      // Importar jose dinámicamente
      const { createRemoteJWKSet, jwtVerify } = await import('jose');
      const JWKS = createRemoteJWKSet(
        new URL(`${issuer}/jwks`),
      );
      const { payload } = await jwtVerify(token, JWKS, {
        issuer,
        audience: audience ?? issuer,
      });

      // Adjuntar claims al request para uso en controllers
      (req as Request & { user: unknown }).user = payload;
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

  // Auth JWT — solo en rutas de API, no en webhooks públicos de canales
  if (opts?.requireAuth ?? process.env.REQUIRE_AUTH === 'true') {
    app.use('/api/', logtoJwtMiddleware());
  }
}
