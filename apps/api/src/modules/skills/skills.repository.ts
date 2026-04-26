/**
 * skills.repository.ts — Prisma (reemplaza workspaceStore JSON)
 *
 * Interfaz pública compatible:
 *   list()        → SkillSpec[]
 *   findById(id)  → SkillSpec | null
 *   saveAll()     → SkillSpec[]
 *   save(skill)   → SkillSpec
 *   remove(id)    → void
 */

import type { SkillSpec } from '../../../../../packages/core-types/src';
import { prisma } from '../core/db/prisma.service';
// import type { Prisma } from '../../../../../../../../packages/db/generated/client';
// Commented out: Path does not exist. Using type-only import from @prisma/client instead.
import type { Prisma } from '@prisma/client';

const db = prisma as any;

// ── Helpers ───────────────────────────────────────────────────────────────

function prismaToSpec(row: any): SkillSpec {
  return {
    id:           row.id,
    name:         row.name,
    description:  row.description,
    version:      row.version,
    category:     row.category,
    permissions:  row.permissions,
    functions:    (row.functions as any) ?? [],
    plugin:       (row.plugin as any) ?? undefined,
    files:        row.files,
    dependencies: row.dependencies,
    createdAt:    row.createdAt.toISOString(),
    updatedAt:    row.updatedAt.toISOString(),
  };
}

function specToCreateInput(
  skill: SkillSpec,
): any {
  return {
    id:           skill.id,
    name:         skill.name,
    description:  skill.description,
    version:      skill.version,
    category:     skill.category,
    permissions:  skill.permissions,
    functions:    (skill.functions as any) ?? [],
    plugin:       (skill.plugin as any) ?? undefined,
    files:        skill.files ?? [],
    dependencies: skill.dependencies ?? [],
  };
}

// ── Repository ────────────────────────────────────────────────────────────

export class SkillsRepository {
  async list(): Promise<SkillSpec[]> {
    const rows = await db.skill.findMany({ orderBy: { name: 'asc' } });
    return rows.map(prismaToSpec);
  }

  async findById(id: string): Promise<SkillSpec | null> {
    const row = await db.skill.findUnique({ where: { id } });
    return row ? prismaToSpec(row) : null;
  }

  async save(skill: SkillSpec): Promise<SkillSpec> {
    const data = specToCreateInput(skill);
    const row = await db.skill.upsert({
      where:  { id: skill.id },
      create: data,
      update: {
        name:         data.name,
        description:  data.description,
        version:      data.version,
        category:     data.category,
        permissions:  data.permissions,
        functions:    data.functions,
        plugin:       data.plugin,
        files:        data.files,
        dependencies: data.dependencies,
      },
    });
    return prismaToSpec(row);
  }

  async saveAll(skills: SkillSpec[]): Promise<SkillSpec[]> {
    return Promise.all(skills.map((s) => this.save(s)));
  }

  async remove(id: string): Promise<void> {
    await db.skill.delete({ where: { id } });
  }
}
