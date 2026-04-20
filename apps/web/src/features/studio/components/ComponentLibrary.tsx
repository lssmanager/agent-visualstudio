import { type DragEvent } from 'react';

import { NODE_TEMPLATES } from '../../canvas/lib/canvas-utils';
import type { FlowNodeType } from '../../../lib/types';

const CATEGORY_GROUPS: Array<{ name: string; types: FlowNodeType[] }> = [
  { name: 'Structure', types: ['trigger', 'agent', 'subagent'] },
  { name: 'Catalog', types: ['skill', 'tool'] },
  { name: 'Logic', types: ['condition', 'handoff', 'loop', 'approval'] },
  { name: 'End', types: ['end'] },
];

export function ComponentLibrary() {
  function handleDragStart(event: DragEvent<HTMLDivElement>, type: FlowNodeType) {
    event.dataTransfer.setData('application/reactflow-type', type);
    event.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div
      style={{
        height: '100%',
        background: 'var(--shell-panel-bg)',
        borderRight: '1px solid var(--shell-panel-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 14px 12px', borderBottom: '1px solid var(--shell-panel-border)' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            marginBottom: 5,
          }}
        >
          Components
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
          Drag nodes into canvas lanes
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'grid', gap: 14 }}>
        {CATEGORY_GROUPS.map((group) => {
          const items = NODE_TEMPLATES.filter((template) => group.types.includes(template.type));
          if (items.length === 0) return null;

          return (
            <div key={group.name}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  marginBottom: 8,
                }}
              >
                {group.name}
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                {items.map((template) => (
                  <div
                    key={template.type}
                    draggable
                    onDragStart={(event) => handleDragStart(event, template.type)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 10px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--shell-chip-bg)',
                      border: '1px solid var(--shell-chip-border)',
                      cursor: 'grab',
                      transition: 'border-color var(--transition), box-shadow var(--transition), transform var(--transition)',
                    }}
                    onMouseEnter={(event) => {
                      const current = event.currentTarget as HTMLElement;
                      current.style.borderColor = 'var(--color-primary)';
                      current.style.boxShadow = 'var(--shadow-sm)';
                      current.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(event) => {
                      const current = event.currentTarget as HTMLElement;
                      current.style.borderColor = 'var(--shell-chip-border)';
                      current.style.boxShadow = 'none';
                      current.style.transform = 'none';
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 10,
                        background: `color-mix(in srgb, ${template.color} 18%, transparent)`,
                        color: template.color,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      {template.icon}
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {template.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
