import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderTree, MinusSquare, Plus, PlusSquare, SquarePen } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { type HierarchyLevel, type HierarchyNode, useHierarchy } from '../lib/HierarchyContext';
import { saveAgent, updateWorkspace } from '../lib/api';
import type { AgencyBuilderTab, AgentSpec, WorkspaceSpec } from '../lib/types';
import { buildStudioHref, parseBuilderTab } from '../lib/studioRouting';

const LEVEL_LABEL: Record<HierarchyLevel, string> = {
  agency: 'Agency',
  department: 'Department',
  workspace: 'Workspace',
  agent: 'Agent',
  subagent: 'Subagent',
};

const LEVEL_COLOR: Record<HierarchyLevel, string> = {
  agency: '#2563eb',
  department: '#0d9488',
  workspace: '#4f46e5',
  agent: '#16a34a',
  subagent: '#9333ea',
};

function routeForNode(node: HierarchyNode, selectedBuilderTab: AgencyBuilderTab): string {
  return buildStudioHref({ surface: 'agency-builder', tab: selectedBuilderTab ?? 'overview', nodeKey: node.key });
}

function resolveWorkspaceIdForNode(nodeKey: string, nodes: Record<string, HierarchyNode>): string | null {
  let current: HierarchyNode | undefined = nodes[nodeKey];
  while (current) {
    if (current.level === 'workspace') {
      return current.id;
    }
    current = current.parentKey ? nodes[current.parentKey] : undefined;
  }
  return null;
}

function createAgentRouteForNode(nodeKey: string, nodes: Record<string, HierarchyNode>): string | null {
  const node = nodes[nodeKey];
  if (!node) return null;
  const workspaceId = resolveWorkspaceIdForNode(nodeKey, nodes);

  if (node.level === 'agency') {
    return `/agents-builder?mode=create&type=department&parentAgencyId=${encodeURIComponent(node.id)}`;
  }
  if (node.level === 'department') {
    return `/agents-builder?mode=create&type=workspace&parentDepartmentId=${encodeURIComponent(node.id)}`;
  }
  if (node.level === 'workspace') {
    return workspaceId
      ? `/agents-builder?mode=create&type=agent&parentWorkspaceId=${encodeURIComponent(workspaceId)}`
      : '/agents-builder?mode=create&type=agent';
  }
  if (node.level === 'agent') {
    return workspaceId
      ? `/agents-builder?mode=create&type=subagent&parentWorkspaceId=${encodeURIComponent(workspaceId)}&parentAgentId=${encodeURIComponent(node.id)}`
      : '/agents-builder?mode=create&type=subagent';
  }
  return null;
}

