import type { AgentSpec } from '../../../../lib/types';

type Props = { value: AgentSpec; onChange: (next: AgentSpec) => void };

export function AgentBehaviorSection({ value, onChange }: Props) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Prompts / Behavior</h3>
      <textarea
        rows={4}
        value={value.behavior?.systemPrompt ?? value.instructions}
        onChange={(event) => onChange({ ...value, instructions: event.target.value, behavior: { ...(value.behavior ?? {}), systemPrompt: event.target.value } })}
        placeholder="Describe the agent's core mission and operating mode."
        className="w-full rounded-md border px-3 py-2"
      />
    </section>
  );
}

