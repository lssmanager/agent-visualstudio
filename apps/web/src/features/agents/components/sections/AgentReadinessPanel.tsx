import type { AgentReadinessState } from '../../../../lib/types';

type Props = {
  state: AgentReadinessState;
  score: number;
  checks: Record<string, boolean>;
};

export function AgentReadinessPanel({ state, score, checks }: Props) {
  return (
    <aside className="rounded-lg border p-3 space-y-2">
      <h3 className="text-sm font-semibold">Readiness</h3>
      <p className="text-xs">{state} · {score}%</p>
      <ul className="text-xs space-y-1">
        {Object.entries(checks).map(([name, ok]) => (
          <li key={name}>{ok ? '[ok]' : '[x]'} {name}</li>
        ))}
      </ul>
    </aside>
  );
}

