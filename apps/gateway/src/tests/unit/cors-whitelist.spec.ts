/**
 * cors-whitelist.spec.ts — F3b-03
 *
 * Verifica el comportamiento de corsMiddleware() contra su whitelist:
 *
 *   ✓ Origen autorizado   → Access-Control-Allow-Origin presente
 *   ✓ Origen NO autorizado → Access-Control-Allow-Origin ausente
 *   ✓ Preflight OPTIONS   → 204 + headers CORS
 *   ✓ Vary: Origin        → presente en respuestas autorizadas
 *   ✓ Rutas /gateway/**   → webhooks de canales (WA/TG) no bloquean por CORS
 *   ✓ Wildcard *          → permite cualquier origen
 *
 * Por qué CORS solo aplica a browsers:
 *   Los webhooks de WhatsApp/Telegram vienen de servidores — no envían el
 *   header Origin. Por tanto, cors no aplica y la petición siempre pasa.
 *   Este test lo documenta explícitamente.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import type { Application } from 'express';
import request from 'supertest';
import { corsMiddleware } from '../../middleware/security.middleware';

// ---------------------------------------------------------------------------
// Setup: tres apps con distintas configs de whitelist
// ---------------------------------------------------------------------------

let appWhitelist: Application;   // solo https://app.allowed.com
let appWildcard: Application;    // '*' (dev mode)
let appWebhook: Application;     // simula ruta /gateway/whatsapp/webhook

const ALLOWED_ORIGIN  = 'https://app.allowed.com';
const BLOCKED_ORIGIN  = 'https://evil.example.com';

beforeAll(() => {
  // ── App con whitelist estricta ──
  appWhitelist = express();
  appWhitelist.use(corsMiddleware([ALLOWED_ORIGIN]));
  appWhitelist.get('/api/agents', (_req, res) => res.json({ ok: true }));
  appWhitelist.options('/api/agents', (_req, res) => res.sendStatus(204));

  // ── App con wildcard (dev) ──
  appWildcard = express();
  appWildcard.use(corsMiddleware(['*']));
  appWildcard.get('/api/agents', (_req, res) => res.json({ ok: true }));

  // ── App simulando ruta de webhook (servidor → servidor, sin Origin) ──
  appWebhook = express();
  appWebhook.use(corsMiddleware([ALLOWED_ORIGIN]));
  appWebhook.post('/gateway/whatsapp/webhook', (_req, res) => res.json({ ok: true }));
  appWebhook.post('/gateway/telegram/webhook', (_req, res) => res.json({ ok: true }));
});

// ---------------------------------------------------------------------------
// Tests: whitelist estricta
// ---------------------------------------------------------------------------

describe('corsMiddleware — whitelist estricta (F3b-03)', () => {

  it('origen autorizado recibe Access-Control-Allow-Origin', async () => {
    const res = await request(appWhitelist)
      .get('/api/agents')
      .set('Origin', ALLOWED_ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('origen autorizado recibe Vary: Origin (evita cache incorrecto en CDN)', async () => {
    const res = await request(appWhitelist)
      .get('/api/agents')
      .set('Origin', ALLOWED_ORIGIN);

    expect(res.headers['vary']).toMatch(/Origin/i);
  });

  it('origen NO autorizado NO recibe Access-Control-Allow-Origin', async () => {
    const res = await request(appWhitelist)
      .get('/api/agents')
      .set('Origin', BLOCKED_ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('petición sin Origin (servidor-a-servidor) no recibe header CORS', async () => {
    const res = await request(appWhitelist)
      .get('/api/agents');
    // Sin Origin, no aplica CORS — la petición pasa igualmente
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.status).toBe(200);
  });

  it('preflight OPTIONS responde 204 con headers CORS para origen autorizado', async () => {
    const res = await request(appWhitelist)
      .options('/api/agents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toMatch(/GET/);
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
    expect(res.headers['access-control-allow-headers']).toMatch(/Authorization/i);
  });

  it('Access-Control-Max-Age es 86400 (1 día — reduce preflights)', async () => {
    const res = await request(appWhitelist)
      .options('/api/agents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    expect(res.headers['access-control-max-age']).toBe('86400');
  });

  it('preflight desde origen NO autorizado NO recibe Access-Control-Allow-Origin', async () => {
    const res = await request(appWhitelist)
      .options('/api/agents')
      .set('Origin', BLOCKED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    // OPTIONS devuelve 204 pero sin el header — el browser bloquea la petición real
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('Access-Control-Allow-Headers incluye headers de canales (Telegram, WhatsApp)', async () => {
    const res = await request(appWhitelist)
      .options('/api/agents')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-headers']).toMatch(/X-Telegram-Bot-Api-Secret-Token/i);
    expect(res.headers['access-control-allow-headers']).toMatch(/X-Hub-Signature-256/i);
  });
});

// ---------------------------------------------------------------------------
// Tests: wildcard (modo dev)
// ---------------------------------------------------------------------------

describe('corsMiddleware — wildcard * (dev mode)', () => {

  it('wildcard permite cualquier origen', async () => {
    const res = await request(appWildcard)
      .get('/api/agents')
      .set('Origin', BLOCKED_ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('wildcard sin Origin devuelve Access-Control-Allow-Origin: *', async () => {
    const res = await request(appWildcard).get('/api/agents');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});

// ---------------------------------------------------------------------------
// Tests: webhooks de canales (servidor → servidor, sin Origin)
// — WhatsApp/Telegram llaman desde servidores, no desde browsers
// — CORS no aplica → las peticiones siempre pasan
// ---------------------------------------------------------------------------

describe('corsMiddleware — webhooks de canales (servidor-a-servidor)', () => {

  it('POST /gateway/whatsapp/webhook sin Origin responde 200 (WhatsApp Meta)', async () => {
    const res = await request(appWebhook)
      .post('/gateway/whatsapp/webhook')
      .send({ entry: [] });

    // Sin header Origin, CORS no bloquea — la petición llega al handler
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('POST /gateway/telegram/webhook sin Origin responde 200 (Telegram Bot API)', async () => {
    const res = await request(appWebhook)
      .post('/gateway/telegram/webhook')
      .send({ update_id: 1 });

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
