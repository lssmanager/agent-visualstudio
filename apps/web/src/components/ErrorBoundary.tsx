import { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  error: Error | string;
  onRetry?: () => void;
  children?: ReactNode;
}

export function ErrorBoundary({ error, onRetry, children }: ErrorBoundaryProps) {
  const errorMessage = typeof error === 'string' ? error : error.message;

  return (
    <div
      className="rounded-lg p-6"
      style={{
        background: 'var(--tone-danger-bg)',
        border: '1px solid var(--tone-danger-border)',
      }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-error)' }} />
        <div className="flex-1">
          <h3 className="font-semibold mb-1" style={{ color: 'var(--color-error)' }}>Something went wrong</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--tone-danger-text)' }}>{errorMessage}</p>
          {children && <div className="text-sm mb-4" style={{ color: 'var(--tone-danger-text)' }}>{children}</div>}
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: 'var(--color-error)',
                color: 'var(--text-inverse)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
