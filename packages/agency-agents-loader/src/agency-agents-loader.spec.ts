import { buildAgency, getAllAgents, findAgentBySlug } from './mapper';
import type { Agency } from './types';

describe('buildAgency()', () => {
  let agency: Agency;

  beforeAll(() => {
    agency = buildAgency();
  });

  it('devuelve departments.length > 0', () => {
    expect(agency.departments.length).toBeGreaterThan(0);
  });

  it('agency.id es "agency-agents"', () => {
    expect(agency.id).toBe('agency-agents');
  });

  it('agency.totalAgents coincide con el conteo real', () => {
    const count = agency.departments.reduce((s, d) => s + d.agentCount, 0);
    expect(agency.totalAgents).toBe(count);
  });

  it('cada AgentTemplate.systemPrompt tiene contenido', () => {
    for (const dept of agency.departments) {
      for (const agent of dept.agents) {
        expect(agent.systemPrompt).toBeDefined();
        expect((agent.systemPrompt as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('AgentTemplate.name es human-readable (no kebab-case puro)', () => {
    for (const dept of agency.departments) {
      for (const agent of dept.agents) {
        // name should not start with all-lowercase followed by a dash
        expect(agent.name).not.toMatch(/^[a-z]+-[a-z]/);
      }
    }
  });

  it('AgentTemplate.description tiene máx 200 caracteres', () => {
    for (const dept of agency.departments) {
      for (const agent of dept.agents) {
        expect(agent.description.length).toBeLessThanOrEqual(200);
      }
    }
  });

  it('AgentTemplate.source es siempre "agency-agents"', () => {
    for (const dept of agency.departments) {
      for (const agent of dept.agents) {
        expect(agent.source).toBe('agency-agents');
      }
    }
  });

  it('DepartmentWorkspace.agentCount coincide con agents.length', () => {
    for (const dept of agency.departments) {
      expect(dept.agentCount).toBe(dept.agents.length);
    }
  });
});

describe('findAgentBySlug()', () => {
  it('encuentra engineering-backend-architect', () => {
    const agent = findAgentBySlug('engineering-backend-architect');
    expect(agent).toBeDefined();
    expect(agent?.name).toBe('Backend Architect');
  });

  it('devuelve undefined para slug inexistente', () => {
    expect(findAgentBySlug('does-not-exist-xyz')).toBeUndefined();
  });
});

describe('getAllAgents()', () => {
  it('devuelve un array plano con todos los agentes', () => {
    const agents = getAllAgents();
    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBeGreaterThan(0);
  });

  it('todos los agentes tienen filePath con vendor/agency-agents', () => {
    for (const agent of getAllAgents()) {
      expect(agent.filePath).toContain('vendor/agency-agents');
    }
  });
});
