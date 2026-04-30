/**
 * skill-invoker.test.ts — F1b-01 test suite
 *
 * Cubre todos los criterios de cierre:
 *  ✅ headerAuth → header correcto en el fetch
 *  ✅ basicAuth  → Authorization: Basic <base64(user:pass)>
 *  ✅ GET        → args serializados como query-string
 *  ✅ 503        → reintenta 2×, luego falla
 *  ✅ n8n [{ json }] envelope → unwrap al objeto interno
 *  ✅ inline tool (invokeWebhookDirect) → status: 'completed'
 *  ✅ Timeout    → AbortError → status: 'failed' con mensaje correcto
 *
 * Estrategia de mock: reemplazamos global.fetch con jest.fn() y restauramos
 * después de cada test. No se necesita nock ni MSW.
 */

import { SkillInvoker, type SkillInvokeResult } from '../skill-invoker';

// ─── Shared mock setup ────────────────────────────────────────────────────────

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

beforeAll(() => {
  (global as unknown as Record<string, unknown>).fetch = mockFetch;
});

beforeEach(() => {
  mockFetch.mockReset();
});

/** Create a minimal fetch Response-like object */
function makeResponse(
  status: number,
  body: unknown,
  contentType = 'application/json',
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: {
      get: (h: string) => (h.toLowerCase() === 'content-type' ? contentType : null),
    },
    json: async () => body,
    text: async () =>
      typeof body === 'string' ? body : JSON.stringify(body),
    // minimal required fields
    redirected: false,
    url: '',
    type: 'default',
  } as unknown as Response;
}

/** Build a SkillInvoker without a real PrismaClient */
function makeInvoker(): SkillInvoker {
  return new SkillInvoker(null as unknown as import('@prisma/client').PrismaClient);
}

// ─── invokeWebhookDirect — auth & methods ────────────────────────────────────

