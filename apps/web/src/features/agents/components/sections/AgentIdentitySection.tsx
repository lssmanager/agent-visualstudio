import type { AgentSpec } from '../../../../lib/types';

type Props = {
  value: AgentSpec;
  onChange: (next: AgentSpec) => void;
};

export function AgentIdentitySection({ value, onChange }: Props) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Identity</h3>
      <input
        value={value.identity?.name ?? value.name}
        onChange={(event) => onChange({ ...value, name: event.target.value, identity: { ...(value.identity ?? { name: event.target.value }), name: event.target.value } })}
        placeholder="Pick a name for this agent"
        className="w-full rounded-md border px-3 py-2"
      />
    </section>
  );
}

