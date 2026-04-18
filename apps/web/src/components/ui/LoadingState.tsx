interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = 'Loading...' }: LoadingStateProps) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-secondary)' }}>
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-12 h-12 rounded-full border-4 animate-spin"
          style={{
            borderColor:      'var(--border-primary)',
            borderTopColor:   'var(--color-primary)',
          }}
        />
        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>{label}</p>
      </div>
    </div>
  );
}
