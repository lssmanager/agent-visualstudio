import type { CSSProperties } from 'react';

import { ANALYTICS_WINDOWS, type AnalyticsWindow } from '../types';

interface TimeWindowSelectorProps {
  value: AnalyticsWindow;
  onChange: (window: AnalyticsWindow) => void;
}

export function TimeWindowSelector({ value, onChange }: TimeWindowSelectorProps) {
  return (
    <div style={containerStyle}>
      {ANALYTICS_WINDOWS.map((windowValue) => {
        const active = windowValue === value;
        return (
          <button
            key={windowValue}
            type="button"
            onClick={() => onChange(windowValue)}
            style={{
              ...chipStyle,
              background: active ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
              borderColor: active ? 'var(--color-primary)' : 'var(--border-primary)',
              color: active ? 'var(--color-primary)' : 'var(--text-muted)',
            }}
          >
            {windowValue}
          </button>
        );
      })}
    </div>
  );
}

const containerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
};

const chipStyle: CSSProperties = {
  borderRadius: 999,
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-muted)',
  fontSize: 10,
  fontWeight: 700,
  padding: '3px 8px',
  cursor: 'pointer',
};
