import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FolderTree, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { type HierarchyLevel, type HierarchyNode, useHierarchy } from '../lib/HierarchyContext';

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

function routeForNode(node: HierarchyNode): string {
  if (node.level === 'workspace') return '/workspace-studio';
  if (node.level === 'agent' || node.level === 'subagent') return '/entity-editor';
  return '/agency-builder?tab=overview';
}

export function ContextPanel({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const {
    tree,
    agencies,
    selectedKey,
    selectedNode,
    selectedLineage,
    isExpanded,
    toggleExpanded,
    selectNode,
    loading,
  } = useHierarchy();
  const [search, setSearch] = useState('');

  const searchText = search.trim().toLowerCase();

  const matches = useMemo(() => {
    const cache = new Map<string, boolean>();
    const scan = (key: string): boolean => {
      if (cache.has(key)) return cache.get(key) ?? false;
      const node = tree.nodes[key];
      if (!node) {
        cache.set(key, false);
        return false;
      }
      const selfMatch =
        searchText.length === 0 ||
        node.label.toLowerCase().includes(searchText) ||
        LEVEL_LABEL[node.level].toLowerCase().includes(searchText);
      const childMatch = node.childKeys.some(scan);
      const matched = selfMatch || childMatch;
      cache.set(key, matched);
      return matched;
    };

    for (const key of Object.keys(tree.nodes)) {
      scan(key);
    }
    return cache;
  }, [searchText, tree.nodes]);

  function go(path: string) {
    navigate(path);
    onNavigate?.();
  }

  const contextPath = selectedLineage.map((node) => node.label).join(' / ');

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

        <div style={{ display: 'flex', alignItems: 'start', gap: 10 }}>
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
            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 5 }}>
              Agency / Departments / Workspaces / Agents / Subagents
            </p>
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <select
            value={selectedLineage[0]?.id ?? ''}
            onChange={(event) => {
              const nextAgency = agencies.find((agency) => agency.id === event.target.value);
              if (!nextAgency) return;
              selectNode(`agency:${nextAgency.id}`);
              go('/agency-builder?tab=overview');
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

          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 11,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search hierarchy..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{
                width: '100%',
                padding: '10px 11px 10px 33px',
                fontSize: 13,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--shell-chip-border)',
                background: 'var(--shell-chip-bg)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => {
              if (selectedNode) {
                go(routeForNode(selectedNode));
              }
            }}
            disabled={!selectedNode}
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--shell-chip-border)',
              background: selectedNode ? 'var(--shell-chip-bg)' : 'transparent',
              color: selectedNode ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: 12,
              fontWeight: 700,
              padding: '8px 10px',
              textAlign: 'left',
              cursor: selectedNode ? 'pointer' : 'not-allowed',
              opacity: selectedNode ? 1 : 0.7,
            }}
          >
            Open selected context
          </button>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid var(--shell-panel-border)', padding: '10px 16px' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', fontWeight: 700 }}>
          Active Context
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 12,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {contextPath || 'No selection'}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {loading && Object.keys(tree.nodes).length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12 }}>Loading hierarchy...</div>
        ) : tree.rootKey ? (
          <HierarchyBranch
            nodeKey={tree.rootKey}
            depth={0}
            nodes={tree.nodes}
            selectedKey={selectedKey}
            isExpanded={isExpanded}
            toggleExpanded={toggleExpanded}
            selectNode={selectNode}
            matches={matches}
            onOpen={(key) => {
              const node = tree.nodes[key];
              if (!node) return;
              go(routeForNode(node));
            }}
          />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12 }}>No hierarchy available</div>
        )}
      </div>
    </div>
  );
}

function HierarchyBranch({
  nodeKey,
  depth,
  nodes,
  selectedKey,
  isExpanded,
  toggleExpanded,
  selectNode,
  matches,
  onOpen,
}: {
  nodeKey: string;
  depth: number;
  nodes: Record<string, HierarchyNode>;
  selectedKey: string | null;
  isExpanded: (key: string) => boolean;
  toggleExpanded: (key: string) => void;
  selectNode: (key: string) => void;
  matches: Map<string, boolean>;
  onOpen: (key: string) => void;
}) {
  const node = nodes[nodeKey];
  if (!node) return null;
  if (!matches.get(nodeKey)) return null;

  const hasChildren = node.childKeys.length > 0;
  const expanded = hasChildren && isExpanded(nodeKey);
  const selected = selectedKey === nodeKey;
  const indent = 10 + depth * 13;

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div
        onClick={() => selectNode(nodeKey)}
        onDoubleClick={() => onOpen(nodeKey)}
        style={{
          display: 'grid',
          gridTemplateColumns: '18px 1fr auto',
          alignItems: 'center',
          gap: 6,
          borderRadius: 'var(--radius-sm)',
          border: `1px solid ${selected ? 'color-mix(in srgb, var(--color-primary) 35%, var(--shell-chip-border))' : 'transparent'}`,
          background: selected ? 'var(--color-primary-soft)' : 'transparent',
          color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
          cursor: 'pointer',
          padding: `6px 8px 6px ${indent}px`,
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

        <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: selected ? 700 : 600,
              color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.label}
          </span>
          {node.meta && (
            <span
              style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {node.meta}
            </span>
          )}
        </div>

        <span
          style={{
            borderRadius: 'var(--radius-full)',
            border: '1px solid color-mix(in srgb, var(--shell-chip-border) 80%, transparent)',
            color: LEVEL_COLOR[node.level],
            background: 'var(--shell-chip-bg)',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            padding: '2px 7px',
            whiteSpace: 'nowrap',
          }}
        >
          {LEVEL_LABEL[node.level]}
        </span>
      </div>

      {expanded && (
        <div style={{ display: 'grid', gap: 3 }}>
          {node.childKeys.map((childKey) => (
            <HierarchyBranch
              key={childKey}
              nodeKey={childKey}
              depth={depth + 1}
              nodes={nodes}
              selectedKey={selectedKey}
              isExpanded={isExpanded}
              toggleExpanded={toggleExpanded}
              selectNode={selectNode}
              matches={matches}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
