type Status = 'online' | 'offline' | 'warning' | 'error' | 'idle';
type Size = 'sm' | 'md' | 'lg';

interface StatusDotProps {
  status: Status;
  size?: Size;
  label?: string;
  pulse?: boolean;
}

const STATUS_COLOR: Record<Status, string> = {
  online:  'var(--color-success)',
  offline: 'var(--text-muted)',
  warning: 'var(--color-warning)',
  error:   'var(--color-error)',
  idle:    'var(--border-primary)',
};

const SIZE_PX: Record<Size, number> = {
  sm: 6,
  md: 8,
  lg: 10,
};

const pulseKeyframes = `
@keyframes statusDotPulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
`;

let styleInjected = false;
function injectPulseStyle() {
  if (styleInjected) return;
  const sheet = document.createElement('style');
  sheet.textContent = pulseKeyframes;
  document.head.appendChild(sheet);
  styleInjected = true;
}

export function StatusDot({ status, size = 'md', label, pulse = false }: StatusDotProps) {
  if (pulse) injectPulseStyle();

  const px = SIZE_PX[size];
  const color = STATUS_COLOR[status];

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        style={{
          width: px,
          height: px,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
          animation: pulse ? 'statusDotPulse 1.5s ease-in-out infinite' : undefined,
        }}
      />
      {label && (
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