export function ContextPanel({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    tree,
    agencies,
    selectedKey,
    selectedNode,
    selectedLineage,
    isExpanded,
    toggleExpanded,
    expandAll,
    collapseAll,
    selectNode,
    loading,
  } = useHierarchy();
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const activeAdministrationTab = parseBuilderTab(location.search) ?? 'overview';

  const matches = useMemo(() => {
    const cache = new Map<string, boolean>();
    Object.keys(tree.nodes).forEach((key) => cache.set(key, true));
    return cache;
  }, [tree.nodes]);

  function go(path: string) {
    navigate(path);
    onNavigate?.();
  }

  const selectedHierarchyCreateHref = selectedNode ? createAgentRouteForNode(selectedNode.key, tree.nodes) : null;
  const selectedAgencyId = selectedLineage.find((node) => node.level === 'agency')?.id ?? agencies[0]?.id ?? '';

  async function handleRenameNode(node: HierarchyNode, nextLabel: string) {
    const label = nextLabel.trim();
    if (!label || label === node.label) return;

    if (node.level === 'workspace') {
      const workspaceLike: Partial<WorkspaceSpec> = { id: node.id, name: label };
      await updateWorkspace(workspaceLike);
      setLabelOverrides((prev) => ({ ...prev, [node.key]: label }));
      return;
    }

    if (node.level === 'agent' || node.level === 'subagent') {
      const agentLike: Partial<AgentSpec> = {
        id: node.id,
        workspaceId: resolveWorkspaceIdForNode(node.key, tree.nodes) ?? '',
        name: label,
      };
      await saveAgent(agentLike as AgentSpec);
      setLabelOverrides((prev) => ({ ...prev, [node.key]: label }));
      return;
    }

    // Agency/Department rename is still managed by canonical backend modules.
    setLabelOverrides((prev) => ({ ...prev, [node.key]: label }));
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--shell-panel-bg)',
        borderRight: '1px solid var(--shell-panel-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backdropFilter: 'blur(14px)',
      }}
    >
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--shell-panel-border)' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
            marginBottom: 8,
          }}
        >
          Primary Index
        </div>

        <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: '1px solid var(--shell-chip-border)',
              background: 'var(--shell-chip-bg)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--text-muted)',
              flexShrink: 0,
            }}
          >
            <FolderTree size={16} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 21,
                lineHeight: 1.05,
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              Hierarchy
            </h2>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--shell-chip-border)', borderRadius: 'var(--radius-md)', background: 'var(--shell-chip-bg)', padding: 3 }}>
            <button
              type="button"
              onClick={expandAll}
              title="Expand all"
              aria-label="Expand all hierarchy nodes"
              style={iconButtonStyle()}
            >
              <PlusSquare size={13} />
            </button>
            <button
              type="button"
              onClick={collapseAll}
              title="Collapse all"
              aria-label="Collapse all hierarchy nodes"
              style={iconButtonStyle()}
            >
              <MinusSquare size={13} />
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => go('/agents-builder?mode=create&type=agency')}
              style={{
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--shell-chip-border)',
                background: 'var(--shell-chip-bg)',
                color: 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 700,
                padding: '7px 10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              aria-label="Create Agency"
              title="Create Agency"
            >
              <Plus size={13} />
              Create Agency
            </button>
            <button
              type="button"
              onClick={() => {
                if (!selectedHierarchyCreateHref) return;
                go(selectedHierarchyCreateHref);
              }}
              disabled={!selectedHierarchyCreateHref}
              style={{
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--shell-chip-border)',
                background: selectedHierarchyCreateHref ? 'var(--shell-chip-bg)' : 'transparent',
                color: selectedHierarchyCreateHref ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 12,
                fontWeight: 700,
                padding: '7px 10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: selectedHierarchyCreateHref ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
              }}
              aria-label="Create from selected level"
              title="Create from selected level"
            >
              <Plus size={13} />
              Create from selection
            </button>
          </div>
          <select
            value={selectedAgencyId}
            onChange={(event) => {
              const nextAgency = agencies.find((agency) => agency.id === event.target.value);
              if (!nextAgency) return;
              const key = `agency:${nextAgency.id}`;
              selectNode(key);
              go(buildStudioHref({ surface: 'agency-builder', tab: activeAdministrationTab, nodeKey: key }));
            }}
            style={{
              width: '100%',
              padding: '9px 11px',
              fontSize: 12,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--shell-chip-border)',
              background: 'var(--shell-chip-bg)',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          >
            {agencies.length === 0 ? (
              <option value="">No agency selected</option>
            ) : (
              agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {loading && Object.keys(tree.nodes).length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12 }}>Loading hierarchy...</div>
        ) : tree.rootKey ? (
          <div role="tree" aria-label="Agency hierarchy">
            <HierarchyBranch
              nodeKey={tree.rootKey}
              depth={0}
              nodes={tree.nodes}
              labelOverrides={labelOverrides}
              selectedKey={selectedKey}
              isExpanded={isExpanded}
              toggleExpanded={toggleExpanded}
              selectNode={selectNode}
              matches={matches}
              onOpen={(key) => {
                const node = tree.nodes[key];
                if (!node) return;
                go(routeForNode(node, activeAdministrationTab));
              }}
              onOpenProfile={(key) => {
                const node = tree.nodes[key];
                if (!node) return;
                go(buildStudioHref({ surface: 'agency-builder', tab: 'profile', nodeKey: node.key }));
              }}
              onCreate={(key) => {
                const href = createAgentRouteForNode(key, tree.nodes);
                if (!href) return;
                go(href);
              }}
              onRename={handleRenameNode}
            />
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12 }}>No hierarchy available</div>
        )}
      </div>
    </div>
  );
}

