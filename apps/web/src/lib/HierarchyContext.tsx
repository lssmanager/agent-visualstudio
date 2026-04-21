import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getCanonicalStudioState } from './api';
import { useStudioState } from './StudioStateContext';
import type { AgencyBuilderTab, CanonicalStudioStateResponse, StudioStateResponse, SurfaceId } from './types';

export type HierarchyLevel = 'agency' | 'department' | 'workspace' | 'agent' | 'subagent';

export interface HierarchyNode {
  key: string;
  id: string;
  level: HierarchyLevel;
  label: string;
  parentKey: string | null;
  childKeys: string[];
  meta?: string;
}

export interface HierarchyScope {
  agencyId: string | null;
  departmentId: string | null;
  workspaceId: string | null;
  agentId: string | null;
  subagentId: string | null;
}

interface HierarchyTree {
  nodes: Record<string, HierarchyNode>;
  rootKey: string | null;
}

interface HierarchyContextValue {
  tree: HierarchyTree;
  canonical: CanonicalStudioStateResponse | null;
  agencies: Array<{ id: string; name: string }>;
  loading: boolean;
  selectedKey: string | null;
  selectedNode: HierarchyNode | null;
  selectedLineage: HierarchyNode[];
  scope: HierarchyScope;
  selectedSurface: SurfaceId;
  selectedBuilderTab: AgencyBuilderTab;
  setSurface: (surface: SurfaceId) => void;
  setBuilderTab: (tab: AgencyBuilderTab) => void;
  expandedKeys: string[];
  isExpanded: (key: string) => boolean;
  toggleExpanded: (key: string) => void;
  selectNode: (key: string) => void;
  selectByEntity: (level: HierarchyLevel, id: string) => void;
  refreshHierarchy: () => Promise<void>;
}

const SELECTED_STORAGE_KEY = 'studio-hierarchy-selected';
const EXPANDED_STORAGE_KEY = 'studio-hierarchy-expanded';
const SELECTED_SURFACE_KEY = 'studio-selected-surface';
const SELECTED_BUILDER_TAB_KEY = 'studio-selected-builder-tab';

const HierarchyContext = createContext<HierarchyContextValue | null>(null);

function nodeKey(level: HierarchyLevel, id: string): string {
  return `${level}:${id}`;
}

