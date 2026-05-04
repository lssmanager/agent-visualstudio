import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { buildAgency, getAllAgents, findAgentBySlug } from '@agent-visualstudio/agency-agents-loader';
import type { Agency, DepartmentWorkspace, AgentTemplate } from '@agent-visualstudio/agency-agents-loader';

/**
 * AgencyTemplatesService
 *
 * Carga el objeto Agency UNA SOLA VEZ al iniciar el módulo (onModuleInit).
 * buildAgency() lee el filesystem de vendor/agency-agents/ una única vez;
 * todas las queries posteriores se sirven desde this.agency en memoria.
 *
 * Implementa OnModuleInit para compatibilidad con NestJS lifecycle.
 * También funciona como servicio plain (Express) al instanciar con new.
 *
 * Issue: F6b-FX01
 */
@Injectable()
export class AgencyTemplatesService implements OnModuleInit {
  private readonly logger = new Logger(AgencyTemplatesService.name);
  private agency!: Agency;

  /**
   * NestJS lifecycle hook — se llama automáticamente al arrancar el módulo.
   * Carga buildAgency() en memoria para que los requests sean instantáneos.
   */
  onModuleInit(): void {
    this.loadAgency();
  }

  /**
   * Constructor también llama loadAgency() para compatibilidad con
   * instanciación directa (sin DI de NestJS) en el controller Express.
   */
  constructor() {
    this.loadAgency();
  }

  private loadAgency(): void {
    try {
      this.agency = buildAgency();
      this.logger.log(
        `Loaded ${this.agency.totalAgents} agents` +
          ` across ${this.agency.departments.length} departments`,
      );
    } catch (err) {
      this.logger.error(
        '[agency-templates] Failed to load agency-agents vendor. ' +
          'Run: git submodule update --init --recursive',
        (err as Error).message,
      );
      // Graceful degradation: API arranca pero retorna catálogo vacío
      this.agency = {
        id: 'agency-agents',
        name: 'Agency Agents Library',
        source: 'vendor/agency-agents',
        departments: [],
        totalAgents: 0,
      };
    }
  }

  /** GET /api/agency-templates — objeto Agency completo */
  getAgency(): Agency {
    return this.agency;
  }

  /** GET /api/agency-templates/departments — lista de departments */
  getDepartments(): DepartmentWorkspace[] {
    return this.agency.departments;
  }

  /**
   * GET /api/agency-templates/departments/:departmentId/agents
   * Retorna null si el department no existe (→ 404 en el controller).
   */
  getAgentsByDepartment(departmentId: string): AgentTemplate[] | null {
    const dept = this.agency.departments.find((d) => d.id === departmentId);
    return dept ? dept.agents : null;
  }

  /**
   * GET /api/agency-templates/agents/:agentId
   * Busca sobre la caché en memoria con findAgentBySlug del loader.
   * Retorna null si el agente no existe (→ 404 en el controller).
   */
  getAgentById(agentId: string): AgentTemplate | null {
    const agent = findAgentBySlug(agentId);
    return agent ?? null;
  }

  /**
   * Búsqueda de texto libre sobre nombre, descripción y systemPrompt.
   * Útil para el panel de búsqueda de la Agent Library UI.
   */
  searchAgents(query: string): AgentTemplate[] {
    if (!query.trim()) return getAllAgents();
    const q = query.toLowerCase();
    return getAllAgents().filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.department.toLowerCase().includes(q),
    );
  }
}
