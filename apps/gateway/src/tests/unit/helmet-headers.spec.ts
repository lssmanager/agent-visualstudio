/**
 * helmet-headers.spec.ts — F3b-02
 *
 * Verifica que helmetMiddleware() añade todos los headers de seguridad
 * requeridos por el checklist de F3b-02.
 *
 * No levanta un servidor real — crea una mini Express app en memoria
 * y verifica que los headers estén presentes en la respuesta a GET /health.
 *
 * Headers verificados:
 *   ✓ strict-transport-security  (HSTS)
 *   ✓ content-security-policy    (CSP)
 *   ✓ x-frame-options             (clickjacking)
 *   ✓ x-content-type-options      (MIME sniffing)
 *   ✓ referrer-policy
 *   ✓ x-permitted-cross-domain-policies
 *   ✓ x-dns-prefetch-control
 *   ✓ x-powered-by ausente        (no revelar stack)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import type { Application } from 'express';
import request from 'supertest';
import { helmetMiddleware } from '../../middleware/security.middleware.js';

// ---------------------------------------------------------------------------
// Setup: mini Express app con solo Helmet + un endpoint /health
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

  it('incluye strict-transport-security con max-age=31536000', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=31536000/);
    expect(res.headers['strict-transport-security']).toMatch(/includeSubDomains/i);
  });

  it('incluye content-security-policy con default-src self', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toMatch(/default-src/);
    expect(csp).toMatch(/'self'/);
  });

  it('CSP incluye connect-src con wss: para SSE/WebSocket', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/connect-src/);
    expect(csp).toMatch(/wss:/);
  });

  it('CSP incluye font-src con fonts.gstatic.com', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/font-src/);
    expect(csp).toMatch(/fonts\.gstatic\.com/);
  });

  it('CSP bloquea frame-src (none)', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy'];
    expect(csp).toMatch(/frame-src/);
    expect(csp).toMatch(/'none'/);
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

  it('crossOriginEmbedderPolicy está desactivado (SSE compatible)', async () => {
    const res = await request(app).get('/health');
    // Con crossOriginEmbedderPolicy: false, el header no debe estar presente
    expect(res.headers['cross-origin-embedder-policy']).toBeUndefined();
  });
});