function readStorageString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readStorageStringArray(key: string): string[] {
  const value = readStorageString(key);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function orderRank(level: HierarchyLevel): number {
  if (level === 'agency') return 1;
  if (level === 'department') return 2;
  if (level === 'workspace') return 3;
  if (level === 'agent') return 4;
  return 5;
}

function sortChildren(nodes: Record<string, HierarchyNode>) {
  for (const node of Object.values(nodes)) {
    node.childKeys.sort((a, b) => {
      const left = nodes[a];
      const right = nodes[b];
      if (!left || !right) return 0;
      const rankDiff = orderRank(left.level) - orderRank(right.level);
      if (rankDiff !== 0) return rankDiff;
      return left.label.localeCompare(right.label);
    });
  }
}

function buildHierarchyTree(state: StudioStateResponse, canonical: CanonicalStudioStateResponse | null): HierarchyTree {
  if (!canonical?.agency && !state.workspace) {
    return { nodes: {}, rootKey: null };
  }

  const nodes: Record<string, HierarchyNode> = {};

  const agencyId = canonical?.agency.id ?? state.workspace?.id ?? 'agency';
  const agencyLabel = canonical?.agency.name ?? 'Agency';
  const agencyKey = nodeKey('agency', agencyId);
  nodes[agencyKey] = {
    key: agencyKey,
    id: agencyId,
    level: 'agency',
    label: agencyLabel,
    parentKey: null,
    childKeys: [],
    meta: canonical ? `${canonical.departments.length} departments` : 'Local studio state',
  };

  const departments = canonical?.departments.length
    ? canonical.departments.map((department) => ({
        id: department.id,
        name: department.name,
        agencyId: department.agencyId,
      }))
    : [
        {
          id: state.workspace?.id ? `dept-${state.workspace.id}` : 'dept-default',
          name: 'Departments',
          agencyId,
        },
      ];

  for (const department of departments) {
    const key = nodeKey('department', department.id);
    nodes[key] = {
      key,
      id: department.id,
      level: 'department',
      label: department.name,
      parentKey: agencyKey,
      childKeys: [],
    };
    nodes[agencyKey].childKeys.push(key);
  }

  const workspaces = canonical?.workspaces.length
    ? canonical.workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        departmentId: workspace.departmentId,
        model: workspace.defaultModel,
      }))
    : state.workspace
      ? [
          {
            id: state.workspace.id,
            name: state.workspace.name,
            departmentId: departments[0]?.id ?? null,
            model: state.workspace.defaultModel,
          },
        ]
      : [];

  for (const workspace of workspaces) {
    const key = nodeKey('workspace', workspace.id);
    const parentDepartmentKey = workspace.departmentId ? nodeKey('department', workspace.departmentId) : null;
    const parentKey = parentDepartmentKey && nodes[parentDepartmentKey] ? parentDepartmentKey : nodes[agencyKey].childKeys[0] ?? agencyKey;

    nodes[key] = {
      key,
      id: workspace.id,
      level: 'workspace',
      label: workspace.name,
      parentKey,
      childKeys: [],
      meta: workspace.model ?? undefined,
    };

    if (nodes[parentKey]) {
      nodes[parentKey].childKeys.push(key);
    }
  }

  const agents = state.agents ?? [];
  const regularAgents = agents.filter((agent) => agent.kind !== 'subagent' && !agent.parentAgentId);
  const subagents = agents.filter((agent) => agent.kind === 'subagent' || Boolean(agent.parentAgentId));

  const workspaceKeys = Object.values(nodes)
    .filter((node) => node.level === 'workspace')
    .map((node) => node.key);

  const resolveWorkspaceParentKey = (workspaceId?: string): string | null => {
    if (workspaceId) {
      const key = nodeKey('workspace', workspaceId);
      if (nodes[key]) return key;
    }
    return workspaceKeys[0] ?? null;
  };

  for (const agent of regularAgents) {
    const parentKey = resolveWorkspaceParentKey(agent.workspaceId);
    if (!parentKey) continue;

    const key = nodeKey('agent', agent.id);
    nodes[key] = {
      key,
      id: agent.id,
      level: 'agent',
      label: agent.name,
      parentKey,
      childKeys: [],
      meta: agent.model,
    };
    nodes[parentKey].childKeys.push(key);
  }

  for (const subagent of subagents) {
    let parentKey: string | null = null;
    if (subagent.parentAgentId) {
      const directParent = nodeKey('agent', subagent.parentAgentId);
      if (nodes[directParent]) {
        parentKey = directParent;
      }
    }

    if (!parentKey) {
      const sameWorkspaceAgent = regularAgents.find(
        (agent) => agent.workspaceId === subagent.workspaceId && nodes[nodeKey('agent', agent.id)],
      );
      if (sameWorkspaceAgent) {
        parentKey = nodeKey('agent', sameWorkspaceAgent.id);
      }
    }

    if (!parentKey) {
      parentKey = resolveWorkspaceParentKey(subagent.workspaceId);
    }

    if (!parentKey) continue;

    const key = nodeKey('subagent', subagent.id);
    nodes[key] = {
      key,
      id: subagent.id,
      level: 'subagent',
      label: subagent.name,
      parentKey,
      childKeys: [],
      meta: subagent.model,
    };
    if (nodes[parentKey]) {
      nodes[parentKey].childKeys.push(key);
    }
  }

  sortChildren(nodes);

  return { nodes, rootKey: agencyKey };
}

function createDefaultExpandedKeys(tree: HierarchyTree): string[] {
  const expanded: string[] = [];
  if (!tree.rootKey) return expanded;
  expanded.push(tree.rootKey);

  for (const node of Object.values(tree.nodes)) {
    if (node.level === 'department' || node.level === 'workspace') {
      expanded.push(node.key);
    }
  }
  return expanded;
}

function resolveScope(selectedKey: string | null, nodes: Record<string, HierarchyNode>): HierarchyScope {
  const scope: HierarchyScope = {
    agencyId: null,
    departmentId: null,
    workspaceId: null,
    agentId: null,
    subagentId: null,
  };

  let current = selectedKey ? nodes[selectedKey] : null;
  while (current) {
    if (current.level === 'agency') scope.agencyId = current.id;
    if (current.level === 'department') scope.departmentId = current.id;
    if (current.level === 'workspace') scope.workspaceId = current.id;
    if (current.level === 'agent') scope.agentId = current.id;
    if (current.level === 'subagent') scope.subagentId = current.id;
    current = current.parentKey ? nodes[current.parentKey] ?? null : null;
  }
  return scope;
}

function resolveLineage(selectedKey: string | null, nodes: Record<string, HierarchyNode>): HierarchyNode[] {
  const lineage: HierarchyNode[] = [];
  let current = selectedKey ? nodes[selectedKey] : null;
  while (current) {
    lineage.unshift(current);
    current = current.parentKey ? nodes[current.parentKey] ?? null : null;
  }
  return lineage;
}

