interface RuntimeBadgeProps {
  ok: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function RuntimeBadge({ ok, size = 'md', showLabel = true }: RuntimeBadgeProps) {
  const dotSizes = { sm: 'w-1.5 h-1.5', md: 'w-2 h-2', lg: 'w-2.5 h-2.5' };
  const textSizes = { sm: 'text-xs', md: 'text-xs', lg: 'text-sm' };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold tracking-wide ${textSizes[size]}`}
      style={{ color: ok ? 'var(--color-success)' : 'var(--color-warning)' }}
    >
      <span
        className={`${dotSizes[size]} rounded-full flex-shrink-0`}
        style={{
          background: ok ? 'var(--color-success)' : 'var(--color-warning)',
          boxShadow: ok
            ? '0 0 6px rgba(34, 197, 94, 0.6)'
            : '0 0 6px rgba(245, 158, 11, 0.6)',
        }}
      />
      {showLabel && (ok ? 'Online' : 'Offline')}
    </span>
  );
}
