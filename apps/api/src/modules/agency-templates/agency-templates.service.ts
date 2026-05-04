import { buildAgency } from '../../../../../packages/agency-agents-loader/src';
import type { Agency, DepartmentWorkspace, AgentTemplate } from '../../../../../packages/agency-agents-loader/src';

/**
 * AgencyTemplatesService
 *
 * Carga el objeto Agency UNA SOLA VEZ al instanciar el servicio.
 * buildAgency() lee el filesystem una única vez; todas las queries
 * posteriores se sirven desde this.agency en memoria.
 */
export class AgencyTemplatesService {
  private readonly agency: Agency;

  constructor() {
    this.agency = buildAgency();
    console.log(
      `[agency-templates] Loaded ${this.agency.meta.totalAgents} agents` +
      ` across ${this.agency.meta.totalDepartments} departments`,
    );
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
   * Busca sobre la caché en memoria — NO relanza buildAgency().
   * Retorna null si el agente no existe (→ 404 en el controller).
   */
  getAgentById(agentId: string): AgentTemplate | null {
    for (const dept of this.agency.departments) {
      const agent = dept.agents.find((a) => a.slug === agentId);
      if (agent) return agent;
    }
    return null;
  }
}
