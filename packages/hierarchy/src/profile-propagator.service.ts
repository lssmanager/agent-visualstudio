/**
 * [F2b-03] profile-propagator.service.ts
 *
 * Función pura que sintetiza el systemPrompt de un nodo orchestrator
 * a partir de las capacidades agregadas de sus hijos directos.
 *
 * Diseño intencional:
 *   - Sin acceso a BD — recibe perfiles ya cargados.
 *   - Reutiliza tokenize() de hierarchy-orchestrator para normalizar texto.
 *   - Produce prompts deterministas (mismos inputs → mismo output).
 *   - propagateUp() (F2b-01) es el caller; solo llama esta función
 *     y persiste el resultado.
 */

import type { HierarchyLevel } from './hierarchy-orchestrator.js'
import { tokenize }             from './hierarchy-orchestrator.js'

// ── Tipos públicos ──────────────────────────────────────────────────────

/**
 * Perfil mínimo de un hijo que el orchestrator gestiona.
 * Mapea 1-a-1 con los campos relevantes de AgentProfile en Prisma.
 * Los campos opcionales pueden ser null/undefined si el perfil
 * no existe o está incompleto.
 */
export interface ChildCapabilitySummary {
  /** Nombre legible del hijo (Workspace name, Agent name…) */
  name:          string
  /** systemPrompt actual del hijo (string libre o null) */
  systemPrompt?: string | null
  /** Campo persona del AgentProfile (string o JSON serializado) */
  persona?:      string | null
  /** Campo knowledgeBase del AgentProfile (string o JSON serializado) */
  knowledgeBase?: string | null
  /** Lista de skill names asociados al hijo */
  skills?:       string[]
}

/**
 * Parámetros de entrada para generateOrchestratorPrompt().
 */
export interface GenerateOrchestratorPromptParams {
  /** Nombre del nodo orchestrator (ej: "Workspace Finanzas") */
  orchestratorName: string
  /**
   * Nivel jerárquico del orchestrator.
   * Controla el lenguaje del prompt generado:
   *   - 'workspace'  → gestiona Agents especializados
   *   - 'department' → gestiona Workspaces
   *   - 'agency'     → gestiona Departments
   */
  level:            HierarchyLevel
  /** Perfiles de los hijos directos del orchestrator */
  childProfiles:    ChildCapabilitySummary[]
  /**
   * Máximo de capacidades únicas a incluir en el prompt.
   * @default 12
   */
  maxCapabilities?: number
}

// ── Labels por nivel ────────────────────────────────────────────────

const CHILD_LABEL: Record<HierarchyLevel, string> = {
  agency:     'department',
  department: 'workspace',
  workspace:  'agent',
  agent:      'subagent',
  subagent:   'subagent',
}

// ── Función principal ───────────────────────────────────────────────

/**
 * [F2b-03] Genera el systemPrompt de un orchestrator basado en las
 * capacidades de sus hijos directos.
 *
 * Algoritmo:
 *   1. Extrae tokens de systemPrompt + persona + knowledgeBase de cada hijo.
 *   2. Rankea tokens por frecuencia de aparición (presentes en más hijos = más relevantes).
 *   3. Complementa con skills explícitos.
 *   4. Construye el prompt con secciones fijas:
 *      - Quién es el orchestrator y qué nivel gestiona
 *      - Lista de hijos con sus capacidades resumidas
 *      - Capacidades agregadas del conjunto
 *      - Instrucción de comportamiento del orchestrator
 *
 * @returns string con el systemPrompt generado — siempre non-empty.
 */
export function generateOrchestratorPrompt(
  params: GenerateOrchestratorPromptParams,
): string {
  const {
    orchestratorName,
    level,
    childProfiles,
    maxCapabilities = 12,
  } = params

  const childLabel = CHILD_LABEL[level] ?? 'child'

  // ── Caso degenerado: sin hijos ───────────────────────────────────────
  if (childProfiles.length === 0) {
    return buildEmptyChildrenPrompt(orchestratorName, level, childLabel)
  }

  // ── 1. Extraer capacidades por hijo ────────────────────────────────
  const childSummaries = childProfiles.map((child) =>
    buildChildSummary(child, childLabel),
  )

  // ── 2. Agregar capacidades del conjunto ─────────────────────────
  const aggregatedCapabilities = aggregateCapabilities(
    childProfiles,
    maxCapabilities,
  )

  // ── 3. Construir prompt final ─────────────────────────────────
  return buildPrompt({
    orchestratorName,
    level,
    childLabel,
    childSummaries,
    aggregatedCapabilities,
    totalChildren: childProfiles.length,
  })
}

