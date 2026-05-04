import { useState, useCallback } from 'react';

export interface AgentTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  department: string;
  emoji: string;
  color: string;
  vibe?: string;
  tags: string[];
  systemPrompt?: string;
}

export interface DepartmentWorkspace {
  id: string;
  name: string;
  color: string;
  agents: AgentTemplate[];
}

export interface Agency {
  departments: DepartmentWorkspace[];
  meta: {
    totalDepartments: number;
    totalAgents: number;
    source: string;
    generatedAt: string;
  };
}

// Usa el mismo patrón que lib/api.ts del proyecto (fetch relativo)
const API_BASE = '/api';

export function useAgencyTemplates() {
  const [agency, setAgency] = useState<Agency | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Carga el Agency completo. Si ya está cargado, no refetch.
   * Llamar al abrir el panel por primera vez.
   */
  const loadAgency = useCallback(async () => {
    if (agency) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/agency-templates`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Agency = await res.json();
      setAgency(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [agency]);

  /**
   * Carga el systemPrompt completo de un agente específico.
   * Retorna el AgentTemplate enriquecido con systemPrompt.
   */
  const loadAgentDetail = useCallback(async (agentSlug: string): Promise<AgentTemplate | null> => {
    try {
      const res = await fetch(`${API_BASE}/agency-templates/agents/${agentSlug}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, []);

  return { agency, loading, error, loadAgency, loadAgentDetail };
}
