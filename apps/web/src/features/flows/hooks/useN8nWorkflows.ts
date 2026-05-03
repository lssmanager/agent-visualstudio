/**
 * useN8nWorkflows
 * Carga la lista de workflows n8n disponibles para el selector del panel.
 * Hace fetch a GET /api/studio/v1/n8n/workflows una sola vez por mount.
 * Expone: workflows, loading, error, refetch.
 */
import { useCallback, useEffect, useState } from 'react';
import { listN8nWorkflows, type N8nWorkflowSummary } from '../../../lib/api';

export interface UseN8nWorkflowsResult {
  workflows: N8nWorkflowSummary[];
  loading:   boolean;
  error:     string | null;
  refetch:   () => void;
}

export function useN8nWorkflows(): UseN8nWorkflowsResult {
  const [workflows, setWorkflows] = useState<N8nWorkflowSummary[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listN8nWorkflows();
      setWorkflows(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { workflows, loading, error, refetch: load };
}
