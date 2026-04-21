import { useMemo } from 'react';
import { SquarePen } from 'lucide-react';

import { PageHeader } from '../../../components';
import { useHierarchy } from '../../../lib/HierarchyContext';

type EntitySection =
  | 'identity'
  | 'catalog'
  | 'prompts-behavior'
  | 'skills-tools'
  | 'routing-channels'
  | 'handoffs'
  | 'hooks'
  | 'versions'
  | 'operations';

type EntityLevel = 'agency' | 'department' | 'workspace' | 'agent' | 'subagent';

const SECTION_LABEL: Record<EntitySection, string> = {
  identity: 'Identity',
  catalog: 'Catalog (Skills/Tools)',
  'prompts-behavior': 'Prompts / Behavior',
  'skills-tools': 'Skills / Tools Assignment',
  'routing-channels': 'Routing & Channels',
  handoffs: 'Handoffs',
  hooks: 'Hooks',
  versions: 'Versions',
  operations: 'Operations',
};

const MATRIX: Record<EntityLevel, EntitySection[]> = {
  agency: ['identity', 'catalog', 'routing-channels', 'hooks', 'versions', 'operations'],
  department: ['identity', 'routing-channels', 'hooks', 'versions', 'operations'],
  workspace: ['identity', 'prompts-behavior', 'skills-tools', 'routing-channels', 'hooks', 'versions', 'operations'],
  agent: ['identity', 'prompts-behavior', 'skills-tools', 'handoffs', 'hooks', 'versions', 'operations'],
  subagent: ['identity', 'prompts-behavior', 'skills-tools', 'handoffs', 'hooks', 'versions', 'operations'],
};

export default function EntityEditorPage() {
  const { selectedNode, selectedLineage, scope } = useHierarchy();

  const level = selectedNode?.level;
  const entityLevel: EntityLevel | null =
    level === 'agency' || level === 'department' || level === 'workspace' || level === 'agent' || level === 'subagent'
      ? level
      : null;

  const sections = useMemo(() => (entityLevel ? MATRIX[entityLevel] : []), [entityLevel]);
  const contextLabel = selectedLineage.map((node) => node.label).join(' / ');

  if (!entityLevel || !selectedNode) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Entity Editor"
          icon={SquarePen}
          description="Edit Agency, Department, Workspace, Agent and Subagent configuration from a single surface."
        />
        {!scope.agencyId && (
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-primary)',
              background: 'var(--card-bg)',
              padding: 20,
              color: 'var(--text-muted)',
              fontSize: 14,
            }}
          >
            No agency selected. Create or connect an agency first.
          </div>
        )}
        <div
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-primary)',
            background: 'var(--card-bg)',
            padding: 20,
            color: 'var(--text-muted)',
            fontSize: 14,
          }}
        >
          Select an entity node in the hierarchy tree to start editing.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Entity Editor"
        icon={SquarePen}
        description="Universal editor for Agency, Department, Workspace, Agent and Subagent."
      />

      <div
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-primary)',
          background: 'var(--card-bg)',
          padding: 14,
          display: 'grid',
          gap: 4,
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
          Active Context
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{contextLabel}</div>
      </div>

      <div
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-primary)',
          background: 'var(--card-bg)',
          padding: 18,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text-primary)' }}>{selectedNode.label}</h2>
        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13, textTransform: 'capitalize' }}>
          Level: {entityLevel}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {sections.map((section) => (
          <article
            key={section}
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              padding: 14,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>{SECTION_LABEL[section]}</h3>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
              Ready for {entityLevel} configuration.
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