// ── Funciones auxiliares (package-private — exportadas solo para tests) ─

/**
 * Extrae el resumen de capacidades de un hijo individual.
 * Toma hasta 5 tokens más representativos de sus campos de texto.
 * Si tiene skills, los antepone a los tokens de texto.
 */
export function buildChildSummary(
  child:      ChildCapabilitySummary,
  childLabel: string,
): string {
  const skillsPart = child.skills && child.skills.length > 0
    ? child.skills.slice(0, 4).join(', ')
    : null

  const textFields = [
    child.systemPrompt,
    child.persona,
    child.knowledgeBase,
  ]
    .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)

  const tokens = textFields
    .flatMap((text) => [...tokenize(text)])
    .slice(0, 5)
    .join(', ')

  const capabilities = [skillsPart, tokens.length > 0 ? tokens : null]
    .filter(Boolean)
    .join('; ')

  return capabilities.length > 0
    ? `- ${child.name} (${childLabel}): ${capabilities}`
    : `- ${child.name} (${childLabel})`
}

/**
 * Agrega capacidades únicas del conjunto de hijos rankeadas por frecuencia.
 * Un token que aparece en más hijos es más representativo del conjunto.
 *
 * Peso de skills explícitos: +2 por hijo que lo tenga.
 * Peso de tokens de texto: +1 por hijo que los contenga.
 *
 * Retorna array de hasta maxCapabilities strings, ordenado de más a menos frecuente.
 */
export function aggregateCapabilities(
  childProfiles:  ChildCapabilitySummary[],
  maxCapabilities: number,
): string[] {
  const frequency = new Map<string, number>()

  // Contar skills explícitos primero (peso doble: +2 por hijo)
  for (const child of childProfiles) {
    for (const skill of child.skills ?? []) {
      const normalized = skill.toLowerCase().trim()
      if (normalized.length < 2) continue
      frequency.set(normalized, (frequency.get(normalized) ?? 0) + 2)
    }
  }

  // Contar tokens de texto (+1 por hijo que los contenga)
  for (const child of childProfiles) {
    const textFields = [child.systemPrompt, child.persona, child.knowledgeBase]
      .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)

    const childTokens = new Set(
      textFields.flatMap((text) => [...tokenize(text)]),
    )

    for (const token of childTokens) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1)
    }
  }

  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCapabilities)
    .map(([term]) => term)
}

// ── Builders internos ──────────────────────────────────────────────

interface PromptBuildParams {
  orchestratorName:       string
  level:                  HierarchyLevel
  childLabel:             string
  childSummaries:         string[]
  aggregatedCapabilities: string[]
  totalChildren:          number
}

function buildPrompt(p: PromptBuildParams): string {
  const capLine = p.aggregatedCapabilities.length > 0
    ? p.aggregatedCapabilities.join(', ')
    : 'general purpose'

  const sections: string[] = [
    `You are ${p.orchestratorName}, an orchestrator at the ${p.level} level.`,
    `You coordinate ${p.totalChildren} specialized ${p.childLabel}(s) to complete complex tasks.`,
    '',
    `## ${p.childLabel.charAt(0).toUpperCase() + p.childLabel.slice(1)}s under your coordination`,
    ...p.childSummaries,
    '',
    `## Aggregated capabilities`,
    `You can delegate tasks involving: ${capLine}.`,
    '',
    `## Your behavior`,
    `When you receive a task:`,
    `1. Decompose it into subtasks aligned with your ${p.childLabel}s' specialties.`,
    `2. Assign each subtask to the most capable ${p.childLabel}.`,
    `3. Consolidate results into a single coherent response.`,
    `4. Never execute tasks directly — always delegate to a ${p.childLabel}.`,
  ]

  return sections.join('\n')
}

/**
 * Prompt de fallback cuando el orchestrator no tiene hijos asignados.
 * Bug fix aplicado: usa `level` (parámetro directo) en lugar de `p.level`
 * que causaba ReferenceError en la versión original del issue.
 */
function buildEmptyChildrenPrompt(
  orchestratorName: string,
  level:            HierarchyLevel,
  childLabel:       string,
): string {
  return [
    `You are ${orchestratorName}, an orchestrator at the ${level} level.`,
    `No ${childLabel}s are currently assigned to you.`,
    `When ${childLabel}s become available, you will coordinate and delegate tasks to them.`,
    `Until then, respond that the team is being assembled.`,
  ].join('\n')
}
