/**
 * skill.repository.ts
 *
 * Repository para los modelos Skill y AgentSkill.
 *
 * Responsabilidades:
 *  - Skill:      catálogo global de skills disponibles en el sistema.
 *  - AgentSkill: asignación de un Skill a un Agent con config override.
 *
 * Relación:
 *   Agent (1) ──▶ AgentSkill (N) ──▶ Skill (1)
 *
 * Reglas del patrón de repositorios de este monorepo:
 *  - Clase stateless: sin estado interno, sin cache, sin Map<>.
 *  - PrismaClient inyectado en constructor.
 *  - softDelete en Skill: setea deletedAt (no elimina la fila).
 *  - DELETE físico en AgentSkill: es tabla de unión sin valor histórico.
 *  - Spread condicional en updates: ...(field !== undefined && { field }).
 *  - JSON fields (config, configOverride) casteados como `never` (Prisma requiere
 *    InputJsonValue; el cast es el patrón aprobado en este monorepo).
 *  - findByAgent filtra skill: { deletedAt: null, isActive: true } —
 *    garantiza que skills eliminados no aparezcan como tools del LLM.
 *
 * Referencia canónica del patrón: agent.repository.ts
 */

import type { PrismaClient } from '@prisma/client';

// ── Skill DTOs ────────────────────────────────────────────────────────────

export interface CreateSkillInput {
  name:         string;
  type:         string;   // 'mcp_server' | 'n8n_webhook' | 'api_call'
  description?: string;
  config?:      Record<string, unknown>;
  isActive?:    boolean;
}

export interface UpdateSkillInput {
  name?:        string;
  type?:        string;
  description?: string;
  config?:      Record<string, unknown>;
  isActive?:    boolean;
}

export interface FindSkillsOptions {
  limit?:    number;
  offset?:   number;
  type?:     string;
  isActive?: boolean;
}

// ── AgentSkill DTOs ────────────────────────────────────────────────────

export interface AssignSkillInput {
  agentId:          string;
  skillId:          string;
  configOverride?:  Record<string, unknown>;
}

export interface UpdateAssignmentInput {
  configOverride?: Record<string, unknown>;
}

// ── SkillRepository ──────────────────────────────────────────────────────

export class SkillRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ── SKILL: Write ─────────────────────────────────────────────────────

  async createSkill(input: CreateSkillInput) {
    return this.prisma.skill.create({
      data: {
        name:        input.name,
        type:        input.type,
        description: input.description,
        config:      (input.config ?? {}) as never,
        isActive:    input.isActive ?? true,
      },
    });
  }

  async updateSkill(id: string, data: UpdateSkillInput) {
    return this.prisma.skill.update({
      where: { id },
      data: {
        ...(data.name        !== undefined && { name:        data.name }),
        ...(data.type        !== undefined && { type:        data.type }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.config      !== undefined && { config:      data.config as never }),
        ...(data.isActive    !== undefined && { isActive:    data.isActive }),
      },
    });
  }

  /**
   * Soft-delete del Skill global.
   *
   * IMPORTANTE: no elimina las AgentSkill que apuntan a este skill.
   * Esas asignaciones quedan huérfanas pero son ignoradas en tiempo de
   * ejecución porque findByAgent() filtra por skill.isActive = true y
   * skill.deletedAt = null. La limpieza de AgentSkill huérfanas es
   * responsabilidad de un job de mantenimiento separado.
   */
  async softDeleteSkill(id: string) {
    return this.prisma.skill.update({
      where: { id },
      data:  { deletedAt: new Date() },
    });
  }

  // ── SKILL: Read ──────────────────────────────────────────────────────

  async findSkillById(id: string) {
    return this.prisma.skill.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findSkills(opts: FindSkillsOptions = {}) {
    return this.prisma.skill.findMany({
      where: {
        deletedAt: null,
        ...(opts.type     !== undefined && { type:     opts.type }),
        ...(opts.isActive !== undefined && { isActive: opts.isActive }),
      },
      orderBy: { createdAt: 'asc' },
      take:    opts.limit  ?? 50,
      skip:    opts.offset ?? 0,
    });
  }

  // ── AGENTSKILL: Write ───────────────────────────────────────────────

  /**
   * Asigna un Skill a un Agent.
   *
   * Si la asignación ya existe (mismo agentId+skillId) Prisma lanza P2002.
   * El caller debe capturar ese error si el caso de uso requiere idempotencia
   * en lugar de error (e.g. usar findAssignment() antes de assignSkill()).
   */
  async assignSkill(input: AssignSkillInput) {
    return this.prisma.agentSkill.create({
      data: {
        agentId:        input.agentId,
        skillId:        input.skillId,
        configOverride: (input.configOverride ?? {}) as never,
      },
      include: { skill: true },
    });
  }

  /**
   * Actualiza la config override de una asignación existente.
   */
  async updateAssignment(id: string, data: UpdateAssignmentInput) {
    return this.prisma.agentSkill.update({
      where: { id },
      data: {
        ...(data.configOverride !== undefined && {
          configOverride: data.configOverride as never,
        }),
      },
      include: { skill: true },
    });
  }

  /**
   * Elimina físicamente la asignación.
   *
   * AgentSkill es una tabla de unión sin valor histórico propio.
   * No aplica softDelete — la eliminación física es la operación correcta
   * cuando un skill se desasigna de un agent.
   */
  async removeAssignment(id: string) {
    return this.prisma.agentSkill.delete({ where: { id } });
  }

  /**
   * Elimina físicamente TODAS las asignaciones de un Agent.
   *
   * Útil cuando se elimina el agent (cascada lógica desde AgentRepository).
   * Igual que removeAssignment: DELETE físico, no softDelete.
   */
  async removeAllAssignments(agentId: string) {
    return this.prisma.agentSkill.deleteMany({ where: { agentId } });
  }

  // ── AGENTSKILL: Read ────────────────────────────────────────────────

  /**
   * Retorna todas las asignaciones activas de un Agent con el Skill hidratado.
   *
   * ÉSTE ES EL MÉTODO PRIMARIO QUE USA AgentExecutor para montar los tools
   * del LLM. Filtra automáticamente skills soft-deleted o inactivos.
   *
   * El filtro `skill: { deletedAt: null, isActive: true }` garantiza que:
   *  - Skills eliminados globalmente no aparecen como tools.
   *  - Skills desactivados (isActive=false) no aparecen como tools.
   *  - Las AgentSkill huérfanas (skill soft-deleted) quedan dormidas
   *    sin necesidad de limpieza inmediata.
   *
   * @param agentId  ID del Agent cuyas asignaciones activas se consultan.
   */
  async findByAgent(agentId: string) {
    return this.prisma.agentSkill.findMany({
      where: {
        agentId,
        skill: {
          deletedAt: null,
          isActive:  true,
        },
      },
      include: { skill: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Retorna la asignación de un skill concreto en un agent.
   *
   * Útil para verificar si un skill ya está asignado antes de assignSkill()
   * y evitar el error P2002 por duplicado.
   *
   * @returns  La asignación con el Skill hidratado, o null si no existe.
   */
  async findAssignment(agentId: string, skillId: string) {
    return this.prisma.agentSkill.findFirst({
      where:   { agentId, skillId },
      include: { skill: true },
    });
  }

  async countByAgent(agentId: string) {
    return this.prisma.agentSkill.count({
      where: {
        agentId,
        skill: { deletedAt: null, isActive: true },
      },
    });
  }
}
