import type { AgentSpec } from '../../../../lib/types';

type Props = {
  value: AgentSpec;
  onChange: (next: AgentSpec) => void;
};

export function AgentOperationsSection({ value, onChange }: Props) {
  const operations = value.operations ?? {
    startup: {
      readSoul: true,
      readUser: true,
      readDailyMemory: true,
      readLongTermMemoryInMainSessionOnly: true,
    },
    memoryPolicy: {
      dailyNotesEnabled: true,
      longTermMemoryEnabled: true,
      memoryScope: 'main_session_only',
      compactionPolicy: '',
    },
    safety: {
      destructiveCommandsRequireApproval: true,
      externalActionsRequireApproval: true,
      privateDataProtection: true,
      recoverableDeletePreferred: true,
    },
    retryPolicy: '',
    runtimeHealthNotes: '',
  };

  const update = (patch: Partial<typeof operations>) => onChange({ ...value, operations: { ...operations, ...patch } });
  const updateStartup = (patch: Partial<NonNullable<typeof operations.startup>>) =>
    update({
      startup: {
        ...(operations.startup ?? { readSoul: true, readUser: true, readDailyMemory: true, readLongTermMemoryInMainSessionOnly: true }),
        ...patch,
      },
    });
  const updateMemory = (patch: Partial<NonNullable<typeof operations.memoryPolicy>>) =>
    update({
      memoryPolicy: {
        ...(operations.memoryPolicy ?? { dailyNotesEnabled: true, longTermMemoryEnabled: true, memoryScope: 'main_session_only' }),
        ...patch,
      },
    });
  const updateSafety = (patch: Partial<NonNullable<typeof operations.safety>>) =>
    update({
      safety: {
        ...(operations.safety ?? { destructiveCommandsRequireApproval: true, externalActionsRequireApproval: true, privateDataProtection: true, recoverableDeletePreferred: true }),
        ...patch,
      },
    });

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">Operations</h3>

      {/* Session Startup */}
      <div className="rounded-md border p-3 space-y-2">
        <p className="text-xs font-semibold uppercase opacity-60">Session Startup</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={Boolean(operations.startup?.readSoul)} onChange={(e) => updateStartup({ readSoul: e.target.checked })} />
            Read SOUL.md
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={Boolean(operations.startup?.readUser)} onChange={(e) => updateStartup({ readUser: e.target.checked })} />
            Read USER.md
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={Boolean(operations.startup?.readDailyMemory)} onChange={(e) => updateStartup({ readDailyMemory: e.target.checked })} />
            Read daily memory
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={Boolean(operations.startup?.readLongTermMemoryInMainSessionOnly)} onChange={(e) => updateStartup({ readLongTermMemoryInMainSessionOnly: e.target.checked })} />
            Long-term memory in main session only
          </label>
        </div>
      </div>

      {/* Memory Policy */}
      <div className="rounded-md border p-3 space-y-2">
        <p className="text-xs font-semibold uppercase opacity-60">Memory Policy</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={Boolean(operations.memoryPolicy?.dailyNotesEnabled)} onChange={(e) => updateMemory({ dailyNotesEnabled: e.target.checked })} />
            Daily notes enabled
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={Boolean(operations.memoryPolicy?.longTermMemoryEnabled)} onChange={(e) => updateMemory({ longTermMemoryEnabled: e.target.checked })} />
            Long-term memory enabled
          </label>
        </div>
        <div className="space-y-1">
          <p className="text-xs opacity-60">Memory scope</p>
          <div className="flex flex-wrap gap-4 text-sm">
            {(['main_session_only', 'shared_safe', 'disabled'] as const).map((opt) => (
              <label key={opt} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`memoryScope-${value.id}`}
                  value={opt}
                  checked={(operations.memoryPolicy?.memoryScope ?? 'main_session_only') === opt}
                  onChange={() => updateMemory({ memoryScope: opt })}
                />
                {opt.replace(/_/g, ' ')}
              </label>
            ))}
          </div>
        </div>
        <textarea
          rows={2}
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={operations.memoryPolicy?.compactionPolicy ?? ''}
          onChange={(e) => updateMemory({ compactionPolicy: e.target.value })}
          placeholder="Compaction policy notes"
        />
      </div>

      {/* Safety & Red Lines */}
      <div className="rounded-md border p-3 space-y-2">
        <p className="text-xs font-semibold uppercase" style={{ color: '#f59e0b' }}>Safety &amp; Red Lines</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={Boolean(operations.safety?.destructiveCommandsRequireApproval)} onChange={(e) => updateSafety({ destructiveCommandsRequireApproval: e.target.checked })} />
            Destructive commands require approval
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={Boolean(operations.safety?.externalActionsRequireApproval)} onChange={(e) => updateSafety({ externalActionsRequireApproval: e.target.checked })} />
            External actions require approval
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={Boolean(operations.safety?.privateDataProtection)} onChange={(e) => updateSafety({ privateDataProtection: e.target.checked })} />
            Private data protection
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={Boolean(operations.safety?.recoverableDeletePreferred)} onChange={(e) => updateSafety({ recoverableDeletePreferred: e.target.checked })} />
            Prefer recoverable delete
          </label>
        </div>
      </div>

      {/* Runtime — collapsible */}
      <details className="rounded-md border overflow-hidden">
        <summary className="px-3 py-2 text-xs font-semibold uppercase cursor-pointer select-none opacity-70 hover:opacity-100">
          Runtime
        </summary>
        <div className="px-3 pb-3 pt-1 space-y-2">
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={operations.retryPolicy ?? ''}
            onChange={(e) => update({ retryPolicy: e.target.value })}
            placeholder="Retry policy"
          />
          <textarea
            rows={3}
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={operations.runtimeHealthNotes ?? ''}
            onChange={(e) => update({ runtimeHealthNotes: e.target.value })}
            placeholder="Runtime health notes"
          />
        </div>
      </details>
    </section>
  );
}