function iconButtonStyle(): React.CSSProperties {
  return {
    width: 22,
    height: 22,
    border: '1px solid var(--shell-chip-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg-primary)',
    color: 'var(--text-muted)',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    padding: 0,
  };
}

function HierarchyBranch({
  nodeKey,
  depth,
  nodes,
  labelOverrides,
  selectedKey,
  isExpanded,
  toggleExpanded,
  selectNode,
  matches,
  onOpen,
  onOpenProfile,
  onCreate,
  onRename,
}: {
  nodeKey: string;
  depth: number;
  nodes: Record<string, HierarchyNode>;
  labelOverrides: Record<string, string>;
  selectedKey: string | null;
  isExpanded: (key: string) => boolean;
  toggleExpanded: (key: string) => void;
  selectNode: (key: string) => void;
  matches: Map<string, boolean>;
  onOpen: (key: string) => void;
  onOpenProfile: (key: string) => void;
  onCreate: (key: string) => void;
  onRename: (node: HierarchyNode, nextLabel: string) => Promise<void>;
}) {
  const node = nodes[nodeKey];
  if (!node) return null;
  if (!matches.get(nodeKey)) return null;

  const shownLabel = labelOverrides[nodeKey] ?? node.label;
  const hasChildren = node.childKeys.length > 0;
  const expanded = hasChildren && isExpanded(nodeKey);
  const selected = selectedKey === nodeKey;
  const indent = 2 + depth * 6;
  const levelColor = LEVEL_COLOR[node.level];
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(shownLabel);
  const [savingLabel, setSavingLabel] = useState(false);
  const canInlineRename = node.level === 'workspace' || node.level === 'agent' || node.level === 'subagent';

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div
        onClick={() => {
          selectNode(nodeKey);
          onOpen(nodeKey);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            selectNode(nodeKey);
            onOpen(nodeKey);
          }
          if (event.key === ' ') {
            event.preventDefault();
            selectNode(nodeKey);
            onOpen(nodeKey);
          }
          if (event.key === 'ArrowRight' && hasChildren && !expanded) {
            event.preventDefault();
            toggleExpanded(nodeKey);
          }
          if (event.key === 'ArrowLeft' && hasChildren && expanded) {
            event.preventDefault();
            toggleExpanded(nodeKey);
          }
        }}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasChildren ? expanded : undefined}
        tabIndex={0}
        style={{
          display: 'grid',
          gridTemplateColumns: '16px 1fr auto',
          alignItems: 'center',
          gap: 4,
          borderRadius: 'var(--radius-sm)',
          border: `1px solid ${selected ? 'color-mix(in srgb, var(--color-primary) 35%, var(--shell-chip-border))' : 'transparent'}`,
          background: selected ? 'var(--color-primary-soft)' : 'transparent',
          color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
          cursor: 'pointer',
          padding: `4px 6px 4px ${indent}px`,
          boxShadow: depth > 0 ? `inset 2px 0 0 0 color-mix(in srgb, ${levelColor} 28%, transparent)` : 'none',
        }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (hasChildren) toggleExpanded(nodeKey);
          }}
          style={{
            width: 16,
            height: 16,
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            display: 'grid',
            placeItems: 'center',
            cursor: hasChildren ? 'pointer' : 'default',
            opacity: hasChildren ? 1 : 0.25,
            padding: 0,
          }}
          aria-label={hasChildren ? `Toggle ${node.label}` : undefined}
        >
          {hasChildren ? (expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <ChevronRight size={13} />}
        </button>

        <div style={{ minWidth: 0, display: 'grid' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: 'var(--radius-full)',
                background: levelColor,
                boxShadow: `0 0 0 3px color-mix(in srgb, ${levelColor} 18%, transparent)`,
                flexShrink: 0,
              }}
            />
            {editing ? (
              <input
                autoFocus
                value={draftLabel}
                onChange={(event) => setDraftLabel(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onBlur={async () => {
                  if (!canInlineRename) {
                    setEditing(false);
                    setDraftLabel(shownLabel);
                    return;
                  }
                  setSavingLabel(true);
                  try {
                    await onRename(node, draftLabel);
                  } finally {
                    setSavingLabel(false);
                    setEditing(false);
                  }
                }}
                onKeyDown={async (event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setEditing(false);
                    setDraftLabel(shownLabel);
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (!canInlineRename) {
                      setEditing(false);
                      setDraftLabel(shownLabel);
                      return;
                    }
                    setSavingLabel(true);
                    try {
                      await onRename(node, draftLabel);
                    } finally {
                      setSavingLabel(false);
                      setEditing(false);
                    }
                  }
                }}
                style={{
                  minWidth: 0,
                  width: '100%',
                  fontSize: 12,
                  fontWeight: selected ? 700 : 600,
                  color: levelColor,
                  border: '1px solid color-mix(in srgb, var(--shell-chip-border) 90%, transparent)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--shell-chip-bg)',
                  padding: '2px 6px',
                  outline: 'none',
                }}
                aria-label={`Rename ${LEVEL_LABEL[node.level]}`}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  selectNode(nodeKey);
                  onOpen(nodeKey);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  setDraftLabel(shownLabel);
                  setEditing(true);
                }}
                title={canInlineRename ? 'Double click to rename' : 'Rename managed by canonical settings'}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  margin: 0,
                  textAlign: 'left',
                  minWidth: 0,
                  width: '100%',
                  fontSize: 12,
                  fontWeight: selected ? 700 : 600,
                  color: levelColor,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  opacity: savingLabel ? 0.7 : 1,
                }}
              >
                {shownLabel}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenProfile(nodeKey);
            }}
            title={`Open ${shownLabel} profile`}
            aria-label={`Open ${shownLabel} profile`}
            style={{
              width: 18,
              height: 18,
              borderRadius: 6,
              border: '1px solid color-mix(in srgb, var(--shell-chip-border) 80%, transparent)',
              background: 'var(--shell-chip-bg)',
              color: 'var(--text-muted)',
              display: 'grid',
              placeItems: 'center',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <SquarePen size={11} />
          </button>
          {(node.level === 'agency' || node.level === 'department' || node.level === 'workspace' || node.level === 'agent') && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCreate(nodeKey);
              }}
              title={
                node.level === 'agency'
                  ? 'Add Department'
                  : node.level === 'department'
                    ? 'Add Workspace'
                    : node.level === 'workspace'
                      ? 'Add Agent'
                      : 'Add Subagent'
              }
              aria-label={
                node.level === 'agency'
                  ? 'Add Department'
                  : node.level === 'department'
                    ? 'Add Workspace'
                    : node.level === 'workspace'
                      ? 'Add Agent'
                      : 'Add Subagent'
              }
              style={{
                width: 18,
                height: 18,
                borderRadius: 6,
                border: '1px solid color-mix(in srgb, var(--shell-chip-border) 80%, transparent)',
                background: 'var(--shell-chip-bg)',
                color: 'var(--text-muted)',
                display: 'grid',
                placeItems: 'center',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              <Plus size={12} />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div
          style={{
            display: 'grid',
            gap: 1,
            marginLeft: 4,
            paddingLeft: 4,
            borderLeft: `1px dashed color-mix(in srgb, ${levelColor} 42%, transparent)`,
          }}
        >
          {node.childKeys.map((childKey) => (
            <HierarchyBranch
              key={childKey}
              nodeKey={childKey}
              depth={depth + 1}
              nodes={nodes}
              labelOverrides={labelOverrides}
              selectedKey={selectedKey}
              isExpanded={isExpanded}
              toggleExpanded={toggleExpanded}
              selectNode={selectNode}
              matches={matches}
              onOpen={onOpen}
              onOpenProfile={onOpenProfile}
              onCreate={onCreate}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}
