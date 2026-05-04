/**
 * Mapa de claves de departamento → etiqueta legible.
 *
 * Sincronizado con la estructura de carpetas de vendor/agency-agents/.
 * Al agregar un nuevo departamento al vendor, añadir la entrada aquí.
 */
export const DEPARTMENT_LABELS: Record<string, string> = {
  engineering: 'Engineering',
  design: 'Design',
  product: 'Product',
  marketing: 'Marketing',
  sales: 'Sales',
  finance: 'Finance',
  testing: 'Testing',
  strategy: 'Strategy',
  support: 'Support',
  'project-management': 'Project Management',
  integrations: 'Integrations',
  'game-development': 'Game Development',
  specialized: 'Specialized',
} as const;

/** Identificador canónico del catálogo agency-agents */
export const AGENCY_AGENTS_SOURCE_ID = 'agency-agents' as const;

/** Nombre visible del catálogo en la UI */
export const AGENCY_AGENTS_CATALOG_NAME = 'Agency Agents Library' as const;

/** Ruta raíz del submodule relativa a la raíz del monorepo */
export const AGENCY_AGENTS_VENDOR_PATH = 'vendor/agency-agents' as const;
