import type { CSSProperties } from 'react';

import { AnalyticsStateBoundary } from './AnalyticsStateBoundary';

export function PlannedVisualQueue({ title, items }: { title: string; items: Array<{ id: string; label: string; note: string }> }) {
  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{title}</div>
      <AnalyticsStateBoundary state="planned_not_operational" title={title}>
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {items.map((item) => (
            <div key={item.id} style={rowStyle}>
              <div style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{item.note}</div>
            </div>
          ))}
        </div>
      </AnalyticsStateBoundary>
    </div>
  );
}

const cardStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  padding: 12,
};

const rowStyle: CSSProperties = {
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  padding: '8px 10px',
};

const labelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
};
