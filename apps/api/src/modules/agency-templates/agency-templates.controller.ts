import { Router } from 'express';
import { AgencyTemplatesService } from './agency-templates.service';

export function registerAgencyTemplatesRoutes(router: Router) {
  // Instancia única — se crea al cargar el módulo, garantizando que
  // buildAgency() corra al arrancar el servidor, no en el primer request.
  const service = new AgencyTemplatesService();

  /**
   * GET /api/agency-templates
   * Retorna el objeto Agency completo con todos los departments y agents.
   *
   * Response 200: Agency
   */
  router.get('/agency-templates', (_req, res) => {
    res.json(service.getAgency());
  });

  /**
   * GET /api/agency-templates/departments
   * Lista de todos los DepartmentWorkspace disponibles.
   *
   * Response 200: DepartmentWorkspace[]
   */
  router.get('/agency-templates/departments', (_req, res) => {
    res.json(service.getDepartments());
  });

  /**
   * GET /api/agency-templates/departments/:departmentId/agents
   * Agents de un department específico.
   *
   * Response 200: AgentTemplate[]
   * Response 404: { ok: false, error: "Department not found: xxx" }
   */
  router.get('/agency-templates/departments/:departmentId/agents', (req, res) => {
    const { departmentId } = req.params;
    const agents = service.getAgentsByDepartment(departmentId);

    if (agents === null) {
      return res.status(404).json({
        ok: false,
        error: `Department not found: ${departmentId}`,
      });
    }

    return res.json(agents);
  });

  /**
   * GET /api/agency-templates/agents/:agentId
   * Un AgentTemplate por su slug.
   *
   * Response 200: AgentTemplate
   * Response 404: { ok: false, error: "Agent not found: xxx" }
   */
  router.get('/agency-templates/agents/:agentId', (req, res) => {
    const { agentId } = req.params;
    const agent = service.getAgentById(agentId);

    if (!agent) {
      return res.status(404).json({
        ok: false,
        error: `Agent not found: ${agentId}`,
      });
    }

    return res.json(agent);
  });
}
