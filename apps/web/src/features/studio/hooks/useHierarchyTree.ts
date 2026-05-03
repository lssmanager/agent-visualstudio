/**
 * useHierarchyTree
 *
 * Shape real de CanonicalStudioStateResponse (de lib/types.ts):
 * {
 *   agency:      AgencySpec;           // { id, name, ... }
 *   departments: DepartmentSpec[];      // [{ id, name, agencyId, ... }]
 *   workspaces:  WorkspaceSpec[];       // [{ id, name, departmentId, ... }]
 *   agents:      AgentSpec[];           // [{ id, name, workspaceId, kind, model, ... }]
 * }
 *
 * adaptToTree() reconstruye la jerarquía anidada:
 *   agency → filter depts by agencyId → filter ws by deptId → filter agents by wsId
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCanonicalStudioState } from '../../../lib/api';
import type { CanonicalStudioStateResponse } from '../../../lib/types';

export type HierarchyLevel = 'agency' | 'department' | 'workspace' | 'agent';

export interface HierarchyNode {
  id:       string;
  name:     string;
  level:    HierarchyLevel;
  children: HierarchyNode[];
  meta?:    Record<string, unknown>;
}

export interface UseHierarchyTreeResult {
  tree:     HierarchyNode[];
  expanded: Set<string>;
  activeId: string | null;
  loading:  boolean;
  error:    string | null;
  toggle:   (id: string) => void;
  select:   (id: string, level: HierarchyLevel) => void;
  refresh:  () => void;
}

/**
 * Adapta CanonicalStudioStateResponse (agency singular + arrays planos)
 * al árbol anidado HierarchyNode[].
 */
function adaptToTree(state: CanonicalStudioStateResponse): HierarchyNode[] {
  const raw = state as unknown as {
    agency?:      { id: string; name?: string };
    departments?: { id: string; name?: string; agencyId?: string }[];
    workspaces?:  { id: string; name?: string; departmentId?: string }[];
    agents?:      { id: string; name?: string; workspaceId?: string; kind?: string; model?: string }[];
  };

  const agency      = raw.agency;
  const departments = raw.departments ?? [];
  const workspaces  = raw.workspaces  ?? [];
  const agents      = raw.agents      ?? [];

  if (!agency) return [];

  const agencyNode: HierarchyNode = {
    id:    agency.id,
    name:  agency.name ?? agency.id,
    level: 'agency',
    children: departments
      .filter(d => !d.agencyId || d.agencyId === agency.id)
      .map(dept => ({
        id:    dept.id,
        name:  dept.name ?? dept.id,
        level: 'department' as HierarchyLevel,
        children: workspaces
          .filter(ws => ws.departmentId === dept.id)
          .map(ws => ({
            id:    ws.id,
            name:  ws.name ?? ws.id,
            level: 'workspace' as HierarchyLevel,
            children: agents
              .filter(ag => ag.workspaceId === ws.id)
              .map(ag => ({
                id:       ag.id,
                name:     ag.name ?? ag.id,
                level:    'agent' as HierarchyLevel,
                children: [],
                meta:     { kind: ag.kind, model: ag.model },
              })),
          })),
      })),
  };

  return [agencyNode];
}

export function useHierarchyTree(
  onNavigate?: (id: string, level: HierarchyLevel) => void,
): UseHierarchyTreeResult {
  const [tree,     setTree]     = useState<HierarchyNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await getCanonicalStudioState();
      if (!mounted.current) return;
      const nodes = adaptToTree(state);
      setTree(nodes);
      // Auto-expand el primer nivel (la agency) al cargar
      setExpanded(new Set(nodes.map(n => n.id)));
    } catch (e) {
      if (mounted.current) {
        setError((e instanceof Error ? e.message : String(e)));
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const select = useCallback(
    (id: string, level: HierarchyLevel) => {
      setActiveId(id);
      onNavigate?.(id, level);
    },
    [onNavigate],
  );

  return { tree, expanded, activeId, loading, error, toggle, select, refresh: load };
}
