import { AlertCircle, Bot, Building2, ChevronRight, Cpu, LayoutGrid, RefreshCw } from 'lucide-react';
import type React from 'react';
import {
  type HierarchyLevel,
  type HierarchyNode,
  useHierarchyTree,
} from '../hooks/useHierarchyTree';

interface StudioSidebarProps {
  onNavigate?: (id: string, level: HierarchyLevel) => void;
  activeId?:   string;
}

const LEVEL_META: Record<
  HierarchyLevel,
  { icon: React.FC<{ size?: number; color?: string; className?: string }>; color: string; indent: number }
> = {
  agency:     { icon: Building2,  color: '#2563eb', indent: 0  },
  department: { icon: LayoutGrid, color: '#7c3aed', indent: 12 },
  workspace:  { icon: Cpu,        color: '#059669', indent: 24 },
  agent:      { icon: Bot,        color: '#d97706', indent: 36 },
};

interface TreeNodeRowProps {
  node:      HierarchyNode;
  expanded:  Set<string>;
  activeId:  string | null;
  onToggle:  (id: string) => void;
  onSelect:  (id: string, level: HierarchyLevel) => void;
}

function TreeNodeRow({ node, expanded, activeId, onToggle, onSelect }: TreeNodeRowProps) {
  const isExpanded  = expanded.has(node.id);
  const isActive    = activeId === node.id;
  const hasChildren = node.children.length > 0;
  const { icon: Icon, color, indent } = LEVEL_META[node.level];

  function handleActivate() {
    if (hasChildren) onToggle(node.id);
    onSelect(node.id, node.level);
  }

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={isActive}
        tabIndex={0}
        onClick={handleActivate}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleActivate();
          }
          if (e.key === 'ArrowRight' && hasChildren && !isExpanded) onToggle(node.id);
          if (e.key === 'ArrowLeft'  && hasChildren &&  isExpanded) onToggle(node.id);
        }}
        style={{
          display:         'flex',
          alignItems:      'center',
          gap:             6,
          paddingBlock:    6,
          paddingInline:   8,
          paddingLeft:     8 + indent,
          cursor:          'pointer',
          userSelect:      'none',
          borderRadius:    'var(--radius-md, 6px)',
          backgroundColor: isActive ? '#eff6ff' : undefined,
          outline:         'none',
        }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f8fafc'; }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = ''; }}
        onFocus={e    => { if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = '#f1f5f9'; }}
        onBlur={e     => { if (!isActive) (e.currentTarget as HTMLDivElement).style.backgroundColor = ''; }}
      >
        {/* Chevron expand/collapse */}
        <span
          style={{
            flexShrink:  0,
            width:       14,
            display:     'flex',
            opacity:     hasChildren ? 1 : 0,
            transition:  'transform 150ms ease',
            transform:   isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          <ChevronRight size={12} color="#94a3b8" />
        </span>

        {/* Level icon */}
        <Icon size={13} color={color} />

        {/* Name */}
        <span
          style={{
            flex:       1,
            fontSize:   12,
            overflow:   'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth:   140,
            color:      isActive ? '#1d4ed8' : '#374151',
            fontWeight: isActive ? 600 : 400,
          }}
          title={node.name}
        >
          {node.name}
        </span>

        {/* Child count badge when collapsed */}
        {hasChildren && !isExpanded && (
          <span
            style={{
              marginLeft: 'auto',
              flexShrink: 0,
              fontSize:   10,
              color:      '#94a3b8',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {node.children.length}
          </span>
        )}
      </div>

      {/* Children — rendered only when expanded */}
      {isExpanded &&
        node.children.map(child => (
          <TreeNodeRow
            key={child.id}
            node={child}
            expanded={expanded}
            activeId={activeId}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

export function StudioSidebar({ onNavigate, activeId: externalActiveId }: StudioSidebarProps) {
  const { tree, expanded, activeId, loading, error, toggle, select, refresh } =
    useHierarchyTree(onNavigate);

  const resolvedActiveId = externalActiveId ?? activeId;

  return (
    <aside
      style={{
        display:       'flex',
        flexDirection: 'column',
        borderRadius:  'var(--radius-lg, 8px)',
        border:        '1px solid var(--shell-panel-border, #e2e8f0)',
        background:    'var(--shell-panel-bg, #ffffff)',
        overflow:      'hidden',
        minHeight:     0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          borderBottom:   '1px solid var(--shell-chip-border, #f1f5f9)',
          background:     'var(--shell-chip-bg, #f8fafc)',
          padding:        '8px 12px',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Hierarchy
        </span>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh hierarchy"
          style={{
            display:      'grid',
            placeItems:   'center',
            borderRadius: 'var(--radius-sm, 4px)',
            border:       'none',
            background:   'transparent',
            cursor:       loading ? 'not-allowed' : 'pointer',
            padding:      2,
            opacity:      loading ? 0.4 : 1,
            color:        'var(--text-muted, #64748b)',
          }}
        >
          <RefreshCw
            size={12}
            color="currentColor"
            style={{ animation: loading ? 'spin 1s linear infinite' : undefined }}
          />
        </button>
      </div>

      {/* Tree content */}
      <div
        role="tree"
        aria-label="Agency hierarchy"
        style={{
          flex:       1,
          overflowY:  'auto',
          padding:    4,
          minHeight:  0,
        }}
      >
        {loading && tree.length === 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px', fontSize: 12, color: 'var(--text-muted, #94a3b8)' }}>
            <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
            Loading…
          </div>
        )}

        {error && !loading && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px' }}>
            <AlertCircle size={13} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: '#dc2626', lineHeight: 1.4 }}>{error}</span>
          </div>
        )}

        {!loading && !error && tree.length === 0 && (
          <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--text-muted, #94a3b8)', textAlign: 'center' }}>
            No agencies found.
          </div>
        )}

        {tree.map(node => (
          <TreeNodeRow
            key={node.id}
            node={node}
            expanded={expanded}
            activeId={resolvedActiveId}
            onToggle={toggle}
            onSelect={select}
          />
        ))}
      </div>

      {/* CSS keyframes for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </aside>
  );
}
