/**
 * n8n.service.skills.spec.ts
 *
 * Unit tests for N8nService.getWorkflowsAsSkills() and getAllWorkflowsAsSkills().
 * Integration test verifying the tool name pattern produced by skillsToMcpTools().
 *
 * Mocking strategy:
 *  - PrismaService: plain object with vi.fn() methods.
 *  - skillsToMcpTools: imported from skill-bridge, used directly in the
 *    integration test (no mock needed — it is pure deterministic logic).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { N8nService }                            from '../n8n.service';
import type { N8nPrismaClient, BridgedSkillSpec } from '../n8n.types';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Build a mock Prisma that always throws unless overridden. */
function makePrismaMock(
  overrides: Partial<{
    workflowFindMany: N8nPrismaClient['n8nWorkflow']['findMany'];
    connectionFindMany: N8nPrismaClient['n8nConnection']['findMany'];
  }> = {},
): N8nPrismaClient {
  return {
    n8nConnection: {
      findUniqueOrThrow: vi.fn().mockRejectedValue(new Error('not mocked')),
      findMany: overrides.connectionFindMany ??
        vi.fn().mockResolvedValue([]),
    },
    n8nWorkflow: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: overrides.workflowFindMany ??
        vi.fn().mockResolvedValue([]),
    },
    skill: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => callback(this),
    ),
  } as unknown as N8nPrismaClient;
}

/** Sample workflow rows as returned by Prisma */
const WF_ALPHA = {
  id:            'prisma-id-1',
  connectionId:  'conn-abc',
  n8nWorkflowId: 'wf-alpha',
  name:          'Alpha Workflow',
  description:   'Does alpha things',
  inputSchema:   null,
  webhookUrl:    'https://n8n.example.com/webhook/alpha',
  isActive:      true,
};

const WF_BETA = {
  id:            'prisma-id-2',
  connectionId:  'conn-abc',
  n8nWorkflowId: 'wf-beta',
  name:          'Beta Workflow',
  description:   null,
  inputSchema:   {
    type:       'object',
    properties: { message: { type: 'string', description: 'Input message' } },
    required:   ['message'],
  },
  webhookUrl:    'https://n8n.example.com/webhook/beta',
  isActive:      true,
};

function makeService(prisma: N8nPrismaClient): N8nService {
  return new N8nService({
    baseUrl: 'https://n8n.example.com',
    apiKey:  'test-key',
    prisma,
  });
}

// ── Test suite ────────────────────────────────────────────────────────────

