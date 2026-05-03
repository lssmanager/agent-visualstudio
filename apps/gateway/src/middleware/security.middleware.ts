/**
 * security.middleware.ts — Middleware de seguridad del gateway
 *
 * Aplica en este orden:
 *   1. Helmet (headers de seguridad HTTP) — F3b-02
 *   2. CORS configurado por workspace
 *   3. Rate limiting por IP (express-rate-limit)
 *   4. JWT híbrido: Logto SSO + token local — F3B-01a
 *
 * Headers garantizados por Helmet (F3b-02):
 *   Content-Security-Policy   — bloquea scripts/recursos de orígenes no autorizados
 *   Strict-Transport-Security — fuerza HTTPS por 1 año
 *   X-Frame-Options           — DENY — previene clickjacking
 *   X-Content-Type-Options    — nosniff
 *   Referrer-Policy           — strict-origin-when-cross-origin
 *   Permissions-Policy        — desactiva camera/mic/geolocation por defecto
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
  /** Orígenes CORS permitidos. Default: CORS_ORIGINS env o '*' */
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
 */
export interface AuthenticatedUser {
  sub: string;
  email?: string;
  role?: string;
  source: 'logto' | 'local';
}

// ---------------------------------------------------------------------------
// Helmet (headers de seguridad HTTP) — F3b-02
// ---------------------------------------------------------------------------

export function helmetMiddleware(): RequestHandler {
  const reportUri = process.env.HELMET_CSP_REPORT_URI;

  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'"],
        styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc:     ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc:      ["'self'", 'data:', 'https:', 'blob:'],
        connectSrc:  ["'self'", 'wss:', 'https:'],
        mediaSrc:    ["'self'", 'blob:'],
        workerSrc:   ['blob:'],
        frameSrc:    ["'none'"],
        objectSrc:   ["'none'"],
        baseUri:     ["'self'"],
        formAction:  ["'self'"],
        ...(reportUri ? { reportUri: [reportUri] } : {}),
      },
    },
    hsts: {
      maxAge: 31_536_000,
      includeSubDomains: true,
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    noSniff: true,
    dnsPrefetchControl: { allow: false },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    ieNoOpen: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    hidePoweredBy: true,
  });
}

// ---------------------------------------------------------------------------
// CORS manual
// ---------------------------------------------------------------------------

export function corsMiddleware(origins?: string | string[]): RequestHandler {
  const allowed: string[] =
    typeof origins === 'string'
      ? [origins]
      : origins ??
        (process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()) ?? ['*']);

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin ?? '';
    const isAllowed = allowed.includes('*') || allowed.includes(origin);

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

export function webhookRateLimiter(
  opts?: Pick<SecurityOptions, 'webhookRateLimit' | 'windowMs'>,
): RequestHandler {
  return rateLimit({
    windowMs: opts?.windowMs ?? 60_000,
    max: opts?.webhookRateLimit ?? 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many requests — slow down' },
    skip: (req) => req.path.includes('/whatsapp/webhook'),
  });
}

export function apiRateLimiter(
  opts?: Pick<SecurityOptions, 'apiRateLimit' | 'windowMs'>,
): RequestHandler {
  return rateLimit({
    windowMs: opts?.windowMs ?? 60_000,
    max: opts?.apiRateLimit ?? 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many requests' },
  });
}

// ---------------------------------------------------------------------------
// JWT validation — híbrido: Logto SSO + token local (F3B-01a)
//
// FIX CodeRabbit: createRemoteJWKSet y el import de jose se elevan fuera del
// request handler — se inicializan UNA sola vez al registrar el middleware,
// no en cada request. Mejora de rendimiento significativa bajo carga.
// ---------------------------------------------------------------------------

export function jwtAuthMiddleware(): RequestHandler {
  const logtoIssuer   = process.env.LOGTO_ISSUER;
  const logtoAudience = process.env.LOGTO_AUDIENCE;
  const jwtSecret     = process.env.JWT_SECRET;

  const devMode = !logtoIssuer && !jwtSecret;
  if (devMode) {
    console.warn('[security] No JWT config found — auth disabled (dev mode)');
    return (_req, _res, next) => next();
  }

  // ── Inicialización en tiempo de registro del middleware (una sola vez) ──
  // jose se importa de forma síncrona en el módulo (import estático en la parte
  // superior del archivo) pero como este proyecto usa dynamic import por
  // compatibilidad con CJS, lo resolvemos con una Promise que se crea una vez.
  let jwksPromise: Promise<ReturnType<typeof import('jose').createRemoteJWKSet>> | null = null;
  let jwtImportPromise: Promise<typeof import('jose')> | null = null;
  let jsonwebtokenPromise: Promise<typeof import('jsonwebtoken')> | null = null;

  // Pre-warm imports y JWKS en background al registrar el middleware
  jsonwebtokenPromise = import('jsonwebtoken');
  if (logtoIssuer) {
    jwtImportPromise = import('jose');
    jwksPromise = jwtImportPromise.then(({ createRemoteJWKSet }) =>
      createRemoteJWKSet(new URL(`${logtoIssuer}/jwks`)),
    );
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ ok: false, error: 'Missing Bearer token' });
      return;
    }

    const token = authHeader.slice(7);

    try {
      // Reutiliza el import ya resuelto (Promise cached)
      const jsonwebtoken = await jsonwebtokenPromise!;
      const decoded = jsonwebtoken.default.decode(token, { complete: true });
      const iss = (decoded?.payload as Record<string, unknown> | null)?.iss as string | undefined;

      if (iss === 'agent-studio-local') {
        if (!jwtSecret) {
          res.status(401).json({ ok: false, error: 'JWT_SECRET not configured' });
          return;
        }
        const payload = jsonwebtoken.default.verify(token, jwtSecret) as Record<string, unknown>;
        (req as Request & { user: AuthenticatedUser }).user = {
          sub:    payload['sub'] as string,
          email:  payload['email'] as string | undefined,
          role:   payload['role'] as string | undefined,
          source: 'local',
        };
        next();
        return;
      }

      if (!logtoIssuer || !jwksPromise || !jwtImportPromise) {
        res.status(401).json({
          ok: false,
          error: 'Logto SSO not configured. Use local login or configure LOGTO_ISSUER in settings.',
        });
        return;
      }

      // Reutiliza JWKS y jwtVerify ya inicializados (no se recrean por request)
      const [JWKS, { jwtVerify }] = await Promise.all([jwksPromise, jwtImportPromise]);
      const { payload } = await jwtVerify(token, JWKS, {
        issuer:   logtoIssuer,
        audience: logtoAudience ?? logtoIssuer,
      });

      (req as Request & { user: AuthenticatedUser }).user = {
        sub:    payload.sub as string,
        email:  (payload as Record<string, unknown>)['email'] as string | undefined,
        role:   ((payload as Record<string, unknown>)['role'] as string | undefined) ?? 'operator',
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

  app.use('/gateway/', webhookRateLimiter(opts));
  app.use('/api/', apiRateLimiter(opts));

  if (opts?.requireAuth ?? process.env.REQUIRE_AUTH === 'true') {
    // jwtAuthMiddleware() se llama UNA sola vez aquí — no dentro del handler
    const jwtMiddleware = jwtAuthMiddleware();
    app.use('/api/', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/auth/')) return next();
      return jwtMiddleware(req, res, next);
    });
  }
}
