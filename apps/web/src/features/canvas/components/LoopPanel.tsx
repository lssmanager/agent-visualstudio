interface LoopPanelProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function LoopPanel({ config, onChange }: LoopPanelProps) {
  function set(key: string, val: unknown) {
    onChange({ ...config, [key]: val });
  }

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
        Max Iterations
      </label>
      <input
        type="number"
        min={1}
        max={100}
        value={(config.maxIterations as number) ?? 3}
        onChange={(e) => set('maxIterations', Number(e.target.value))}
        className="w-full rounded border px-2 py-1 text-xs"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
      />

      <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
        Continue While (expression)
      </label>
      <textarea
        value={(config.expression as string) ?? ''}
        onChange={(e) => set('expression', e.target.value)}
        placeholder="e.g. output.done !== true"
        rows={2}
        className="w-full rounded border px-2 py-1 text-[10px] font-mono resize-none"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
      />
      <p className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
        Loop repeats while expression is truthy, up to Max Iterations.
      </p>
    </div>
  );
}
