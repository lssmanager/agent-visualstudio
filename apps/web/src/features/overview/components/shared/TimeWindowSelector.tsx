/**
 * TimeWindowSelector
 * Selector de ventana temporal reutilizable para todos los charts.
 */
import type { CSSProperties } from 'react';

const OPTIONS = [
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
];

interface TimeWindowSelectorProps {
  value: string;
  onChange: (v: string) => void;
  options?: { value: string; label: string }[];
}

export function TimeWindowSelector({ value, onChange, options = OPTIONS }: TimeWindowSelectorProps) {
  const base: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-primary)',
    cursor: 'pointer',
    transition: 'all 120ms ease',
  };

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            ...base,
            background: value === opt.value ? 'var(--color-primary, #01696f)' : 'transparent',
            color: value === opt.value ? '#fff' : 'var(--text-muted)',
            borderColor: value === opt.value ? 'var(--color-primary, #01696f)' : 'var(--border-primary)',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
