// packages/run-engine/src/skill-invoker.ts
//
// SkillInvoker — invoca skills registradas en la DB.
// Fix 10: Skill.name no tiene @unique en el schema → usar findFirst en lugar de findUnique.

import { PrismaClient } from '@prisma/client'

export class SkillInvoker {
  constructor(private readonly prisma: PrismaClient) {}

  async invoke(skillName: string, input: Record<string, unknown>): Promise<unknown> {
    // Fix: name no es campo @unique en Skill — findFirst es correcto
    const skill = await this.prisma.skill.findFirst({ where: { name: skillName } })
    if (!skill) {
      throw new Error(`Skill '${skillName}' not found`)
    }

    // La función real de invocación depende del tipo de skill (builtin, mcp, n8n, openapi)
    // Este stub retorna el input para compilar sin errores
    return {
      skillId:   skill.id,
      skillName: skill.name,
      skillType: skill.type,
      input,
      output:    null,
    }
  }

  async listAvailable(workspaceId?: string) {
    return this.prisma.skill.findMany({
      where: {
        isActive: true,
        ...(workspaceId ? { workspaceId } : {}),
      },
      select: { id: true, name: true, description: true, type: true, category: true },
    })
  }
}
