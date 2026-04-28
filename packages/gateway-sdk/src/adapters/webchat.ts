/**
 * adapters/webchat.ts
 *
 * WebChatAdapter — implements IChannelAdapter for the embedded web widget.
 *
 * Transport: Server-Sent Events (SSE) for outbound, HTTP POST for inbound.
 * No external dependencies — uses Node.js built-ins only.
 *
 * Architecture:
 *   - Each browser session opens a GET /chat/stream?sessionId=... SSE connection.
 *   - The adapter keeps an in-memory map of sessionId → Set<SSESubscriber>.
 *     Multiple browser tabs for the same sessionId all receive the message.
 *   - Inbound messages arrive via POST /chat/message and are placed on a
 *     per-session AsyncQueue that the gateway polls via receive().
 *   - setup() and teardown() are no-ops (no external registration needed).
 *
 * Express integration (apps/gateway/src/routes/webchat.ts):
 *
 *   const adapter = new WebChatAdapter();
 *   router.get ('/chat/stream',   adapter.createSseHandler());
 *   router.post('/chat/message',  adapter.createWebhookHandler());
 *
 * Config expected in ChannelConfig.config:
 *   { allowedOrigins?: string[] }  — for CORS validation
 *
 * Secrets: none required.
 */

import type {
  IChannelAdapter,
  IncomingMessage,
  OutboundMessage,
} from '../channel-adapter';
import type { IncomingMessage as NodeIncomingMessage, ServerResponse } from 'http';

// ─── Internal types ─────────────────────────────────────────────────────────

interface SSESubscriber {
  /** Write a formatted SSE event to the response stream */
  write(event: string, data: unknown): void;
  /** True after the client disconnects */
  closed: boolean;
}

interface QueuedMessage {
  incoming:  IncomingMessage;
  resolve:  () => void;
}

// ─── WebChatAdapter ───────────────────────────────────────────────────────

export class WebChatAdapter implements IChannelAdapter {
  readonly type = 'webchat';

  /**
   * Map of externalUserId (browser session ID) → active SSE subscribers.
   * Multiple tabs = multiple subscribers for the same session.
   */
  private readonly subscribers = new Map<string, Set<SSESubscriber>>();

  /**
   * Map of externalUserId → queued incoming messages waiting to be processed.
   * The gateway calls receive() which drains this queue.
   */
  private readonly inboundQueues = new Map<string, QueuedMessage[]>();

  // ─── IChannelAdapter ────────────────────────────────────────────

  async setup(): Promise<void> { /* no-op — no external registration needed */ }
  async teardown(): Promise<void> { this.subscribers.clear(); this.inboundQueues.clear(); }

  /**
   * Dequeue the oldest pending incoming message for a given externalUserId.
   * Returns null if the queue is empty (no new messages).
   *
   * NOTE: The gateway should use createWebhookHandler() which pushes to the
   * queue and awaits processing. receive() is available for polling-mode
   * integrations or direct testing.
   */
  async receive(
    rawPayload: Record<string, unknown>,
    _secrets:   Record<string, unknown>,
  ): Promise<IncomingMessage | null> {
    const externalUserId = rawPayload.sessionId as string;
    if (!externalUserId) return null;

    const queue = this.inboundQueues.get(externalUserId);
    if (!queue?.length) return null;

    const item = queue.shift()!;
    item.resolve();
    return item.incoming;
  }

  /**
   * Fan out a reply to all active SSE subscribers for this session.
   * Subscribers that have disconnected are pruned automatically.
   */
  async send(
    message:  OutboundMessage,
    _config:  Record<string, unknown>,
    _secrets: Record<string, unknown>,
  ): Promise<void> {
    const sessionId = message.externalUserId;
    const subs = this.subscribers.get(sessionId);
    if (!subs?.size) return; // no active connections — silently drop

    const eventType = (message.options?.eventType as string) ?? 'message';
    const payload = {
      text:        message.text,
      attachments: message.attachments ?? [],
      buttons:     message.buttons     ?? [],
      ts:          new Date().toISOString(),
    };

    const dead: SSESubscriber[] = [];
    for (const sub of subs) {
      if (sub.closed) { dead.push(sub); continue; }
      sub.write(eventType, payload);
    }
    for (const sub of dead) subs.delete(sub);
  }

