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
      className={`inline-flex items-center gap-1.5 font-semibold tracking-wide ${textSizes[size]} ${
        ok ? 'text-emerald-600' : 'text-amber-600'
      }`}
    >
      <span
        className={`${dotSizes[size]} rounded-full flex-shrink-0 ${
          ok ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]' : 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]'
        }`}
      />
      {showLabel && (ok ? 'Online' : 'Offline')}
    </span>
  );
}
