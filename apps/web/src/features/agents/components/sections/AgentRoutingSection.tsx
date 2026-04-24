import type { AgentSpec } from '../../../../lib/types';

type Props = { value: AgentSpec };

export function AgentRoutingSection({ value }: Props) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Routing & Channels</h3>
      <pre className="text-xs overflow-auto rounded-md border p-2">{JSON.stringify(value.routingChannels ?? {}, null, 2)}</pre>
    </section>
  );
}

