import type { AgentSpec } from '../../../../lib/types';

type Props = {
  value: AgentSpec;
  onChange: (next: AgentSpec) => void;
};

export function AgentHooksSection({ value, onChange }: Props) {
  const hooks = value.hooks ?? {
    heartbeat: {
      enabled: false,
      promptSource: 'disabled',
      checkEmail: true,
      checkCalendar: true,
      checkWeather: false,
      checkMentions: true,
      quietHoursStart: '23:00',
      quietHoursEnd: '08:00',
    },
    lifecycleHooks: [],
    cronHooks: [],
    proactiveChecks: ['organize memory', 'check git status', 'update docs', 'commit changes'],
  };

  const update = (patch: Partial<typeof hooks>) => onChange({ ...value, hooks: { ...hooks, ...patch } });
  const updateHeartbeat = (patch: Partial<NonNullable<typeof hooks.heartbeat>>) =>
    update({ heartbeat: { ...(hooks.heartbeat ?? { enabled: false, promptSource: 'disabled' }), ...patch } });

  const heartbeat = hooks.heartbeat ?? { enabled: false, promptSource: 'disabled' };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">Hooks</h3>

      {/* Heartbeat */}
      <div className="rounded-md border p-3 space-y-3">
        <label className="inline-flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(heartbeat.enabled)}
            onChange={(e) => updateHeartbeat({ enabled: e.target.checked })}
          />
          Enable Heartbeat
        </label>

        {/* Prompt source — radio group */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase opacity-60">Prompt Source</p>
          <div className="flex flex-wrap gap-4 text-sm">
            {(['HEARTBEAT.md', 'inline', 'disabled'] as const).map((opt) => (
              <label key={opt} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`promptSource-${value.id}`}
                  value={opt}
                  checked={heartbeat.promptSource === opt}
                  onChange={() => updateHeartbeat({ promptSource: opt })}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Periodic checks */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase opacity-60">Periodic Checks</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(heartbeat.checkEmail)}
                onChange={(e) => updateHeartbeat({ checkEmail: e.target.checked })}
              />
              Email
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(heartbeat.checkCalendar)}
                onChange={(e) => updateHeartbeat({ checkCalendar: e.target.checked })}
              />
              Calendar
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(heartbeat.checkWeather)}
                onChange={(e) => updateHeartbeat({ checkWeather: e.target.checked })}
              />
              Weather
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(heartbeat.checkMentions)}
                onChange={(e) => updateHeartbeat({ checkMentions: e.target.checked })}
              />
              Mentions
            </label>
          </div>
        </div>

        {/* Quiet hours */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <p className="text-xs opacity-60">Quiet hours start</p>
            <input
              type="time"
              className="w-full rounded-md border px-3 py-1.5 text-sm"
              value={heartbeat.quietHoursStart ?? '23:00'}
              onChange={(e) => updateHeartbeat({ quietHoursStart: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs opacity-60">Quiet hours end</p>
            <input
              type="time"
              className="w-full rounded-md border px-3 py-1.5 text-sm"
              value={heartbeat.quietHoursEnd ?? '08:00'}
              onChange={(e) => updateHeartbeat({ quietHoursEnd: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Proactive tasks */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase opacity-60">Proactive Tasks</p>
        <p className="text-xs opacity-50">One task per line — what should this agent check periodically?</p>
        <textarea
          rows={4}
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={(hooks.proactiveChecks ?? []).join('\n')}
          onChange={(e) =>
            update({ proactiveChecks: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) })
          }
          placeholder="organize memory&#10;check git status&#10;update docs"
        />
      </div>

      {/* Cron hooks */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase opacity-60">Cron Hooks</p>
        <p className="text-xs opacity-50">Format: cron expression :: task description</p>
        <textarea
          rows={4}
          className="w-full rounded-md border px-3 py-2 text-sm font-mono"
          value={(hooks.cronHooks ?? []).map((row) => `${row.schedule} :: ${row.task}`).join('\n')}
          onChange={(e) =>
            update({
              cronHooks: e.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                  const [schedule, ...taskParts] = line.split('::');
                  return { schedule: schedule.trim(), task: taskParts.join('::').trim() };
                })
                .filter((row) => row.schedule && row.task),
            })
          }
          placeholder="0 9 * * 1-5 :: Send daily standup summary"
        />
      </div>
    </section>
  );
}
