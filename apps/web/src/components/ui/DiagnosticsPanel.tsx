import { AlertTriangle, CheckCircle } from 'lucide-react';

interface DiagnosticsPanelProps {
  diagnostics: string[];
  title?: string;
  className?: string;
}

export function DiagnosticsPanel({ diagnostics, title = 'Diagnostics', className = '' }: DiagnosticsPanelProps) {
  const clean = diagnostics.length === 0;

  return (
    <div
      className={`rounded-xl border p-4 ${className}`}
      style={{
        borderColor: clean ? 'var(--tone-success-border)' : 'var(--tone-warning-border)',
        background: clean ? 'var(--tone-success-bg)' : 'var(--tone-warning-bg)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        {clean ? (
          <CheckCircle size={16} className="flex-shrink-0" style={{ color: 'var(--color-success)' }} />
        ) : (
          <AlertTriangle size={16} className="flex-shrink-0" style={{ color: 'var(--color-warning)' }} />
        )}
        <p
          className="text-sm font-semibold"
          style={{ color: clean ? 'var(--tone-success-text)' : 'var(--tone-warning-text)' }}
        >
          {clean ? `${title} · Clean` : `${title} · ${diagnostics.length} issue${diagnostics.length > 1 ? 's' : ''}`}
        </p>
      </div>

      {!clean && (
        <ul className="space-y-1.5">
          {diagnostics.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--tone-warning-text)' }}>
              <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-warning)', opacity: 0.6 }}>▸</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
