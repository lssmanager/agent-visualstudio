/**
 * skill.repository.spec.ts
 *
 * Unit tests for SkillRepository — covers Skill CRUD and AgentSkill CRUD.
 *
 * Strategy:
 *  - Mock PrismaClient using plain objects with vi.fn() methods.
 *    (Matches the vi.fn() pattern used in this branch's n8n tests;
 *     avoids a jest-mock-extended dep that may not be installed.)
 *  - Every test verifies the EXACT Prisma call shape, not a DB result.
 *    The repo is a thin adapter; correctness = correct Prisma args.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillRepository } from '../skill.repository';
import type {
  CreateSkillInput,
  UpdateSkillInput,
  FindSkillsOptions,
  AssignSkillInput,
  UpdateAssignmentInput,
} from '../skill.repository';

// ── Mock factory ──────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    skill: {
      create:     vi.fn(),
      update:     vi.fn(),
      findFirst:  vi.fn(),
      findMany:   vi.fn(),
    },
    agentSkill: {
      create:     vi.fn(),
      update:     vi.fn(),
      delete:     vi.fn(),
      deleteMany: vi.fn(),
      findMany:   vi.fn(),
      findFirst:  vi.fn(),
      count:      vi.fn(),
    },
  } as unknown as import('@prisma/client').PrismaClient;
}

let prisma:  ReturnType<typeof makePrisma>;
let repo:    SkillRepository;

beforeEach(() => {
  prisma = makePrisma();
  repo   = new SkillRepository(prisma);
});

// ── SKILL CRUD ────────────────────────────────────────────────────────────────

describe('SkillRepository — Skill CRUD', () => {

  // Case 1 — createSkill defaults isActive to true
  it('createSkill() calls prisma.skill.create with isActive=true by default', async () => {
    const mockSkill = { id: 'skill-1', name: 'test', type: 'n8n_webhook', isActive: true };
    (prisma.skill.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockSkill);

    const input: CreateSkillInput = { name: 'test', type: 'n8n_webhook' };
    await repo.createSkill(input);

    expect(prisma.skill.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name:     'test',
          type:     'n8n_webhook',
          isActive: true,      // default applied
          config:   {},        // default empty object
        }),
      }),
    );
  });

  // Case 2 — updateSkill partial: only the provided field goes in data
  it('updateSkill() with one field only sends that field in data', async () => {
    const mockUpdated = { id: 'skill-1', name: 'renamed' };
    (prisma.skill.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUpdated);

    const data: UpdateSkillInput = { name: 'renamed' }; // only name
    await repo.updateSkill('skill-1', data);

    const call = (prisma.skill.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).toEqual({ id: 'skill-1' });
    // name must be present
    expect(call.data.name).toBe('renamed');
    // type, description, config, isActive must NOT be in data (undefined spreads nothing)
    expect(Object.keys(call.data)).not.toContain('type');
    expect(Object.keys(call.data)).not.toContain('isActive');
  });

  // Case 3 — softDeleteSkill sets deletedAt, does NOT call prisma.skill.delete
  it('softDeleteSkill() sets deletedAt and does not call prisma.skill.delete', async () => {
    (prisma.skill.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await repo.softDeleteSkill('skill-1');

    expect(prisma.skill.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'skill-1' },
        data:  expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
    // Physical delete must NOT be called
    const prismaCast = prisma as unknown as { skill: { delete?: ReturnType<typeof vi.fn> } };
    expect(prismaCast.skill.delete).toBeUndefined();
  });

  // Case 4 — findSkills with type + isActive filter
  it('findSkills({ type, isActive }) passes correct where clause', async () => {
    (prisma.skill.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const opts: FindSkillsOptions = { type: 'n8n_webhook', isActive: true };
    await repo.findSkills(opts);

    expect(prisma.skill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          type:      'n8n_webhook',
          isActive:  true,
        }),
      }),
    );
  });

  // Case 5 — findSkills defaults: take=50, skip=0, deletedAt null
  it('findSkills() without opts uses take=50, skip=0, deletedAt: null', async () => {
    (prisma.skill.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await repo.findSkills();

    const call = (prisma.skill.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.take).toBe(50);
    expect(call.skip).toBe(0);
    expect(call.where.deletedAt).toBeNull();
    // No type or isActive keys when opts are absent
    expect(Object.keys(call.where)).not.toContain('type');
    expect(Object.keys(call.where)).not.toContain('isActive');
  });
});

// ── AGENTSKILL CRUD ───────────────────────────────────────────────────────────

describe('SkillRepository — AgentSkill CRUD', () => {

  // Case 6 — assignSkill includes skill relation in result
  it('assignSkill() calls agentSkill.create with include: { skill: true }', async () => {
    const mockAssignment = {
      id: 'as-1', agentId: 'agent-1', skillId: 'skill-1',
      skill: { id: 'skill-1', name: 'test' },
    };
    (prisma.agentSkill.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockAssignment);

    const input: AssignSkillInput = { agentId: 'agent-1', skillId: 'skill-1' };
    const result = await repo.assignSkill(input);

    expect(prisma.agentSkill.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data:    expect.objectContaining({ agentId: 'agent-1', skillId: 'skill-1' }),
        include: { skill: true },
      }),
    );
    // The result must have the skill hydrated
    expect(result.skill).toBeDefined();
  });

  // Case 7 — findByAgent includes skill filter
  it('findByAgent() where includes skill: { deletedAt: null, isActive: true }', async () => {
    (prisma.agentSkill.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await repo.findByAgent('agent-42');

    expect(prisma.agentSkill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agentId: 'agent-42',
          skill: {
            deletedAt: null,
            isActive:  true,
          },
        }),
        include: { skill: true },
      }),
    );
  });

  // Case 8 — removeAssignment calls agentSkill.delete (not update)
  it('removeAssignment() calls agentSkill.delete with the given id', async () => {
    (prisma.agentSkill.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'as-1' });

    await repo.removeAssignment('as-1');

    expect(prisma.agentSkill.delete).toHaveBeenCalledWith({ where: { id: 'as-1' } });
    // Must NOT call update (softDelete is not used on AgentSkill)
    expect(prisma.agentSkill.update).not.toHaveBeenCalled();
  });

  // Case 9 — removeAllAssignments calls deleteMany with agentId
  it('removeAllAssignments() calls agentSkill.deleteMany with agentId', async () => {
    (prisma.agentSkill.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3 });

    await repo.removeAllAssignments('agent-99');

    expect(prisma.agentSkill.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { agentId: 'agent-99' } }),
    );
  });

  // Case 10 — findAssignment returns record when found
  it('findAssignment() returns the record when agentId+skillId match', async () => {
    const mockRecord = {
      id: 'as-5', agentId: 'agent-1', skillId: 'skill-1',
      skill: { id: 'skill-1', name: 'test' },
    };
    (prisma.agentSkill.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockRecord);

    const result = await repo.findAssignment('agent-1', 'skill-1');

    expect(prisma.agentSkill.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where:   { agentId: 'agent-1', skillId: 'skill-1' },
        include: { skill: true },
      }),
    );
    expect(result).toEqual(mockRecord);
  });

  // Case 11 — findAssignment returns null when not found
  it('findAssignment() returns null when combo does not exist', async () => {
    (prisma.agentSkill.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await repo.findAssignment('agent-X', 'skill-X');

    expect(result).toBeNull();
  });

  // Bonus — updateAssignment includes skill and uses configOverride guard
  it('updateAssignment() includes skill and only sets configOverride when provided', async () => {
    const mockUpdated = { id: 'as-1', configOverride: { foo: 'bar' }, skill: {} };
    (prisma.agentSkill.update as ReturnType<typeof vi.fn>).mockResolvedValue(mockUpdated);

    const data: UpdateAssignmentInput = { configOverride: { foo: 'bar' } };
    await repo.updateAssignment('as-1', data);

    const call = (prisma.agentSkill.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where).toEqual({ id: 'as-1' });
    expect(call.include).toEqual({ skill: true });
    expect(call.data.configOverride).toEqual({ foo: 'bar' });
  });
});
