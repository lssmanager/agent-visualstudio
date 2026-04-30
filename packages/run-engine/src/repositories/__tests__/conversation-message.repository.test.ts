/**
 * conversation-message.repository.test.ts
 * F0-06 coverage:
 *  - Append-only semantics (no update/delete on messages)
 *  - Thread pagination (cursor-based)
 *  - Role filters
 *  - scopeId / scopeType indexed queries
 *  - tokenCount aggregation
 */

import { PrismaClient }                   from '@prisma/client';
import { ConversationMessageRepository }  from '../conversation-message.repository';
import {
  createAgency, createDepartment, createWorkspace, createAgent,
  createChannelConfig, createGatewaySession,
} from './helpers/fixtures';

let prisma:   PrismaClient;
let repo:     ConversationMessageRepository;

let sessionId:  string;
let agentId:    string;

beforeAll(async () => {
  prisma = new PrismaClient();
  repo   = new ConversationMessageRepository(prisma);

  // Build minimal hierarchy for all tests in this file
  const agency  = await createAgency(prisma);
  const dept    = await createDepartment(prisma, agency.id);
  const ws      = await createWorkspace(prisma, dept.id);
  const agent   = await createAgent(prisma, ws.id);
  const channel = await createChannelConfig(prisma);
  const session = await createGatewaySession(prisma, channel.id, agent.id);

  sessionId = session.id;
  agentId   = agent.id;
});

afterAll(() => prisma.$disconnect());

afterEach(async () => {
  // Only truncate messages between tests; keep session/agent alive
  await prisma.$executeRawUnsafe('TRUNCATE "ConversationMessage"');
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function appendMsg(
  role: 'user' | 'assistant' | 'tool' | 'system',
  text: string,
  extras: Record<string, unknown> = {}
) {
  return repo.append({
    sessionId,
    role,
    contentText: text,
    contentJson: { role, content: text },
    tokenCount:  text.split(' ').length,   // rough estimate for tests
    scopeType:   'agent',
    scopeId:     agentId,
    ...extras,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ConversationMessageRepository', () => {

  describe('append (D-11: append-only)', () => {
    it('appends a user message and returns it with an id', async () => {
      const msg = await appendMsg('user', 'Hello world');
      expect(msg.id).toBeDefined();
      expect(msg.role).toBe('user');
      expect(msg.sessionId).toBe(sessionId);
    });

    it('appends messages of all roles', async () => {
      await appendMsg('user',      'User says hi');
      await appendMsg('assistant', 'Assistant replies');
      await appendMsg('tool',      'Tool output');
      await appendMsg('system',    'System context');
      const all = await repo.getThread(sessionId);
      expect(all.length).toBe(4);
    });

    it('does not allow updating a message (append-only contract)', async () => {
      // ConversationMessageRepository must NOT expose an `update` method.
      // This test guards against accidental exposure.
      expect(typeof (repo as any).update).toBe('undefined');
      expect(typeof (repo as any).patch).toBe('undefined');
    });

    it('does not allow deleting a message (append-only contract)', async () => {
      expect(typeof (repo as any).delete).toBe('undefined');
      expect(typeof (repo as any).deleteById).toBe('undefined');
    });
  });

  describe('getThread — pagination', () => {
    it('returns messages in ascending createdAt order', async () => {
      await appendMsg('user',      'first');
      await appendMsg('assistant', 'second');
      await appendMsg('user',      'third');
      const msgs = await repo.getThread(sessionId);
      expect(msgs[0].contentText).toBe('first');
      expect(msgs[2].contentText).toBe('third');
    });

    it('supports limit', async () => {
      await Promise.all(
        Array.from({ length: 5 }, (_, i) => appendMsg('user', `msg ${i}`))
      );
      const page = await repo.getThread(sessionId, { limit: 3 });
      expect(page.length).toBe(3);
    });

    it('supports cursor-based pagination (after)', async () => {
      const m1 = await appendMsg('user', 'msg 1');
      const m2 = await appendMsg('user', 'msg 2');
      const m3 = await appendMsg('user', 'msg 3');

      // Fetch page 1 (first 2)
      const page1 = await repo.getThread(sessionId, { limit: 2 });
      expect(page1.length).toBe(2);

      // Page 2: after the last item in page1
      const page2 = await repo.getThread(sessionId, {
        limit: 10,
        after: page1[page1.length - 1].id,
      });
      expect(page2.length).toBe(1);
      expect(page2[0].id).toBe(m3.id);
    });

    it('returns empty array for unknown sessionId', async () => {
      const msgs = await repo.getThread('00000000-0000-0000-0000-000000000000');
      expect(msgs).toHaveLength(0);
    });
  });

  describe('getThread — role filter', () => {
    it('filters by role', async () => {
      await appendMsg('user',      'u1');
      await appendMsg('assistant', 'a1');
      await appendMsg('user',      'u2');
      const userMsgs = await repo.getThread(sessionId, { role: 'user' });
      expect(userMsgs.length).toBe(2);
      userMsgs.forEach(m => expect(m.role).toBe('user'));
    });
  });

  describe('countTokens', () => {
    it('sums tokenCount for a session', async () => {
      await appendMsg('user',      'Hello there', { tokenCount: 10 });
      await appendMsg('assistant', 'Hi!',          { tokenCount: 5  });
      const total = await repo.countTokens(sessionId);
      expect(total).toBe(15);
    });

    it('returns 0 for empty session', async () => {
      const total = await repo.countTokens('00000000-0000-0000-0000-000000000000');
      expect(total).toBe(0);
    });
  });

  describe('getByScopeId', () => {
    it('returns messages filtered by scopeId + scopeType', async () => {
      await appendMsg('user', 'scoped message', {
        scopeType: 'agent',
        scopeId:   agentId,
      });
      await appendMsg('user', 'no scope', {
        scopeType: undefined,
        scopeId:   undefined,
      });
      const msgs = await repo.getByScopeId('agent', agentId);
      expect(msgs.length).toBeGreaterThanOrEqual(1);
      msgs.forEach(m => expect(m.scopeId).toBe(agentId));
    });
  });

  describe('getRecentContext', () => {
    it('returns the most recent N messages (for LLM context window)', async () => {
      for (let i = 0; i < 10; i++) {
        await appendMsg(i % 2 === 0 ? 'user' : 'assistant', `msg ${i}`);
      }
      const ctx = await repo.getRecentContext(sessionId, { maxMessages: 4 });
      expect(ctx.length).toBe(4);
      // Should be the LAST 4 messages
      expect(ctx[ctx.length - 1].contentText).toBe('msg 9');
    });
  });
});
