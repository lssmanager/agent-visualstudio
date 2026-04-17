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
      className={`rounded-xl border p-4 ${
        clean
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-amber-200 bg-amber-50'
      } ${className}`}
    >
      <div className="flex items-center gap-2 mb-3">
        {clean ? (
          <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
        ) : (
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
        )}
        <p className={`text-sm font-semibold ${clean ? 'text-emerald-800' : 'text-amber-800'}`}>
          {clean ? `${title} · Clean` : `${title} · ${diagnostics.length} issue${diagnostics.length > 1 ? 's' : ''}`}
        </p>
      </div>

      {!clean && (
        <ul className="space-y-1.5">
          {diagnostics.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-amber-700">
              <span className="mt-0.5 flex-shrink-0 text-amber-400">▸</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
