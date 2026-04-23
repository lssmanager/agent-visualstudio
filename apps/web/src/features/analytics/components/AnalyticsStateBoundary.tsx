import type { CSSProperties, ReactNode } from 'react';

import { ANALYTICS_STATE_LABELS, type AnalyticsState } from '../types';

interface AnalyticsStateBoundaryProps {
  state: AnalyticsState;
  title?: string;
  children: ReactNode;
}

const toneByState: Record<Exclude<AnalyticsState, 'ready' | 'loading' | 'empty'>, { color: string; bg: string }> = {
  runtime_offline: {
    color: 'var(--tone-danger-text, #ef4444)',
    bg: 'var(--tone-danger-bg, rgba(239,68,68,0.08))',
  },
  runtime_degraded: {
    color: 'var(--tone-warning-text, #f59e0b)',
    bg: 'var(--tone-warning-bg, rgba(245,158,11,0.08))',
  },
  unsupported_for_scope: {
    color: 'var(--text-muted)',
    bg: 'var(--bg-tertiary)',
  },
  planned_not_operational: {
    color: 'var(--text-muted)',
    bg: 'var(--bg-tertiary)',
  },
};

export function AnalyticsStateBoundary({ state, title, children }: AnalyticsStateBoundaryProps) {
  if (state === 'ready') {
    return <>{children}</>;
  }

  if (state === 'loading') {
    return (
      <div style={cardStyle}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{title ?? 'Loading analytics'}...</span>
      </div>
    );
  }

  if (state === 'empty') {
    return (
      <div style={cardStyle}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {title ?? 'Analytics'}: {ANALYTICS_STATE_LABELS.empty}
        </span>
      </div>
    );
  }

  const tone = toneByState[state];
  return (
    <div style={{ ...cardStyle, background: tone.bg }}>
      <span style={{ ...pillStyle, color: tone.color, background: 'transparent' }}>{ANALYTICS_STATE_LABELS[state]}</span>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

const cardStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  padding: 10,
};

const pillStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};
