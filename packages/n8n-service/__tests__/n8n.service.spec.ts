/**
 * n8n.service.spec.ts
 *
 * Integration-style unit tests for N8nService.triggerWorkflow().
 * Uses msw/node to intercept fetch calls at the network layer —
 * no real n8n instance required.
 *
 * Test matrix (F1b-05 closure criteria):
 *  1. Happy path:  POST → executionId, GET → success
 *  2. fireAndForget:  POST only, no GET, status:'pending'
 *  3. Polling timeout:  GET always returns 'running' → timedOut:true
 *  4. Network error on POST → 2 retries → status:'error', executionId:''
 *  5. Workflow error:  GET returns status:'error' with error message
 *  6. Network errors on GET are ignored — loop continues to success
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer }     from 'msw/node';
import { http, HttpResponse } from 'msw';
import { N8nService }      from '../src/n8n.service';

const BASE_URL = 'http://n8n-test.local';

// ── MSW server ───────────────────────────────────────────────────────────────

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ── Helpers ──────────────────────────────────────────────────────────────────

function executionUrl(id: string) {
  return `${BASE_URL}/api/v1/executions/${id}`;
}
function workflowExecuteUrl(id: string) {
  return `${BASE_URL}/api/v1/workflows/${id}/execute`;
}

/** Standard successful trigger response */
function triggerOk(executionId: string) {
  return HttpResponse.json({ data: { executionId } });
}

/** Standard successful execution result */
function executionSuccess(id: string, workflowId: string, data = { result: 'done' }) {
  return HttpResponse.json({ id, status: 'success', data, workflowId });
}

// ── Tests ────────────────────────────────────────────────────────────────────────

describe('N8nService.triggerWorkflow()', () => {

  // ── 1. Happy path ────────────────────────────────────────────────

  it('éxito: dispara workflow y recibe resultado vía polling', async () => {
    server.use(
      http.post(workflowExecuteUrl('wf1'), () => triggerOk('ex1')),
      http.get(executionUrl('ex1'), () =>
        executionSuccess('ex1', 'wf1', { result: 'done' }),
      ),
    );

    const svc = new N8nService({
      baseUrl:       BASE_URL,
      apiKey:        'test-key',
      pollIntervalMs: 50,
      maxWaitMs:     5_000,
    });

    const res = await svc.triggerWorkflow({ workflowId: 'wf1', inputData: { x: 1 } });

    expect(res.status).toBe('success');
    expect(res.executionId).toBe('ex1');
    expect(res.timedOut).toBeUndefined();
    expect(res.outputData).toEqual({ result: 'done' });
    expect(res.error).toBeUndefined();
  });

  // ── 2. fireAndForget ──────────────────────────────────────────────

  it('fireAndForget: devuelve status:pending sin hacer polling', async () => {
    server.use(
      http.post(workflowExecuteUrl('wf2'), () => triggerOk('ex2')),
      // GET handler intentionally absent — msw would throw if called
    );

    const svc = new N8nService({
      baseUrl: BASE_URL,
      apiKey:  'test-key',
    });

    const res = await svc.triggerWorkflow({
      workflowId:    'wf2',
      fireAndForget: true,
    });

    expect(res.status).toBe('pending');
    expect(res.executionId).toBe('ex2');
    expect(res.timedOut).toBeUndefined();
    expect(res.outputData).toBeUndefined();
  });

  // ── 3. Polling timeout ──────────────────────────────────────────────

  it('timeout: polling supera maxWaitMs → timedOut:true', async () => {
    server.use(
      http.post(workflowExecuteUrl('wf3'), () => triggerOk('ex3')),
      http.get(executionUrl('ex3'), () =>
        HttpResponse.json({ id: 'ex3', status: 'running', workflowId: 'wf3' }),
      ),
    );

    const svc = new N8nService({
      baseUrl:        BASE_URL,
      apiKey:         'test-key',
      pollIntervalMs: 50,
      maxWaitMs:      200,  // very short — will expire quickly
    });

    const res = await svc.triggerWorkflow({ workflowId: 'wf3' });

    expect(res.timedOut).toBe(true);
    expect(res.error).toMatch(/did not complete within/);
    expect(res.executionId).toBe('ex3');
  });

  // ── 4. Network error on POST ───────────────────────────────────────

  it('error de red en trigger: reintenta 2 veces y devuelve status:error', async () => {
    // All POST attempts return a network error
    server.use(
      http.post(workflowExecuteUrl('wf4'), () => HttpResponse.error()),
    );

    const svc = new N8nService({
      baseUrl:    BASE_URL,
      apiKey:     'test-key',
      maxRetries: 2,
      // short timeoutMs to make the test fast
      timeoutMs:  200,
    });

    const res = await svc.triggerWorkflow({ workflowId: 'wf4' });

    expect(res.status).toBe('error');
    expect(res.executionId).toBe('');
    expect(res.error).toBeTruthy();
  });

  // ── 5. Workflow itself errors ────────────────────────────────────────

  it('workflow con status:error devuelve el mensaje de error de n8n', async () => {
    server.use(
      http.post(workflowExecuteUrl('wf5'), () => triggerOk('ex5')),
      http.get(executionUrl('ex5'), () =>
        HttpResponse.json({
          id:         'ex5',
          status:     'error',
          error:      'Node failed: HTTP Request returned 500',
          workflowId: 'wf5',
        }),
      ),
    );

    const svc = new N8nService({
      baseUrl:        BASE_URL,
      apiKey:         'test-key',
      pollIntervalMs: 50,
      maxWaitMs:      5_000,
    });

    const res = await svc.triggerWorkflow({ workflowId: 'wf5' });

    expect(res.status).toBe('error');
    expect(res.error).toMatch(/Node failed/);
    expect(res.executionId).toBe('ex5');
    expect(res.timedOut).toBeUndefined();
  });

  // ── 6. Network errors on GET polling are ignored ────────────────────

  it('errores de red en polling son ignorados — loop llega a success', async () => {
    let getCallCount = 0;

    server.use(
      http.post(workflowExecuteUrl('wf6'), () => triggerOk('ex6')),
      http.get(executionUrl('ex6'), () => {
        getCallCount++;
        // First 2 calls: network error. Third call: success.
        if (getCallCount <= 2) return HttpResponse.error();
        return executionSuccess('ex6', 'wf6');
      }),
    );

    const svc = new N8nService({
      baseUrl:        BASE_URL,
      apiKey:         'test-key',
      pollIntervalMs: 50,
      maxWaitMs:      5_000,
    });

    const res = await svc.triggerWorkflow({ workflowId: 'wf6' });

    expect(res.status).toBe('success');
    expect(getCallCount).toBeGreaterThanOrEqual(3);
    expect(res.timedOut).toBeUndefined();
  });

});