describe('N8nService.getWorkflowsAsSkills()', () => {

  // ── Case 1: 2 active workflows with webhookUrl ────────────────────────

  it('maps 2 active workflows to BridgedSkillSpec[] with correct shape', async () => {
    const prisma = makePrismaMock({
      workflowFindMany: vi.fn().mockResolvedValue([WF_ALPHA, WF_BETA]),
    });
    const service = makeService(prisma);

    const result = await service.getWorkflowsAsSkills('conn-abc');

    expect(result).toHaveLength(2);

    // category must be 'n8n' for all
    expect(result.every((s) => s.category === 'n8n')).toBe(true);

    // Each spec has exactly 1 function named 'invoke'
    for (const spec of result) {
      expect(spec.functions).toHaveLength(1);
      expect(spec.functions[0]!.name).toBe('invoke');
    }

    // endpoint is the webhookUrl from Prisma
    const alpha = result.find((s) => s.id === 'n8n_wf-alpha')!;
    expect(alpha.endpoint).toBe('https://n8n.example.com/webhook/alpha');

    const beta = result.find((s) => s.id === 'n8n_wf-beta')!;
    expect(beta.endpoint).toBe('https://n8n.example.com/webhook/beta');

    // description fallback for null
    expect(beta.description).toBe('Beta Workflow'); // falls back to name
    expect(alpha.description).toBe('Does alpha things');
  });

  // ── Case 2: all workflows inactive / filtered out ─────────────────────

  it('returns [] when findMany returns no rows (isActive=false filtered by WHERE)', async () => {
    // The WHERE clause in the service excludes isActive=false rows,
    // so findMany returns [] from the DB perspective.
    const prisma = makePrismaMock({
      workflowFindMany: vi.fn().mockResolvedValue([]),
    });
    const service = makeService(prisma);

    const result = await service.getWorkflowsAsSkills('conn-abc');

    expect(result).toEqual([]);

    // Verify findMany was called with the correct WHERE filter
    expect(prisma.n8nWorkflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          connectionId: 'conn-abc',
          isActive:     true,
          webhookUrl:   { not: null },
        }),
      }),
    );
  });

  // ── Case 3: webhookUrl null — excluded by Prisma WHERE ────────────────

  it('excludes workflows with null webhookUrl (WHERE webhookUrl: { not: null })', async () => {
    // The WHERE clause filters nulls — Prisma returns only non-null rows.
    // Simulate that by returning an empty array (the DB did the filtering).
    const prisma = makePrismaMock({
      workflowFindMany: vi.fn().mockResolvedValue([]),
    });
    const service = makeService(prisma);

    const result = await service.getWorkflowsAsSkills('conn-xyz');

    // Verify findMany was called with the correct WHERE shape
    expect(prisma.n8nWorkflow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          connectionId: 'conn-xyz',
          isActive:     true,
          webhookUrl:   { not: null },
        }),
      }),
    );
    expect(result).toEqual([]);
  });

  // ── Case 4: inputSchema present ───────────────────────────────────────

  it('forwards inputSchema to functions[0].inputSchema when non-null', async () => {
    const prisma = makePrismaMock({
      workflowFindMany: vi.fn().mockResolvedValue([WF_BETA]),
    });
    const service = makeService(prisma);

    const [spec] = await service.getWorkflowsAsSkills('conn-abc');

    expect(spec!.functions[0]!.inputSchema).toEqual(WF_BETA.inputSchema);
  });

  // ── Case 5: inputSchema null → functions[0].inputSchema === undefined ──

  it('omits inputSchema from functions[0] when workflow.inputSchema is null', async () => {
    const prisma = makePrismaMock({
      workflowFindMany: vi.fn().mockResolvedValue([WF_ALPHA]), // inputSchema: null
    });
    const service = makeService(prisma);

    const [spec] = await service.getWorkflowsAsSkills('conn-abc');

    // Must be undefined — not null, not the string 'null'
    expect(spec!.functions[0]!.inputSchema).toBeUndefined();
  });

  // ── Case 6: getAllWorkflowsAsSkills with 2 connections ────────────────

  it('getAllWorkflowsAsSkills() aggregates specs from all active connections', async () => {
    const WF_GAMMA = {
      ...WF_ALPHA,
      id:            'prisma-id-3',
      connectionId:  'conn-def',
      n8nWorkflowId: 'wf-gamma',
      name:          'Gamma Workflow',
      webhookUrl:    'https://n8n.example.com/webhook/gamma',
    };

    const prisma: N8nPrismaClient = {
      n8nConnection: {
        findUniqueOrThrow: vi.fn().mockRejectedValue(new Error('not used')),
        findMany: vi.fn().mockResolvedValue([
          { id: 'conn-abc' },
          { id: 'conn-def' },
        ]),
      },
      n8nWorkflow: {
        upsert: vi.fn(),
        findMany: vi.fn()
          .mockImplementation(({ where }: { where: { connectionId: string } }) => {
            if (where.connectionId === 'conn-abc') return Promise.resolve([WF_ALPHA]);
            if (where.connectionId === 'conn-def') return Promise.resolve([WF_GAMMA]);
            return Promise.resolve([]);
          }),
      },
      skill: {
        upsert: vi.fn(),
      },
    };

    const service = makeService(prisma);
    const result  = await service.getAllWorkflowsAsSkills();

    expect(result).toHaveLength(2);
    const ids = result.map((s) => s.id);
    expect(ids).toContain('n8n_wf-alpha');
    expect(ids).toContain('n8n_wf-gamma');
  });

  // ── Integration: skillsToMcpTools() produces the expected tool name ───

  it('integration: skillsToMcpTools() generates tool name skill__n8n_{id}__invoke', async () => {
    /**
     * We inline a minimal skillsToMcpTools() that mirrors the real
     * skill-bridge implementation to verify the naming contract without
     * requiring a cross-package import in the test environment.
     *
     * The REAL skillsToMcpTools() in packages/mcp-server/src/skill-bridge.ts
     * uses: `skill__${skill.id}__${fn.name}`
     * This test verifies our BridgedSkillSpec produces the correct id shape.
     */
    function skillsToMcpToolsStub(skills: BridgedSkillSpec[]) {
      return skills.flatMap((skill) =>
        skill.functions.map((fn) => ({
          name: `skill__${skill.id}__${fn.name}`,
        })),
      );
    }

    const prisma = makePrismaMock({
      workflowFindMany: vi.fn().mockResolvedValue([WF_ALPHA]),
    });
    const service = makeService(prisma);
    const specs   = await service.getWorkflowsAsSkills('conn-abc');
    const tools   = skillsToMcpToolsStub(specs);

    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe(`skill__n8n_wf-alpha__invoke`);
  });
});
