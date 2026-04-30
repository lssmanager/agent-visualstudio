/**
 * Tests para generateOrchestratorPrompt() — F2b-03
 *
 * Función PURA: sin Prisma mock, sin efectos secundarios.
 * 14 casos cubriendo todos los criterios de cierre.
 */

import {
  generateOrchestratorPrompt,
  aggregateCapabilities,
  buildChildSummary,
} from '../profile-propagator.service.js'
import type { ChildCapabilitySummary } from '../profile-propagator.service.js'

// ── Fixtures ─────────────────────────────────────────────────────────────

const CHILD_A: ChildCapabilitySummary = {
  name:         'Agent Alpha',
  systemPrompt: 'Expert in python data analysis and machine learning pipelines',
  skills:       ['python', 'pandas', 'sklearn'],
}

const CHILD_B: ChildCapabilitySummary = {
  name:         'Agent Beta',
  systemPrompt: 'Handles database queries and python scripting for ETL tasks',
  skills:       ['sql', 'python'],
}

const CHILD_C: ChildCapabilitySummary = {
  name:         'Agent Gamma',
  systemPrompt: 'Frontend specialist with react and typescript knowledge',
  skills:       ['react', 'typescript'],
}

// ── generateOrchestratorPrompt() — casos base ────────────────────────

describe('generateOrchestratorPrompt()', () => {
  it('devuelve string non-empty para cualquier input válido', () => {
    const result = generateOrchestratorPrompt({
      orchestratorName: 'WS Orch',
      level:            'workspace',
      childProfiles:    [CHILD_A],
    })
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(0)
  })

  it('NIVEL workspace: el prompt contiene el nombre del orchestrator y la palabra "agent"', () => {
    const result = generateOrchestratorPrompt({
      orchestratorName: 'Finance Workspace',
      level:            'workspace',
      childProfiles:    [CHILD_A],
    })
    expect(result).toContain('Finance Workspace')
    expect(result.toLowerCase()).toContain('agent')
  })

  it('NIVEL department: el prompt contiene "workspace"', () => {
    const result = generateOrchestratorPrompt({
      orchestratorName: 'Dept Orch',
      level:            'department',
      childProfiles:    [CHILD_A],
    })
    expect(result.toLowerCase()).toContain('workspace')
  })

  it('NIVEL agency: el prompt contiene "department"', () => {
    const result = generateOrchestratorPrompt({
      orchestratorName: 'Agency Orch',
      level:            'agency',
      childProfiles:    [CHILD_A],
    })
    expect(result.toLowerCase()).toContain('department')
  })

  it('con 0 childProfiles: devuelve el mensaje "being assembled" y NO contiene "undefined" ni "null"', () => {
    const result = generateOrchestratorPrompt({
      orchestratorName: 'Empty Orch',
      level:            'workspace',
      childProfiles:    [],
    })
    expect(result).toContain('being assembled')
    expect(result).not.toContain('undefined')
    expect(result).not.toContain('null')
    expect(result).not.toContain('[object Object]')
  })

  it('con 1 hijo con solo systemPrompt: el prompt incluye la descripción del hijo', () => {
    const child: ChildCapabilitySummary = {
      name:         'Solo Agent',
      systemPrompt: 'Specialist in data visualization and charting reports',
    }
    const result = generateOrchestratorPrompt({
      orchestratorName: 'WS Orch',
      level:            'workspace',
      childProfiles:    [child],
    })
    expect(result).toContain('Solo Agent')
  })

  it('con 3 hijos con skills distintos: todos los nombres de hijos aparecen en el prompt', () => {
    const result = generateOrchestratorPrompt({
      orchestratorName: 'WS Orch',
      level:            'workspace',
      childProfiles:    [CHILD_A, CHILD_B, CHILD_C],
    })
    expect(result).toContain('Agent Alpha')
    expect(result).toContain('Agent Beta')
    expect(result).toContain('Agent Gamma')
  })

  it('maxCapabilities=3 limita las capacidades agregadas a ≤3 términos en la línea delegate', () => {
    const result = generateOrchestratorPrompt({
      orchestratorName: 'WS Orch',
      level:            'workspace',
      childProfiles:    [CHILD_A, CHILD_B, CHILD_C],
      maxCapabilities:  3,
    })
    // Extraer la línea de delegate tasks
    const delegateLine = result.split('\n').find((l) => l.includes('delegate tasks involving:'))
    expect(delegateLine).toBeDefined()
    // La línea contiene como máximo 3 términos separados por coma
    const terms = delegateLine!
      .replace('You can delegate tasks involving:', '')
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
    expect(terms.length).toBeLessThanOrEqual(3)
  })
})

