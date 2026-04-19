interface ConditionBuilderProps {
  value: string;
  onChange: (expression: string) => void;
}

const OPERATORS = ['==', '!=', '>', '<', '>=', '<=', 'contains', 'startsWith', 'endsWith'];
const LOGIC = ['&&', '||'];

export function ConditionBuilder({ value, onChange }: ConditionBuilderProps) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
        Condition Expression
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. output.score > 0.8 && output.category == 'urgent'"
        className="w-full rounded border px-2 py-1.5 text-xs font-mono resize-none"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)', minHeight: 60 }}
        rows={3}
      />
      {/* Quick-insert helpers */}
      <div className="flex flex-wrap gap-1">
        {OPERATORS.map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => onChange(value + ` ${op} `)}
            className="px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
          >
            {op}
          </button>
        ))}
        {LOGIC.map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => onChange(value + ` ${op} `)}
            className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-colors"
            style={{ background: '#dbeafe', color: '#2563eb' }}
          >
            {op}
          </button>
        ))}
      </div>
      <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
        The expression is evaluated against the previous step's output. Branches map to edge conditions.
      </p>
    </div>
  );
}