export function HierarchyProvider({ children }: { children: ReactNode }) {
  const { state } = useStudioState();
  const [canonical, setCanonical] = useState<CanonicalStudioStateResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const [selectedKey, setSelectedKey] = useState<string | null>(() => readStorageString(SELECTED_STORAGE_KEY));
  const [expandedKeys, setExpandedKeys] = useState<string[]>(() => readStorageStringArray(EXPANDED_STORAGE_KEY));
  const [selectedSurface, setSelectedSurface] = useState<SurfaceId>(() => {
    const value = readStorageString(SELECTED_SURFACE_KEY);
    if (
      value === 'agency-builder' ||
      value === 'workspace-studio' ||
      value === 'entity-editor' ||
      value === 'profiles' ||
      value === 'runs' ||
      value === 'sessions' ||
      value === 'settings'
    ) {
      return value;
    }
    return 'agency-builder';
  });
  const [selectedBuilderTab, setSelectedBuilderTab] = useState<AgencyBuilderTab>(() => {
    const value = readStorageString(SELECTED_BUILDER_TAB_KEY);
    if (
      value === 'overview' ||
      value === 'topology' ||
      value === 'structure' ||
      value === 'routing' ||
      value === 'hooks' ||
      value === 'versions' ||
      value === 'operations'
    ) {
      return value;
    }
    return 'overview';
  });

  const tree = useMemo(() => buildHierarchyTree(state, canonical), [state, canonical]);

  const refreshHierarchy = async () => {
    setLoading(true);
    try {
      const next = await getCanonicalStudioState();
      setCanonical(next);
    } catch {
      setCanonical(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshHierarchy();
  }, [state.workspace?.id]);

  useEffect(() => {
    if (expandedKeys.length === 0) {
      setExpandedKeys(createDefaultExpandedKeys(tree));
      return;
    }

    const sanitized = expandedKeys.filter((key) => Boolean(tree.nodes[key]));
    if (sanitized.length !== expandedKeys.length) {
      setExpandedKeys(sanitized);
    }
  }, [expandedKeys, tree]);

  useEffect(() => {
    if (selectedKey) {
      writeStorage(SELECTED_STORAGE_KEY, selectedKey);
    }
  }, [selectedKey]);

  useEffect(() => {
    writeStorage(EXPANDED_STORAGE_KEY, JSON.stringify(expandedKeys));
  }, [expandedKeys]);

  useEffect(() => {
    writeStorage(SELECTED_SURFACE_KEY, selectedSurface);
  }, [selectedSurface]);

  useEffect(() => {
    writeStorage(SELECTED_BUILDER_TAB_KEY, selectedBuilderTab);
  }, [selectedBuilderTab]);

  const selectedNode = selectedKey ? tree.nodes[selectedKey] ?? null : null;
  const selectedLineage = useMemo(() => resolveLineage(selectedKey, tree.nodes), [selectedKey, tree.nodes]);
  const scope = useMemo(() => resolveScope(selectedKey, tree.nodes), [selectedKey, tree.nodes]);
  const agencies = useMemo(() => {
    if (canonical?.agency) {
      return [{ id: canonical.agency.id, name: canonical.agency.name }];
    }
    if (!tree.rootKey) return [];
    const root = tree.nodes[tree.rootKey];
    if (!root) return [];
    return [{ id: root.id, name: root.label }];
  }, [canonical, tree.nodes, tree.rootKey]);

  useEffect(() => {
    if (!tree.rootKey) {
      setSelectedKey(null);
      return;
    }

    const rootNode = tree.nodes[tree.rootKey];
    if (!rootNode) {
      setSelectedKey(null);
      return;
    }

    if (!selectedKey) {
      setSelectedKey(tree.rootKey);
      return;
    }

    if (!tree.nodes[selectedKey]) {
      setSelectedKey(tree.rootKey);
    }
  }, [selectedKey, tree.nodes, tree.rootKey]);

  const value: HierarchyContextValue = {
    tree,
    canonical,
    agencies,
    loading,
    selectedKey,
    selectedNode,
    selectedLineage,
    scope,
    selectedSurface,
    selectedBuilderTab,
    setSurface: (surface: SurfaceId) => setSelectedSurface(surface),
    setBuilderTab: (tab: AgencyBuilderTab) => setSelectedBuilderTab(tab),
    expandedKeys,
    isExpanded: (key: string) => expandedKeys.includes(key),
    toggleExpanded: (key: string) => {
      setExpandedKeys((previous) =>
        previous.includes(key) ? previous.filter((entry) => entry !== key) : [...previous, key],
      );
    },
    selectNode: (key: string) => {
      if (tree.nodes[key]) {
        setSelectedKey(key);
      }
    },
    selectByEntity: (level: HierarchyLevel, id: string) => {
      const key = nodeKey(level, id);
      if (tree.nodes[key]) {
        setSelectedKey(key);
      }
    },
    refreshHierarchy,
  };

  return <HierarchyContext.Provider value={value}>{children}</HierarchyContext.Provider>;
}

export function useHierarchy(): HierarchyContextValue {
  const context = useContext(HierarchyContext);
  if (!context) {
    throw new Error('useHierarchy must be used inside HierarchyProvider');
  }
  return context;
}
