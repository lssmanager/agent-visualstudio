import type { AgentReadinessState } from '../../../../lib/types';

type Props = {
  state: AgentReadinessState;
  score: number;
  checks: Record<string, boolean>;
  missingFields?: string[];
  publishEnabled: boolean;
  publishing?: boolean;
  onPublish: () => void;
  fullPage?: boolean;
};

const CHECK_LABELS: Record<string, string> = {
  identityComplete: 'Identity',
  behaviorComplete: 'Prompts / Behavior',
  toolsAssigned: 'Skills / Tools',
  routingConfigured: 'Routing & Channels',
  hooksConfigured: 'Hooks',
  operationsConfigured: 'Operations',
  versionsReady: 'Versions',
};

function scoreColor(score: number): string {
  if (score === 100) return 'var(--tone-success-text, #16a34a)';
  if (score >= 60) return 'var(--color-primary)';
  return '#f59e0b';
}

function CheckIcon({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0 font-bold"
      style={{
        width: 18,
        height: 18,
        fontSize: 10,
        background: ok ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)',
        color: ok ? 'var(--tone-success-text, #16a34a)' : 'var(--tone-danger-text, #dc2626)',
      }}
    >
      {ok ? '✓' : '✗'}
    </span>
  );
}

export function AgentReadinessPanel({
  state,
  score,
  checks,
  missingFields = [],
  publishEnabled,
  publishing = false,
  onPublish,
  fullPage = false,
}: Props) {
  const color = scoreColor(score);

  if (fullPage) {
    return (
      <div className="space-y-6 max-w-lg">
        <h3 className="text-sm font-semibold">Readiness</h3>

        {/* Big score ring */}
        <div className="flex items-center gap-5">
          <div
            className="inline-flex items-center justify-center rounded-full border-4 shrink-0"
            style={{ width: 96, height: 96, borderColor: color, color, fontSize: 28, fontWeight: 700 }}
          >
            {score}%
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">{state.replace(/_/g, ' ')}</p>
            <div className="h-2 w-48 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${score}%`, background: color }}
              />
            </div>
          </div>
        </div>

        {/* Section checks list */}
        <div className="rounded-md border divide-y">
          {Object.entries(checks).map(([key, ok]) => (
            <div key={key} className="flex items-center gap-3 px-4 py-2.5">
              <CheckIcon ok={ok} />
              <span className="text-sm">{CHECK_LABELS[key] ?? key}</span>
              {!ok && (
                <span className="ml-auto text-xs opacity-50">incomplete</span>
              )}
            </div>
          ))}
        </div>

        {/* Missing fields */}
        {missingFields.length > 0 && (
          <div className="rounded-md border p-3 space-y-1.5">
            <p className="text-xs font-semibold uppercase opacity-60">Missing</p>
            {missingFields.map((field) => (
              <p key={field} className="text-xs opacity-60">— {field}</p>
            ))}
          </div>
        )}

        {/* Full publish button */}
        <button
          type="button"
          className="w-full rounded-md px-4 py-3 text-sm font-semibold disabled:opacity-50 transition-colors"
          style={{
            background: publishEnabled ? '#16a34a' : 'var(--bg-tertiary)',
            color: publishEnabled ? '#fff' : 'var(--text-muted)',
          }}
          disabled={!publishEnabled || publishing}
          onClick={onPublish}
        >
          {publishing ? 'Publishing…' : publishEnabled ? 'Publish Agent' : 'Complete all sections to publish'}
        </button>
      </div>
    );
  }

  /* Compact sidebar panel */
  return (
    <aside className="rounded-lg border p-3 space-y-2 self-start">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Readiness</h3>
        <span className="text-sm font-bold" style={{ color }}>
          {score}%
        </span>
      </div>

      {/* Mini progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, background: color }}
        />
      </div>

      <ul className="space-y-1.5">
        {Object.entries(checks).map(([key, ok]) => (
          <li key={key} className="flex items-center gap-1.5">
            <CheckIcon ok={ok} />
            <span className="text-xs opacity-70">{CHECK_LABELS[key] ?? key}</span>
          </li>
        ))}
      </ul>

      {missingFields.length > 0 && (
        <div className="space-y-0.5 pt-1 border-t">
          <p className="text-xs font-semibold uppercase opacity-50">Missing</p>
          {missingFields.map((field) => (
            <p key={field} className="text-xs opacity-50">— {field}</p>
          ))}
        </div>
      )}

      <button
        type="button"
        className="w-full rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors"
        style={{
          background: publishEnabled ? '#16a34a' : 'var(--btn-primary-bg)',
          color: publishEnabled ? '#fff' : 'var(--btn-primary-text)',
        }}
        disabled={!publishEnabled || publishing}
        onClick={onPublish}
      >
        {publishing ? 'Publishing…' : 'Publish Agent'}
      </button>
    </aside>
  );
}