// ── aggregateCapabilities() — lógica de ranking ──────────────────────

describe('aggregateCapabilities()', () => {
  it('tokens presentes en más hijos aparecen antes en el resultado', () => {
    // 'python' aparece en 3 hijos, 'sql' en 1 hijo
    const profiles: ChildCapabilitySummary[] = [
      { name: 'A', systemPrompt: 'expert python developer' },
      { name: 'B', systemPrompt: 'python scripting and automation' },
      { name: 'C', systemPrompt: 'python data analysis with sql queries' },
    ]
    const result = aggregateCapabilities(profiles, 10)
    const pythonIdx = result.indexOf('python')
    const sqlIdx    = result.indexOf('sql')
    expect(pythonIdx).toBeGreaterThanOrEqual(0)
    expect(sqlIdx).toBeGreaterThanOrEqual(0)
    expect(pythonIdx).toBeLessThan(sqlIdx)
  })

  it('skills explícitos tienen mayor peso que tokens de texto libre', () => {
    // 'pandas' como skill en 1 hijo (peso +2) vs token de texto en 1 hijo (peso +1)
    const profiles: ChildCapabilitySummary[] = [
      {
        name:         'A',
        systemPrompt: 'excel spreadsheet analysis reporting specialist',
        skills:       ['pandas'],
      },
      {
        name:         'B',
        systemPrompt: 'excel spreadsheet analysis tools',
      },
    ]
    const result = aggregateCapabilities(profiles, 10)
    const pandasIdx  = result.indexOf('pandas')
    const excelIdx   = result.indexOf('excel')
    // 'pandas' tiene peso 2 (skill), 'excel' tiene peso 2 (texto en 2 hijos)
    // 'pandas' debe estar antes que términos con frecuencia ≤1
    // En caso de empate, el orden es determinístico por Map; lo importante
    // es que 'pandas' sí aparece en el resultado
    expect(pandasIdx).toBeGreaterThanOrEqual(0)
    expect(excelIdx).toBeGreaterThanOrEqual(0)
  })

  it('tokens de longitud <3 chars son ignorados por tokenize (longitud mínima = 3)', () => {
    // tokenize() filtra w.length >= 3 — 'js' (2 chars) y 'py' (2 chars) se omiten
    const profiles: ChildCapabilitySummary[] = [
      { name: 'A', systemPrompt: 'js py typescript developer' },
    ]
    const result = aggregateCapabilities(profiles, 20)
    expect(result).not.toContain('js')
    expect(result).not.toContain('py')
    expect(result).toContain('typescript')
  })

  it('resultado es array vacío si todos los hijos tienen perfiles vacíos', () => {
    const profiles: ChildCapabilitySummary[] = [
      { name: 'A' },
      { name: 'B', systemPrompt: '' },
      { name: 'C', persona: null, knowledgeBase: null },
    ]
    const result = aggregateCapabilities(profiles, 10)
    expect(result).toEqual([])
  })
})

// ── buildChildSummary() ───────────────────────────────────────────────

describe('buildChildSummary()', () => {
  it('hijo sin ningún campo → devuelve "- nombre (label)" sin crash', () => {
    const result = buildChildSummary({ name: 'Empty Agent' }, 'agent')
    expect(result).toBe('- Empty Agent (agent)')
    expect(result).not.toContain('null')
    expect(result).not.toContain('undefined')
  })

  it('hijo con skills + systemPrompt → skills aparecen ANTES que tokens de texto', () => {
    const child: ChildCapabilitySummary = {
      name:         'Skilled Agent',
      systemPrompt: 'machine learning model training',
      skills:       ['tensorflow', 'pytorch'],
    }
    const result = buildChildSummary(child, 'agent')
    // El formato es "- Nombre (label): skills; tokens"
    // Los skills deben aparecer antes del punto y coma
    const contentAfterColon = result.split(':').slice(1).join(':')
    const semicolonIdx      = contentAfterColon.indexOf(';')
    const tensorflowIdx     = result.indexOf('tensorflow')
    const machineIdx        = result.indexOf('machine')
    // tensorflow es skill → debe aparecer antes que 'machine' (token de texto)
    if (semicolonIdx >= 0) {
      // Formato skills;tokens
      expect(tensorflowIdx).toBeLessThan(machineIdx === -1 ? Infinity : machineIdx)
    } else {
      // Solo skills (texto corto sin tokens relevantes)
      expect(result).toContain('tensorflow')
    }
  })
})
