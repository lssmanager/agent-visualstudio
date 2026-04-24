import type { AgentSpec } from '../../../../lib/types';

type Props = {
  value: AgentSpec;
  profileSource?: 'template' | 'blank' | 'imported';
  onChange: (next: AgentSpec) => void;
};

export function AgentIdentitySection({ value, onChange, profileSource = 'blank' }: Props) {
  const identity = value.identity ?? {
    name: value.name ?? '',
    creature: '',
    role: value.role ?? 'Agent',
    description: value.description ?? '',
    vibe: '',
    emoji: '',
    avatar: '',
  };

  const update = (patch: Partial<typeof identity>) => {
    const nextIdentity = { ...identity, ...patch };
    onChange({
      ...value,
      identity: nextIdentity,
      name: nextIdentity.name,
      role: nextIdentity.role ?? value.role,
      description: nextIdentity.description ?? value.description,
    });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Identity</h3>
        <span className="rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide">from {profileSource}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[84px_minmax(0,1fr)] gap-3 items-start">
        <div className="w-[84px] h-[84px] rounded-full border overflow-hidden bg-black/20 flex items-center justify-center text-xs">
          {identity.avatar ? <img src={identity.avatar} alt="avatar preview" className="w-full h-full object-cover" /> : 'avatar'}
        </div>
        <div className="space-y-2">
          <input value={identity.avatar ?? ''} onChange={(e) => update({ avatar: e.target.value })} placeholder="Workspace-relative path, URL, or generated avatar" className="w-full rounded-md border px-3 py-2 text-sm" />
          <div className="flex flex-wrap gap-2">
            <input value={identity.name ?? ''} onChange={(e) => update({ name: e.target.value })} placeholder="Pick a name for this agent" className="flex-1 min-w-[220px] rounded-md border px-3 py-2 text-sm" />
            <span className="rounded-full border px-2 py-1 text-xs">{identity.role || 'role'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input value={identity.creature ?? ''} onChange={(e) => update({ creature: e.target.value })} placeholder="AI assistant, orchestrator, dev agent, familiar…" className="rounded-md border px-3 py-2 text-sm" />
        <input value={identity.role ?? ''} onChange={(e) => update({ role: e.target.value })} placeholder="What kind of agent is this?" className="rounded-md border px-3 py-2 text-sm" />
        <input value={identity.emoji ?? ''} onChange={(e) => update({ emoji: e.target.value })} placeholder="Signature emoji" className="rounded-md border px-3 py-2 text-sm" />
      </div>

      <input value={identity.vibe ?? ''} onChange={(e) => update({ vibe: e.target.value })} placeholder="warm, sharp, calm, direct, playful…" className="w-full rounded-md border px-3 py-2 text-sm" />
      <textarea rows={3} value={identity.description ?? ''} onChange={(e) => update({ description: e.target.value })} placeholder="Short identity description" className="w-full rounded-md border px-3 py-2 text-sm" />
    </section>
  );
}
