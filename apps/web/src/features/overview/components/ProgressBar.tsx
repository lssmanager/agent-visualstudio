type ProgressTone = 'primary' | 'success' | 'warning' | 'danger';

interface ProgressBarProps {
  label: string;
  value: number;
  max: number;
  tone?: ProgressTone;
}

const toneColors: Record<ProgressTone, string> = {
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger:  'var(--color-error)',
};

export function ProgressBar({ label, value, max, tone = 'primary' }: ProgressBarProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span
        style={{
          width: 92,
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--text-muted)',
          flexShrink: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 8,
          borderRadius: 'var(--radius-full)',
          background: 'var(--bg-tertiary)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 'var(--radius-full)',
            background: toneColors[tone],
            transition: 'width 400ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
          minWidth: 32,
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}
