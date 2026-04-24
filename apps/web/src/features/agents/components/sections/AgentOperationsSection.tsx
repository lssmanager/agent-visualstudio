import type { AgentSpec } from '../../../../lib/types';

type Props = { value: AgentSpec };

export function AgentOperationsSection({ value }: Props) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Operations</h3>
      <pre className="text-xs overflow-auto rounded-md border p-2">{JSON.stringify(value.operations ?? {}, null, 2)}</pre>
    </section>
  );
}