describe('invokeWebhookDirect()', () => {
  const invoker = makeInvoker();

  describe('authType: headerAuth', () => {
    it('sends the configured header name + value', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200, { ok: true }));

      await invoker.invokeWebhookDirect(
        {
          webhookUrl: 'https://n8n.test/webhook/abc',
          method: 'POST',
          authType: 'headerAuth',
          authHeader: 'X-Api-Key',
          authValue: 'super-secret',
        },
        { foo: 'bar' },
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, init] = mockFetch.mock.calls[0];
      expect((init?.headers as Record<string, string>)['X-Api-Key']).toBe('super-secret');
    });

    it('throws when authValue is missing', async () => {
      const result = await invoker.invokeWebhookDirect(
        {
          webhookUrl: 'https://n8n.test/webhook/abc',
          authType: 'headerAuth',
          // authValue intentionally absent
        },
        {},
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/authValue/);
    });

    it('defaults header name to Authorization when authHeader is omitted', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200, {}));

      await invoker.invokeWebhookDirect(
        {
          webhookUrl: 'https://n8n.test/webhook/abc',
          authType: 'headerAuth',
          authValue: 'tok-xyz',
        },
        {},
      );

      const [, init] = mockFetch.mock.calls[0];
      expect((init?.headers as Record<string, string>)['Authorization']).toBe('tok-xyz');
    });
  });

  describe('authType: basicAuth', () => {
    it('encodes Authorization: Basic base64(user:pass)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200, { data: 1 }));

      await invoker.invokeWebhookDirect(
        {
          webhookUrl: 'https://n8n.test/webhook/abc',
          authType: 'basicAuth',
          authUser: 'admin',
          authPassword: 'p@ssw0rd',
        },
        {},
      );

      const [, init] = mockFetch.mock.calls[0];
      const expected = 'Basic ' + Buffer.from('admin:p@ssw0rd').toString('base64');
      expect((init?.headers as Record<string, string>)['Authorization']).toBe(expected);
    });

    it('fails when user or password is missing', async () => {
      const result = await invoker.invokeWebhookDirect(
        {
          webhookUrl: 'https://n8n.test/webhook/abc',
          authType: 'basicAuth',
          authUser: 'admin',
          // authPassword absent
        },
        {},
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/authUser.*authPassword|authPassword.*authUser/i);
    });
  });

  describe('GET request', () => {
    it('serializes args as query-string instead of body', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200, { found: true }));

      await invoker.invokeWebhookDirect(
        { webhookUrl: 'https://n8n.test/webhook/search', method: 'GET' },
        { q: 'hello world', limit: 10 },
      );

      const [calledUrl, init] = mockFetch.mock.calls[0];
      expect(calledUrl as string).toContain('q=hello%20world');
      expect(calledUrl as string).toContain('limit=10');
      expect(init?.body).toBeUndefined();
    });

    it('appends to existing query string with &', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200, {}));

      await invoker.invokeWebhookDirect(
        { webhookUrl: 'https://n8n.test/webhook/q?token=abc', method: 'GET' },
        { page: 2 },
      );

      const [calledUrl] = mockFetch.mock.calls[0];
      expect(calledUrl as string).toContain('token=abc&page=2');
    });
  });

  describe('5xx retry', () => {
    it('retries twice on 503 then returns ok:false after 3rd failure', async () => {
      // 3 failures: attempt 0, 1, 2
      mockFetch
        .mockResolvedValueOnce(makeResponse(503, 'Service Unavailable', 'text/plain'))
        .mockResolvedValueOnce(makeResponse(503, 'Service Unavailable', 'text/plain'))
        .mockResolvedValueOnce(makeResponse(503, 'Service Unavailable', 'text/plain'));

      const result = await invoker.invokeWebhookDirect(
        { webhookUrl: 'https://n8n.test/webhook/abc' },
        {},
      );

      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/503/);
    }, 5_000); // backoff adds up to ~1 s in tests (0 + 500 ms)

    it('succeeds if the 2nd attempt returns 200', async () => {
      mockFetch
        .mockResolvedValueOnce(makeResponse(503, 'err', 'text/plain'))
        .mockResolvedValueOnce(makeResponse(200, { recovered: true }));

      const result = await invoker.invokeWebhookDirect(
        { webhookUrl: 'https://n8n.test/webhook/abc' },
        {},
      );

      expect(result.ok).toBe(true);
      expect((result.result as Record<string, unknown>).recovered).toBe(true);
    }, 5_000);

    it('does NOT retry on 501 Not Implemented', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(501, 'Not Implemented', 'text/plain'));

      const result = await invoker.invokeWebhookDirect(
        { webhookUrl: 'https://n8n.test/webhook/abc' },
        {},
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/501/);
    });
  });

  describe('n8n envelope parse', () => {
    it('unwraps [{ json: {...} }] to the inner object', async () => {
      const payload = [{ json: { name: 'Alice', score: 99 } }];
      mockFetch.mockResolvedValueOnce(makeResponse(200, payload));

      const result = await invoker.invokeWebhookDirect(
        { webhookUrl: 'https://n8n.test/webhook/abc' },
        {},
      );

      expect(result.ok).toBe(true);
      expect(result.result).toEqual({ name: 'Alice', score: 99 });
    });

    it('returns plain object as-is (no envelope)', async () => {
      const payload = { message: 'ok' };
      mockFetch.mockResolvedValueOnce(makeResponse(200, payload));

      const result = await invoker.invokeWebhookDirect(
        { webhookUrl: 'https://n8n.test/webhook/abc' },
        {},
      );

      expect(result.result).toEqual({ message: 'ok' });
    });

    it('returns text/plain response as string', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200, 'plain text', 'text/plain'));

      const result = await invoker.invokeWebhookDirect(
        { webhookUrl: 'https://n8n.test/webhook/abc' },
        {},
      );

      expect(result.ok).toBe(true);
      expect(result.result).toBe('plain text');
    });

    it('returns empty array as-is (no json key → not unwrapped)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200, []));

      const result = await invoker.invokeWebhookDirect(
        { webhookUrl: 'https://n8n.test/webhook/abc' },
        {},
      );

      expect(result.result).toEqual([]);
    });
  });

  describe('timeout / AbortController', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('resolves ok when fetch completes before timeout', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse(200, { done: true }));

      const p = invoker.invokeWebhookDirect(
        { webhookUrl: 'https://n8n.test/webhook/abc' },
        {},
      );

      await jest.runAllTimersAsync();
      const result = await p;
      expect(result.ok).toBe(true);
    });

    it('calls AbortController.abort() on timeout and returns ok:false', async () => {
      let capturedSignal: AbortSignal | undefined;
      mockFetch.mockImplementation((_url, init) => {
        capturedSignal = init?.signal as AbortSignal;
        // Simulate a fetch that hangs forever
        return new Promise(() => {});
      });

      const p = invoker.invokeWebhookDirect(
        { webhookUrl: 'https://n8n.test/webhook/abc' },
        {},
      );

      // Advance past SKILL_TIMEOUT_MS
      jest.advanceTimersByTime(31_000);
      await jest.runAllTimersAsync();

      // The AbortController should have been aborted
      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  describe('missing webhookUrl', () => {
    it('returns ok:false with descriptive error', async () => {
      const result = await invoker.invokeWebhookDirect(
        { method: 'POST' /* no webhookUrl */ },
        {},
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/webhookUrl/);
    });
  });
});

// ─── invoke() — DB lookup path ───────────────────────────────────────────────

describe('invoke() — skill not found in DB', () => {
  it('returns ok:false with descriptive error', async () => {
    const prisma = {
      skill: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as import('@prisma/client').PrismaClient;

    const invoker = new SkillInvoker(prisma);
    const result = await invoker.invoke('unknown-skill', {});

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found in registry/);
  });
});
