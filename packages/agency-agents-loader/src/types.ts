/**
 * Tipos canónicos para el módulo agency-agents-loader.
 *
 * Mapean la estructura flat del submodule vendor/agency-agents/
 * a la jerarquía Agency → DepartmentWorkspace → AgentTemplate
 * que consume el AgentBuilder (F4b) y la UI Agent Library (F6).
 */

/**
 * Un agente individual proveniente de un archivo .md del vendor.
 *
 * Ejemplo:
 *   id:              "engineering-backend-architect"
 *   slug:            "backend-architect"
 *   name:            "Backend Architect"
 *   department:      "engineering"
 *   departmentLabel: "Engineering"
 *   systemPrompt:    "<contenido completo del .md>"
 *   description:     "<primer párrafo extraído automáticamente>"
 *   tools:           ["code_review", "api_design"]
 *   tags:            ["backend", "architecture"]
 *   source:          "agency-agents"
 *   filePath:        "vendor/agency-agents/engineering/backend-architect.md"
 */
export interface AgentTemplate {
  /** Identificador único compuesto: "<department>-<slug>" */
  id: string;

  /** Slug del agente dentro del departamento, e.g. "backend-architect" */
  slug: string;

  /** Nombre legible derivado del slug, e.g. "Backend Architect" */
  name: string;

  /** Clave del departamento en minúsculas, e.g. "engineering" */
  department: string;

  /** Etiqueta legible del departamento, e.g. "Engineering" */
  departmentLabel: string;

  /** Contenido completo del archivo .md usado como systemPrompt del Agent en BD */
  systemPrompt: string;

  /** Primer párrafo no-vacío del .md, extraído para preview en UI */
  description: string;

  /** Herramientas/skills sugeridas declaradas en frontmatter o inferidas del contenido */
  tools: string[];

  /** Etiquetas semánticas para búsqueda y filtrado */
  tags: string[];

  /** Origen del template — siempre 'agency-agents' para este paquete */
  source: 'agency-agents';

  /** Ruta relativa al archivo .md desde la raíz del monorepo */
  filePath: string;
}

/**
 * Agrupación de AgentTemplates bajo un departamento.
 * Equivale a un Department (y a su Workspace asociado) en el schema Prisma.
 */
export interface DepartmentWorkspace {
  /** Clave del departamento en minúsculas, e.g. "engineering" */
  id: string;

  /** Etiqueta legible para la UI, e.g. "Engineering" */
  label: string;

  /** Lista de agentes disponibles en este departamento */
  agents: AgentTemplate[];

  /** Total de agentes — desnormalizado para evitar .length en el render */
  agentCount: number;
}

/**
 * Catálogo completo de templates proveniente del vendor agency-agents.
 * Equivale al nivel Agency en la jerarquía del sistema.
 */
export interface Agency {
  /** Identificador canónico, e.g. "agency-agents" */
  id: string;

  /** Nombre del catálogo para la UI, e.g. "Agency Agents Library" */
  name: string;

  /** URL o path del vendor de origen */
  source: string;

  /** Departamentos con sus agentes */
  departments: DepartmentWorkspace[];

  /** Total de agentes sumando todos los departamentos */
  totalAgents: number;
}
