// packages/agency-agents-loader/src/mapper.ts
// Re-exporta la API pública de loader.ts con los nombres correctos.
// mapper.ts existía con imports a funciones que no existen en loader.ts
// (listDepartments, loadDepartment, readAgentFile, parseAgentMarkdown).
// La API real de loader.ts es: buildAgency, getAllAgents, findAgentBySlug, invalidateCache.

export {
  buildAgency,
  getAllAgents,
  findAgentBySlug,
  invalidateCache,
} from './loader'

export type { Agency, AgentTemplate, DepartmentWorkspace } from './types'
