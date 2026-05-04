// TODO(F6-05): when the sidebar has a list of workspace flows,
// replace the free-text flowId input with a <select> like agents/skills.

interface SubflowPanelProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function SubflowPanel({ config, onChange }: SubflowPanelProps) {
  function set(key: string, val: unknown) {
    onChange({ ...config, [key]: val });
  }

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
        Flow ID
      </label>
      <input
        value={(config.flowId as string) ?? ''}
        onChange={(e) => set('flowId', e.target.value)}
        placeholder="flow-uuid"
        className="w-full rounded border px-2 py-1 text-xs font-mono"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
      />

      <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
        Display Name
      </label>
      <input
        value={(config.flowName as string) ?? ''}
        onChange={(e) => set('flowName', e.target.value)}
        placeholder="My subflow"
        className="w-full rounded border px-2 py-1 text-xs"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
      />

      <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
        Input Mapping (JSON)
      </label>
      <textarea
        value={
          typeof config.inputMapping === 'object'
            ? JSON.stringify(config.inputMapping, null, 2)
            : ((config.inputMapping as string) ?? '{}')
        }
        onChange={(e) => {
          try { set('inputMapping', JSON.parse(e.target.value)); } catch { /* allow partial edit */ }
        }}
        rows={3}
        placeholder='{ "query": "$.trigger.input" }'
        className="w-full rounded border px-2 py-1 text-[10px] font-mono resize-none"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
      />

      <label className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
        Output Key
      </label>
      <input
        value={(config.outputKey as string) ?? 'result'}
        onChange={(e) => set('outputKey', e.target.value)}
        placeholder="result"
        className="w-full rounded border px-2 py-1 text-xs font-mono"
        style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-primary)' }}
      />
    </div>
  );
}
