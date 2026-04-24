import type { AgentSpec } from '../../../../lib/types';

type Props = { value: AgentSpec };

export function AgentHooksSection({ value }: Props) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Hooks</h3>
      <pre className="text-xs overflow-auto rounded-md border p-2">{JSON.stringify(value.hooks ?? {}, null, 2)}</pre>
    </section>
  );
}

