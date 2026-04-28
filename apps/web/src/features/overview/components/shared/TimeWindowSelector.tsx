/**
 * TimeWindowSelector — selector compacto de ventana temporal.
 * Reutilizado por todos los charts que soportan ventana variable.
 *
 * Props:
 *   value    — ventana activa: '1h' | '24h' | '7d' | '30d'
 *   onChange — callback con la nueva ventana
 *   options  — lista personalizada (opcional, por defecto las 4 estándar)
 *
 * Uso:
 *   <TimeWindowSelector value={win} onChange={setWin} />
 */

export type TimeWindow = '1h' | '24h' | '7d' | '30d';

export interface TimeWindowOption {
  value: TimeWindow | string;
  label: string;
}

const DEFAULT_OPTIONS: TimeWindowOption[] = [
  { value: '1h',  label: '1h'  },
  { value: '24h', label: '24h' },
  { value: '7d',  label: '7d'  },
  { value: '30d', label: '30d' },
];

export interface TimeWindowSelectorProps {
  value: string;
  onChange: (v: string) => void;
  options?: TimeWindowOption[];
}

export function TimeWindowSelector({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
}: TimeWindowSelectorProps) {
  return (
    <>
      <style>{`
        .tw-btn {
          padding: 2px 8px;
          font-size: 10px;
          font-weight: 600;
          border-radius: var(--radius-sm, 0.375rem);
          border: 1px solid var(--border-primary, #d4d1ca);
          background: transparent;
          color: var(--text-muted, #7a7974);
          cursor: pointer;
          transition: background 120ms, color 120ms, border-color 120ms;
          line-height: 1.6;
          white-space: nowrap;
        }
        .tw-btn:hover {
          background: var(--color-surface-offset, #f3f0ec);
          color: var(--text-primary, #28251d);
        }
        .tw-btn[data-active="true"] {
          background: var(--color-primary-highlight, #cedcd8);
          color: var(--color-primary, #01696f);
          border-color: var(--color-primary-highlight, #cedcd8);
        }
      `}</style>
      <div
        style={{ display: 'flex', gap: 3 }}
        role="group"
        aria-label="Ventana temporal"
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className="tw-btn"
            data-active={value === opt.value ? 'true' : 'false'}
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </>
  );
}
