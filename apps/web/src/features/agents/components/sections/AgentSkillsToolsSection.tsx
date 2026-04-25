import { useState } from 'react';

import type { EditorSkillsToolsDto } from '../../../../lib/types';

type PatchPayload = {
  skills?: { select?: string[]; deselect?: string[]; require?: string[]; disable?: string[] };
  tools?: { select?: string[]; deselect?: string[]; require?: string[]; disable?: string[] };
};

type Props = {
  data: EditorSkillsToolsDto | null;
  localNotes?: string;
  onNotesChange?: (notes: string) => void;
  onPatch: (payload: PatchPayload) => Promise<void>;
};

const SOURCE_LABELS: Record<string, string> = {
  profile: 'Profile',
  profileDefaults: 'Profile',
  agencyEnabled: 'Agency',
  agency: 'Agency',
  inherited: 'Workspace',
  workspace: 'Workspace',
  local: 'Local',
  localOverrides: 'Local',
};

const STATE_STYLES: Record<string, { background: string; color: string }> = {
  selected: { background: 'var(--color-primary-soft)', color: 'var(--color-primary)' },
  required: { background: 'var(--color-primary-soft)', color: 'var(--color-primary)' },
  blocked: { background: 'rgba(239,68,68,0.16)', color: 'var(--tone-danger-text, #dc2626)' },
  disabled: { background: 'var(--bg-tertiary)', color: 'var(--text-muted)' },
  available: { background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' },
};

function srcLabel(src: string): string {
  return SOURCE_LABELS[src] ?? src;
}

function canToggle(state: string): boolean {
  return state === 'selected' || state === 'available' || state === 'disabled';
}

export function AgentSkillsToolsSection({ data, localNotes = '', onNotesChange, onPatch }: Props) {
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [busy, setBusy] = useState('');

  if (!data) {
    return (
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Skills / Tools</h3>
        <p className="text-xs opacity-60">Loading skills and tools…</p>
      </section>
    );
  }

  const sources = Array.from(
    new Set([...(data.skills ?? []).map((s) => s.source), ...(data.tools ?? []).map((t) => t.source)]),
  ).filter(Boolean);

  const filteredSkills =
    sourceFilter === 'all' ? (data.skills ?? []) : (data.skills ?? []).filter((s) => s.source === sourceFilter);
  const filteredTools =
    sourceFilter === 'all' ? (data.tools ?? []) : (data.tools ?? []).filter((t) => t.source === sourceFilter);

  const handleSkillToggle = async (id: string, state: string) => {
    if (!canToggle(state)) return;
    setBusy(id);
    try {
      await onPatch({ skills: state === 'selected' ? { deselect: [id] } : { select: [id] } });
    } finally {
      setBusy('');
    }
  };

  const handleToolToggle = async (id: string, state: string) => {
    if (!canToggle(state)) return;
    setBusy(id);
    try {
      await onPatch({ tools: state === 'selected' ? { deselect: [id] } : { select: [id] } });
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">Skills / Tools</h3>

      {/* Source summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: 'Profile defaults', count: data.sources?.profileDefaults?.length ?? 0 },
          { label: 'Agency enabled', count: data.sources?.agencyEnabled?.length ?? 0 },
          { label: 'Workspace inherited', count: data.sources?.inherited?.length ?? 0 },
          { label: 'Local overrides', count: data.sources?.localOverrides?.length ?? 0 },
        ].map((card) => (
          <div key={card.label} className="rounded-md border p-2 text-xs">
            <p className="font-semibold opacity-70">{card.label}</p>
            <p className="text-lg font-bold mt-0.5">{card.count}</p>
          </div>
        ))}
      </div>

      {/* Source filter pills */}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {['all', ...sources].map((src) => (
            <button
              key={src}
              type="button"
              className="rounded-full px-3 py-1 text-xs font-medium border transition-colors"
              style={{
                background: sourceFilter === src ? 'var(--color-primary)' : 'transparent',
                color: sourceFilter === src ? '#fff' : 'var(--text-muted)',
                borderColor: sourceFilter === src ? 'var(--color-primary)' : 'var(--border-primary)',
              }}
              onClick={() => setSourceFilter(src)}
            >
              {src === 'all' ? 'All' : srcLabel(src)}
            </button>
          ))}
        </div>
      )}

      {/* Skills list */}
      {filteredSkills.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase opacity-60">Skills</p>
          {filteredSkills.map((item) => (
            <label
              key={item.id}
              className="flex items-start gap-3 rounded-md border p-2.5 cursor-pointer hover:bg-black/5 transition-colors"
              style={{ opacity: item.state === 'blocked' ? 0.55 : 1 }}
            >
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={item.state === 'selected' || item.state === 'required'}
                disabled={!canToggle(item.state) || busy === item.id}
                onChange={() => void handleSkillToggle(item.id, item.state)}
              />
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold">{item.name}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px]"
                    style={STATE_STYLES[item.state] ?? STATE_STYLES.available}
                  >
                    {item.state}
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] border"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {srcLabel(item.source)}
                  </span>
                </div>
                {item.description && <p className="text-[11px] opacity-70">{item.description}</p>}
                {item.blockedReason && (
                  <p className="text-[11px]" style={{ color: 'var(--tone-danger-text, #dc2626)' }}>
                    {item.blockedReason}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Tools list */}
      {filteredTools.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase opacity-60">Tools</p>
          {filteredTools.map((item) => (
            <label
              key={item.id}
              className="flex items-start gap-3 rounded-md border p-2.5 cursor-pointer hover:bg-black/5 transition-colors"
              style={{ opacity: item.state === 'blocked' ? 0.55 : 1 }}
            >
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={item.state === 'selected' || item.state === 'required'}
                disabled={!canToggle(item.state) || busy === item.id}
                onChange={() => void handleToolToggle(item.id, item.state)}
              />
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold">{item.name}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px]"
                    style={STATE_STYLES[item.state] ?? STATE_STYLES.available}
                  >
                    {item.state}
                  </span>
                  <span className="rounded px-1.5 py-0.5 text-[10px] border opacity-60">{item.type}</span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] border"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {srcLabel(item.source)}
                  </span>
                </div>
                {item.description && <p className="text-[11px] opacity-70">{item.description}</p>}
                {item.blockedReason && (
                  <p className="text-[11px]" style={{ color: 'var(--tone-danger-text, #dc2626)' }}>
                    {item.blockedReason}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Empty state */}
      {filteredSkills.length === 0 && filteredTools.length === 0 && (
        <div className="rounded-md border p-3 text-xs space-y-2">
          <p className="opacity-60">
            {sourceFilter === 'all'
              ? 'No skills or tools enabled for this scope.'
              : `No items from source "${srcLabel(sourceFilter)}".`}
          </p>
          {sourceFilter === 'all' && (
            <div className="flex items-center gap-3">
              <a className="underline opacity-60 hover:opacity-100" href="/profiles">Open Profiles Hub</a>
              <a className="underline opacity-60 hover:opacity-100" href="/settings">Open Settings</a>
            </div>
          )}
        </div>
      )}

      {/* Effective assignment summary */}
      {data.effective && (
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-xs font-semibold uppercase opacity-60">Effective Assignment</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-semibold mb-1 opacity-50">SKILLS ({data.effective.skills.length})</p>
              <div className="flex flex-wrap gap-1">
                {data.effective.skills.length > 0
                  ? data.effective.skills.map((s) => (
                      <span key={s} className="rounded px-1.5 py-0.5 text-[10px] border">{s}</span>
                    ))
                  : <span className="text-[11px] opacity-40">none</span>}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold mb-1 opacity-50">TOOLS ({data.effective.tools.length})</p>
              <div className="flex flex-wrap gap-1">
                {data.effective.tools.length > 0
                  ? data.effective.tools.map((t) => (
                      <span key={t} className="rounded px-1.5 py-0.5 text-[10px] border">{t}</span>
                    ))
                  : <span className="text-[11px] opacity-40">none</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Local Tool Notes */}
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase opacity-60">Local Tool Notes</p>
        <textarea
          rows={4}
          className="w-full rounded-md border px-3 py-2 text-sm"
          value={localNotes}
          onChange={(e) => onNotesChange?.(e.target.value)}
          placeholder="Device aliases, environment notes, tool-specific preferences for this agent…"
        />
      </div>
    </section>
  );
}
