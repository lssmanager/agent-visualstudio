interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export function LoadingSpinner({ size = 'md', label }: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`${sizeClasses[size]} rounded-full animate-spin`}
        style={{
          borderWidth: '4px',
          borderStyle: 'solid',
          borderColor: 'var(--border-primary)',
          borderTopColor: 'var(--color-primary)',
        }}
      />
      {label && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>}
    </div>
  );
}
