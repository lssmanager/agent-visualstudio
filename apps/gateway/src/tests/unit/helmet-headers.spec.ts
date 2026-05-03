/**
 * helmet-headers.spec.ts — F3b-02
 *
 * Verifica que helmetMiddleware() añade todos los headers de seguridad
 * requeridos por el checklist de F3b-02.
 *
 * FIX CodeRabbit: las aserciones de CSP ahora usan parseCsp() para verificar
 * pares directiva/valor exactos en lugar de loose regex. Un token que aparece
 * en otra directiva ya no genera un falso positivo.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import type { Application } from 'express';
import request from 'supertest';
import { helmetMiddleware } from '../../middleware/security.middleware.js';

// ---------------------------------------------------------------------------
// Helper: parsea el header CSP en un mapa directiva -> valor
// ---------------------------------------------------------------------------

/**
 * parseCsp(header) → Map<directiva, string>
 *
 * Convierte "default-src 'self'; frame-src 'none'; connect-src 'self' wss:"
 * en { 'default-src': "'self'", 'frame-src': "'none'", 'connect-src': "'self' wss:" }
 *
 * Permite aserciones exactas de directive/value en lugar de loose regex,
 * evitando false-positives donde el token existe en otra directiva.
 */
function parseCsp(header: string): Record<string, string> {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name.toLowerCase(), values.join(' ')] as [string, string];
      }),
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let app: Application;

beforeAll(() => {
  app = express();
  app.use(helmetMiddleware());
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('helmetMiddleware — security headers (F3b-02)', () => {

  it('incluye strict-transport-security con max-age=31536000 + includeSubDomains', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=31536000/);
    expect(res.headers['strict-transport-security']).toMatch(/includeSubDomains/i);
  });

  it('incluye content-security-policy con default-src self', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    const directives = parseCsp(csp);
    expect(directives['default-src']).toContain("'self'");
  });

  it('CSP: connect-src contiene wss: (SSE/WebSocket)', async () => {
    const res = await request(app).get('/health');
    const directives = parseCsp(res.headers['content-security-policy']);
    expect(directives['connect-src']).toContain('wss:');
    expect(directives['connect-src']).toContain("'self'");
  });

  it('CSP: font-src contiene fonts.gstatic.com (Google Fonts)', async () => {
    const res = await request(app).get('/health');
    const directives = parseCsp(res.headers['content-security-policy']);
    expect(directives['font-src']).toContain('fonts.gstatic.com');
  });

  it('CSP: frame-src es exactamente \'none\'', async () => {
    const res = await request(app).get('/health');
    const directives = parseCsp(res.headers['content-security-policy']);
    expect(directives['frame-src']).toBe("'none'");
  });

  it('CSP: object-src es exactamente \'none\'', async () => {
    const res = await request(app).get('/health');
    const directives = parseCsp(res.headers['content-security-policy']);
    expect(directives['object-src']).toBe("'none'");
  });

  it('CSP: script-src solo permite \'self\' (no CDN externos)', async () => {
    const res = await request(app).get('/health');
    const directives = parseCsp(res.headers['content-security-policy']);
    expect(directives['script-src']).toBe("'self'");
  });

  it('CSP: style-src permite \'unsafe-inline\' y fonts.googleapis.com', async () => {
    const res = await request(app).get('/health');
    const directives = parseCsp(res.headers['content-security-policy']);
    expect(directives['style-src']).toContain("'unsafe-inline'");
    expect(directives['style-src']).toContain('fonts.googleapis.com');
  });

  it('incluye x-frame-options DENY (clickjacking)', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('incluye x-content-type-options nosniff', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('incluye referrer-policy strict-origin-when-cross-origin', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('NO incluye x-powered-by (ocultar stack)', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('incluye x-dns-prefetch-control off', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
  });

  it('incluye x-permitted-cross-domain-policies none', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-permitted-cross-domain-policies']).toBe('none');
  });

  it('cross-origin-embedder-policy está desactivado (SSE compatible)', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['cross-origin-embedder-policy']).toBeUndefined();
  });
});