  // ─── Express middleware factories ──────────────────────────────────

  /**
   * Returns an Express-compatible GET handler for SSE connections.
   * Query params: ?sessionId=<externalUserId>
   *
   * Usage:
   *   router.get('/chat/stream', adapter.createSseHandler());
   */
  createSseHandler() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (req: any, res: ServerResponse): void => {
      const sessionId = (req.query?.sessionId ?? req.url?.split('sessionId=')[1]?.split('&')[0]) as string;
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing sessionId query parameter');
        return;
      }

      // SSE headers
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no', // disable Nginx buffering
      });
      res.write(':ok\n\n'); // initial heartbeat

      let closed = false;
      const subscriber: SSESubscriber = {
        get closed() { return closed; },
        write(event: string, data: unknown) {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          try { (res as NodeIncomingMessage & ServerResponse).write?.(payload); }
          catch { closed = true; }
        },
      };

      // Register subscriber
      if (!this.subscribers.has(sessionId)) {
        this.subscribers.set(sessionId, new Set());
      }
      this.subscribers.get(sessionId)!.add(subscriber);

      // Heartbeat every 25s to prevent proxy timeouts
      const heartbeat = setInterval(() => {
        if (closed) { clearInterval(heartbeat); return; }
        try { res.write(':heartbeat\n\n'); }
        catch { closed = true; clearInterval(heartbeat); }
      }, 25_000);

      // Cleanup on disconnect
      req.on?.('close', () => {
        closed = true;
        clearInterval(heartbeat);
        this.subscribers.get(sessionId)?.delete(subscriber);
      });
    };
  }

  /**
   * Returns an Express-compatible POST handler for inbound messages.
   * Body: { sessionId: string, text?: string, attachments?: MessageAttachment[] }
   *
   * The handler pushes the message onto the per-session queue and waits
   * for the gateway to process it (or times out after WEBCHAT_QUEUE_TIMEOUT_MS).
   *
   * Usage:
   *   router.post('/chat/message', express.json(), adapter.createWebhookHandler());
   */
  createWebhookHandler() {
    const timeoutMs = Number(process.env.WEBCHAT_QUEUE_TIMEOUT_MS ?? 60_000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (req: any, res: ServerResponse): Promise<void> => {
      const body = req.body as Record<string, unknown>;
      const sessionId = body?.sessionId as string;

      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing sessionId in request body' }));
        return;
      }

      const incoming: IncomingMessage = {
        externalUserId: sessionId,
        text:           (body.text as string) ?? null,
        attachments:    (body.attachments as IncomingMessage['attachments']) ?? [],
        metadata:       { source: 'webchat', userAgent: req.headers?.['user-agent'] },
        ts:             new Date().toISOString(),
      };

      await new Promise<void>((resolveEnqueue, rejectEnqueue) => {
        if (!this.inboundQueues.has(sessionId)) {
          this.inboundQueues.set(sessionId, []);
        }

        let done = false;
        const timeout = setTimeout(() => {
          if (done) return;
          done = true;
          // Remove from queue if not yet processed
          const q = this.inboundQueues.get(sessionId);
          if (q) {
            const idx = q.findIndex(m => m.incoming === incoming);
            if (idx !== -1) q.splice(idx, 1);
          }
          rejectEnqueue(new Error('WebChat message queue timeout'));
        }, timeoutMs);

        this.inboundQueues.get(sessionId)!.push({
          incoming,
          resolve: () => { done = true; clearTimeout(timeout); resolveEnqueue(); },
        });
      }).then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }).catch((err: Error) => {
        res.writeHead(408, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });
    };
  }
}
