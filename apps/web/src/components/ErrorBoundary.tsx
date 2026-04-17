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
    <div className="bg-red-50 rounded-lg border border-red-200 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="font-semibold text-red-900 mb-1">Something went wrong</h3>
          <p className="text-sm text-red-800 mb-4">{errorMessage}</p>
          {children && <div className="text-sm text-red-700 mb-4">{children}</div>}
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
