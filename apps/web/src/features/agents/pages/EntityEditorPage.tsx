import { useCallback, useEffect, useMemo, useState } from 'react';
import { SquarePen, Save, Lock, Users, BookOpen, Wrench, GitBranch, Zap, History, Activity, ChevronRight } from 'lucide-react';

import { PageHeader } from '../../../components';
import { useHierarchy } from '../../../lib/HierarchyContext';
import { useStudioState } from '../../../lib/StudioStateContext';
import { saveAgent, updateWorkspace, getHooks, getVersions, getRuns } from '../../../lib/api';
import type { AgentSpec, HookSpec, RunSpec, VersionSnapshot, WorkspaceSpec } from '../../../lib/types';

type EntitySection =
  | 'identity'
  | 'catalog'
  | 'prompts-behavior'
  | 'skills-tools'
  | 'routing-channels'
  | 'handoffs'
  | 'hooks'
  | 'versions'
  | 'operations';

type EntityLevel = 'agency' | 'department' | 'workspace' | 'agent' | 'subagent';

const SECTION_LABEL: Record<EntitySection, string> = {
  identity: 'Identity',
  catalog: 'Catalog',
  'prompts-behavior': 'Prompts / Behavior',
  'skills-tools': 'Skills / Tools',
  'routing-channels': 'Routing & Channels',
  handoffs: 'Handoffs',
  hooks: 'Hooks',
  versions: 'Versions',
  operations: 'Operations',
};

const SECTION_ICON: Record<EntitySection, typeof SquarePen> = {
  identity: SquarePen,
  catalog: BookOpen,
  'prompts-behavior': BookOpen,
  'skills-tools': Wrench,
  'routing-channels': GitBranch,
  handoffs: ChevronRight,
  hooks: Zap,
  versions: History,
  operations: Activity,
};

const MATRIX: Record<EntityLevel, EntitySection[]> = {
  agency: ['identity', 'catalog', 'routing-channels', 'hooks', 'versions', 'operations'],
  department: ['identity', 'routing-channels', 'hooks', 'versions', 'operations'],
  workspace: ['identity', 'prompts-behavior', 'skills-tools', 'routing-channels', 'hooks', 'versions', 'operations'],
  agent: ['identity', 'prompts-behavior', 'skills-tools', 'handoffs', 'routing-channels', 'hooks', 'versions', 'operations'],
  subagent: ['identity', 'prompts-behavior', 'skills-tools', 'handoffs', 'hooks', 'versions', 'operations'],
};

// ── Helpers ───────────────────────────────────────────────────────────────

function SectionLoading() {
  return (
    <div className="flex items-center gap-2 py-10 justify-center" style={{ color: 'var(--text-muted)' }}>
      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">Loading…</span>
    </div>
  );
}

function ReadOnlyBadge() {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
      <Lock size={11} />
      Read only
    </div>
  );
}

function SaveButton({ saving, onClick, disabled }: { saving: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={saving || disabled}
      onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
      style={{
        background: saving || disabled ? 'var(--bg-tertiary)' : 'var(--color-primary)',
        color: saving || disabled ? 'var(--text-muted)' : '#fff',
        opacity: saving ? 0.7 : 1,
      }}
    >
      {saving ? (
        <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Saving…</>
      ) : (
        <><Save size={13} /> Save Changes</>
      )}
    </button>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--input-border)',
    background: 'var(--input-bg)',
    color: 'var(--input-text)',
    padding: '8px 12px',
    fontSize: 14,
    outline: 'none',
  };
}

function labelStyle(): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' };
}

// ── Identity Section ─────────────────────────────────────────────────────

function IdentitySection({
  level,
  agent,
  workspace,
  onSaved,
}: {
  level: EntityLevel;
  agent: AgentSpec | null;
  workspace: WorkspaceSpec | null;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agent identity fields
  const [agentName, setAgentName] = useState(agent?.name ?? '');
  const [agentRole, setAgentRole] = useState(agent?.role ?? '');
  const [agentDescription, setAgentDescription] = useState(agent?.description ?? '');
  const [agentModel, setAgentModel] = useState(agent?.model ?? '');
  const [agentEnabled, setAgentEnabled] = useState(agent?.isEnabled ?? true);

  // Workspace identity fields
  const [wsName, setWsName] = useState(workspace?.name ?? '');
  const [wsDescription, setWsDescription] = useState(workspace?.description ?? '');
  const [wsOwner, setWsOwner] = useState(workspace?.owner ?? '');
  const [wsModel, setWsModel] = useState(workspace?.defaultModel ?? '');

  useEffect(() => {
    if (agent) {
      setAgentName(agent.name);
      setAgentRole(agent.role ?? '');
      setAgentDescription(agent.description ?? '');
      setAgentModel(agent.model ?? '');
      setAgentEnabled(agent.isEnabled ?? true);
    }
  }, [agent]);

  useEffect(() => {
    if (workspace) {
      setWsName(workspace.name);
      setWsDescription(workspace.description ?? '');
      setWsOwner(workspace.owner ?? '');
      setWsModel(workspace.defaultModel ?? '');
    }
  }, [workspace]);

  const handleSaveAgent = useCallback(async () => {
    if (!agent) return;
    setSaving(true);
    setError(null);
    try {
      await saveAgent({ ...agent, name: agentName, role: agentRole, description: agentDescription, model: agentModel, isEnabled: agentEnabled });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [agent, agentName, agentRole, agentDescription, agentModel, agentEnabled, onSaved]);

  const handleSaveWorkspace = useCallback(async () => {
    if (!workspace) return;
    setSaving(true);
    setError(null);
    try {
      await updateWorkspace({ ...workspace, name: wsName, description: wsDescription, owner: wsOwner, defaultModel: wsModel });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [workspace, wsName, wsDescription, wsOwner, wsModel, onSaved]);

  if (level === 'agency' || level === 'department') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Identity</p>
          <ReadOnlyBadge />
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {level === 'agency' ? 'Agency' : 'Department'} identity is managed through the canonical studio state. Editing is not supported from this surface.
        </p>
      </div>
    );
  }

  if ((level === 'agent' || level === 'subagent') && agent) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Agent Identity</p>
          {saved && <span className="text-xs font-semibold" style={{ color: 'var(--tone-success-text)' }}>Saved ✓</span>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle()}>Name</label>
            <input style={inputStyle()} value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Agent name" />
          </div>
          <div>
            <label style={labelStyle()}>Model</label>
            <input style={inputStyle()} value={agentModel} onChange={(e) => setAgentModel(e.target.value)} placeholder="e.g. claude-3-5-sonnet-20241022" />
          </div>
          <div className="md:col-span-2">
            <label style={labelStyle()}>Role</label>
            <input style={inputStyle()} value={agentRole} onChange={(e) => setAgentRole(e.target.value)} placeholder="e.g. Customer Support Agent" />
          </div>
          <div className="md:col-span-2">
            <label style={labelStyle()}>Description</label>
            <textarea
              rows={2}
              style={{ ...inputStyle(), resize: 'vertical' }}
              value={agentDescription}
              onChange={(e) => setAgentDescription(e.target.value)}
              placeholder="Brief description of what this agent does"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              className="relative w-8 h-4 rounded-full transition-colors"
              style={{ background: agentEnabled ? 'var(--color-primary)' : 'var(--border-primary)' }}
              onClick={() => setAgentEnabled(!agentEnabled)}
            >
              <div
                className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform"
                style={{ left: agentEnabled ? '17px' : '2px' }}
              />
            </div>
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Agent enabled</span>
          </label>
        </div>
        {error && <p className="text-xs" style={{ color: 'var(--tone-danger-text)' }}>{error}</p>}
        <SaveButton saving={saving} onClick={() => { void handleSaveAgent(); }} />
      </div>
    );
  }

  if (level === 'workspace' && workspace) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Workspace Identity</p>
          {saved && <span className="text-xs font-semibold" style={{ color: 'var(--tone-success-text)' }}>Saved ✓</span>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label style={labelStyle()}>Name</label>
            <input style={inputStyle()} value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Workspace name" />
          </div>
          <div>
            <label style={labelStyle()}>Default Model</label>
            <input style={inputStyle()} value={wsModel} onChange={(e) => setWsModel(e.target.value)} placeholder="e.g. claude-3-5-sonnet-20241022" />
          </div>
          <div>
            <label style={labelStyle()}>Owner</label>
            <input style={inputStyle()} value={wsOwner} onChange={(e) => setWsOwner(e.target.value)} placeholder="Owner name or team" />
          </div>
          <div>
            <label style={labelStyle()}>ID</label>
            <input style={{ ...inputStyle(), opacity: 0.6 }} value={workspace.id} disabled />
          </div>
          <div className="md:col-span-2">
            <label style={labelStyle()}>Description</label>
            <textarea
              rows={2}
              style={{ ...inputStyle(), resize: 'vertical' }}
              value={wsDescription}
              onChange={(e) => setWsDescription(e.target.value)}
              placeholder="Workspace description"
            />
          </div>
        </div>
        {error && <p className="text-xs" style={{ color: 'var(--tone-danger-text)' }}>{error}</p>}
        <SaveButton saving={saving} onClick={() => { void handleSaveWorkspace(); }} />
      </div>
    );
  }

  return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No entity data available for this context.</p>;
}

// ── Prompts/Behavior Section ──────────────────────────────────────────────

function PromptsBehaviorSection({
  level,
  agent,
  onSaved,
}: {
  level: EntityLevel;
  agent: AgentSpec | null;
  onSaved: () => void;
}) {
  const [instructions, setInstructions] = useState(agent?.instructions ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInstructions(agent?.instructions ?? '');
  }, [agent]);

  const handleSave = useCallback(async () => {
    if (!agent) return;
    setSaving(true);
    setError(null);
    try {
      await saveAgent({ ...agent, instructions });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [agent, instructions, onSaved]);

  if (level === 'workspace') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Behavior Configuration</p>
          <ReadOnlyBadge />
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Workspace-level behavior is inherited from the bound profile. Edit agent-level instructions for individual agents in this workspace.
        </p>
      </div>
    );
  }

  if (!agent) {
    return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No agent selected.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>System Instructions</p>
        {saved && <span className="text-xs font-semibold" style={{ color: 'var(--tone-success-text)' }}>Saved ✓</span>}
      </div>
      <div>
        <label style={labelStyle()}>Instructions</label>
        <textarea
          rows={10}
          style={{ ...inputStyle(), resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.6 }}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="You are a helpful assistant that..."
        />
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {instructions.length} characters
        </p>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--tone-danger-text)' }}>{error}</p>}
      <SaveButton saving={saving} onClick={() => { void handleSave(); }} />
    </div>
  );
}

// ── Skills/Tools Section ──────────────────────────────────────────────────

function SkillsToolsSection({
  level,
  agent,
  workspace,
  onSaved,
}: {
  level: EntityLevel;
  agent: AgentSpec | null;
  workspace: WorkspaceSpec | null;
  onSaved: () => void;
}) {
  const { state } = useStudioState();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (level === 'agent' || level === 'subagent') {
      setSelected(new Set(agent?.skillRefs ?? []));
    } else if (level === 'workspace') {
      setSelected(new Set(workspace?.skillIds ?? []));
    }
  }, [agent, workspace, level]);

  const handleToggle = (skillId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      if ((level === 'agent' || level === 'subagent') && agent) {
        await saveAgent({ ...agent, skillRefs: [...selected] });
      } else if (level === 'workspace' && workspace) {
        await updateWorkspace({ ...workspace, skillIds: [...selected] });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [agent, workspace, level, selected, onSaved]);

  const skills = state.skills ?? [];

  if (!skills.length) {
    return (
      <div className="py-6 text-center">
        <Wrench size={28} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No skills in the catalog.</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Add skills to the workspace catalog first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Skill Assignment</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{selected.size} of {skills.length} assigned</p>
        </div>
        {saved && <span className="text-xs font-semibold" style={{ color: 'var(--tone-success-text)' }}>Saved ✓</span>}
      </div>

      <div className="space-y-2">
        {skills.map((skill) => {
          const isChecked = selected.has(skill.id);
          return (
            <label
              key={skill.id}
              className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors"
              style={{
                borderColor: isChecked ? 'var(--color-primary)' : 'var(--border-primary)',
                background: isChecked ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => handleToggle(skill.id)}
                className="mt-0.5 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{skill.name}</p>
                <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{skill.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  {skill.category && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                      {skill.category}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{skill.functions?.length ?? 0} functions</span>
                </div>
              </div>
            </label>
          );
        })}
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--tone-danger-text)' }}>{error}</p>}
      <SaveButton saving={saving} onClick={() => { void handleSave(); }} />
    </div>
  );
}

// ── Handoffs Section ──────────────────────────────────────────────────────

function HandoffsSection({ agent }: { agent: AgentSpec | null }) {
  if (!agent) return <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No agent selected.</p>;

  const handoffs = agent.handoffRules ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Handoff Rules</p>
        <ReadOnlyBadge />
      </div>
      {!handoffs.length ? (
        <div className="py-6 text-center rounded-lg border border-dashed" style={{ borderColor: 'var(--border-primary)' }}>
          <ChevronRight size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No handoff rules defined</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Edit via the agent spec in the Studio</p>
        </div>
      ) : (
        <div className="space-y-2">
          {handoffs.map((rule) => (
            <div
              key={rule.id}
              className="rounded-lg border p-3"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>→</span>
                <code className="text-xs font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {rule.targetAgentId}
                </code>
                {rule.priority !== undefined && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                    priority {rule.priority}
                  </span>
                )}
              </div>
              <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--text-muted)' }}>When: <span style={{ color: 'var(--text-primary)' }}>{rule.when}</span></p>
              {rule.description && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{rule.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Routing & Channels Section ────────────────────────────────────────────

function RoutingChannelsSection({
  level,
  agent,
  workspace,
}: {
  level: EntityLevel;
  agent: AgentSpec | null;
  workspace: WorkspaceSpec | null;
}) {
  if (level === 'agent' || level === 'subagent') {
    const bindings = agent?.channelBindings ?? [];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Channel Bindings</p>
          <ReadOnlyBadge />
        </div>
        {!bindings.length ? (
          <div className="py-6 text-center rounded-lg border border-dashed" style={{ borderColor: 'var(--border-primary)' }}>
            <GitBranch size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No channel bindings configured</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bindings.map((b) => (
              <div
                key={b.id}
                className="rounded-lg border p-3 flex items-center justify-between gap-2"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{b.channel}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${b.enabled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}>
                      {b.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Route: {b.route}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (level === 'workspace') {
    const rules = workspace?.routingRules ?? [];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Routing Rules</p>
          <ReadOnlyBadge />
        </div>
        {!rules.length ? (
          <div className="py-6 text-center rounded-lg border border-dashed" style={{ borderColor: 'var(--border-primary)' }}>
            <GitBranch size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No routing rules defined</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="rounded-lg border p-3"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                <div className="flex items-center gap-2 text-xs">
                  <code style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{rule.from}</code>
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <code style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{rule.to}</code>
                  <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                    priority {rule.priority}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Condition: <span style={{ color: 'var(--text-primary)' }}>{rule.when}</span></p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Routing & Channels</p>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Routing configuration for this level is managed globally.</p>
    </div>
  );
}

// ── Hooks Section ─────────────────────────────────────────────────────────

function HooksSection() {
  const [hooks, setHooks] = useState<HookSpec[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getHooks()
      .then(setHooks)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load hooks'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SectionLoading />;
  if (error) return <p className="text-sm" style={{ color: 'var(--tone-danger-text)' }}>{error}</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Hooks</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{hooks?.length ?? 0} configured globally</p>
        </div>
        <ReadOnlyBadge />
      </div>
      {!hooks?.length ? (
        <div className="py-6 text-center rounded-lg border border-dashed" style={{ borderColor: 'var(--border-primary)' }}>
          <Zap size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No hooks configured</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Manage hooks in Settings → Automations</p>
        </div>
      ) : (
        <div className="space-y-2">
          {hooks.map((hook) => (
            <div
              key={hook.id}
              className="rounded-lg border p-3 flex items-center gap-3"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${hook.enabled ? 'bg-emerald-400' : 'bg-slate-300'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs font-semibold" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>{hook.event}</code>
                  <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>→ {hook.action}</span>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${hook.enabled ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}>
                {hook.enabled ? 'on' : 'off'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Versions Section ──────────────────────────────────────────────────────

function VersionsSection() {
  const [versions, setVersions] = useState<VersionSnapshot[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getVersions()
      .then(setVersions)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load versions'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SectionLoading />;
  if (error) return <p className="text-sm" style={{ color: 'var(--tone-danger-text)' }}>{error}</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Version Snapshots</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{versions?.length ?? 0} snapshots</p>
        </div>
        <ReadOnlyBadge />
      </div>
      {!versions?.length ? (
        <div className="py-6 text-center rounded-lg border border-dashed" style={{ borderColor: 'var(--border-primary)' }}>
          <History size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No snapshots</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Create a version snapshot to capture the current state</p>
        </div>
      ) : (
        <div className="space-y-2">
          {versions.slice(0, 8).map((v) => (
            <div
              key={v.id}
              className="rounded-lg border p-3"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{v.label ?? 'Snapshot'}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {new Date(v.createdAt).toLocaleString()}
                  </p>
                </div>
                <code className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{v.id.substring(0, 8)}</code>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Operations Section ────────────────────────────────────────────────────

function OperationsSection() {
  const { state } = useStudioState();
  const [runs, setRuns] = useState<RunSpec[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (state.runs?.length) {
      setRuns(state.runs);
      setLoading(false);
      return;
    }
    setLoading(true);
    getRuns()
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setLoading(false));
  }, [state.runs]);

  if (loading) return <SectionLoading />;

  const recentRuns = (runs ?? []).slice(0, 8);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Runs</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{recentRuns.length} shown</p>
        </div>
        <ReadOnlyBadge />
      </div>
      {!recentRuns.length ? (
        <div className="py-6 text-center rounded-lg border border-dashed" style={{ borderColor: 'var(--border-primary)' }}>
          <Activity size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No runs recorded</p>
        </div>
      ) : (
        <div className="space-y-2">
          {recentRuns.map((run) => {
            const status = run.status;
            const statusColor = status === 'completed' ? '#22c55e' : status === 'failed' ? '#ef4444' : status === 'running' ? '#3b82f6' : '#94a3b8';
            return (
              <div
                key={run.id}
                className="rounded-lg border p-3"
                style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                    <code className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                      {run.flowId}
                    </code>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded capitalize font-medium flex-shrink-0"
                    style={{
                      background: status === 'completed' ? '#f0fdf4' : status === 'failed' ? '#fef2f2' : 'var(--bg-tertiary)',
                      color: status === 'completed' ? '#166534' : status === 'failed' ? '#991b1b' : 'var(--text-muted)',
                    }}
                  >
                    {status}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {new Date(run.startedAt).toLocaleString()}
                  {run.steps && ` · ${run.steps.length} steps`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Catalog Section (agency level) ───────────────────────────────────────

function CatalogSection() {
  const { state } = useStudioState();
  const skills = state.skills ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Skill Catalog</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{skills.length} skills available</p>
        </div>
        <ReadOnlyBadge />
      </div>
      {!skills.length ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No skills in catalog.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="rounded-lg border p-3"
              style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
            >
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{skill.name}</p>
              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{skill.description}</p>
              <div className="flex items-center gap-2 mt-1.5">
                {skill.category && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                    {skill.category}
                  </span>
                )}
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>v{skill.version}</span>
                <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{skill.functions?.length ?? 0} fn</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── EntityEditorPage ──────────────────────────────────────────────────────

export default function EntityEditorPage() {
  const { selectedNode, selectedLineage, scope } = useHierarchy();
  const { state, refresh } = useStudioState();
  const [activeSection, setActiveSection] = useState<EntitySection>('identity');

  const level = selectedNode?.level;
  const entityLevel: EntityLevel | null =
    level === 'agency' || level === 'department' || level === 'workspace' || level === 'agent' || level === 'subagent'
      ? level
      : null;

  const sections = useMemo(() => (entityLevel ? MATRIX[entityLevel] : []), [entityLevel]);
  const contextLabel = selectedLineage.map((node) => node.label).join(' / ');

  // Ensure active section is valid for current level
  useEffect(() => {
    if (sections.length && !sections.includes(activeSection)) {
      setActiveSection(sections[0]);
    }
  }, [sections, activeSection]);

  // Resolve entity data
  const agent = useMemo<AgentSpec | null>(() => {
    if (!scope.agentId) return null;
    return state.agents.find((a) => a.id === scope.agentId) ?? null;
  }, [scope.agentId, state.agents]);

  const subagent = useMemo<AgentSpec | null>(() => {
    if (!scope.subagentId) return null;
    return state.agents.find((a) => a.id === scope.subagentId) ?? null;
  }, [scope.subagentId, state.agents]);

  const activeAgent = subagent ?? agent;
  const workspace = state.workspace;

  if (!entityLevel || !selectedNode) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Entity Editor"
          icon={SquarePen}
          description="Edit Agency, Department, Workspace, Agent and Subagent configuration from a single surface."
        />
        {!scope.agencyId && (
          <div
            style={{
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-primary)',
              background: 'var(--card-bg)',
              padding: 20,
              color: 'var(--text-muted)',
              fontSize: 14,
            }}
          >
            No agency selected. Create or connect an agency first.
          </div>
        )}
        <div
          style={{
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-primary)',
            background: 'var(--card-bg)',
            padding: 20,
            color: 'var(--text-muted)',
            fontSize: 14,
          }}
        >
          Select an entity node in the hierarchy tree to start editing.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Entity Editor"
        icon={SquarePen}
        description="Configure identity, behavior, skills, routing, and operations"
      />

      {/* Breadcrumb + Level Badge */}
      <div
        style={{
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-primary)',
          background: 'var(--card-bg)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 2 }}>
            Active Context
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>{contextLabel}</div>
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'capitalize',
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-primary-soft)',
            color: 'var(--color-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Users size={12} />
          {entityLevel}
        </div>
      </div>

      {/* Editor Layout: Section Nav + Content */}
      <div className="flex gap-0 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
        {/* Left Section Navigation */}
        <div
          className="flex-shrink-0"
          style={{
            width: 200,
            borderRight: '1px solid var(--border-primary)',
            background: 'var(--bg-secondary)',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              borderBottom: '1px solid var(--border-primary)',
            }}
          >
            {selectedNode.label}
          </div>
          <nav className="py-1">
            {sections.map((section) => {
              const Icon = SECTION_ICON[section];
              const isActive = activeSection === section;
              return (
                <button
                  key={section}
                  type="button"
                  onClick={() => setActiveSection(section)}
                  className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors"
                  style={{
                    background: isActive ? 'var(--color-primary-soft)' : 'transparent',
                    color: isActive ? 'var(--color-primary)' : 'var(--text-muted)',
                    borderLeft: isActive ? `2px solid var(--color-primary)` : '2px solid transparent',
                  }}
                >
                  <Icon size={14} />
                  {SECTION_LABEL[section]}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right Section Content */}
        <div className="flex-1 min-w-0 p-6">
          {activeSection === 'identity' && (
            <IdentitySection level={entityLevel} agent={activeAgent} workspace={workspace} onSaved={() => { void refresh(); }} />
          )}
          {activeSection === 'catalog' && <CatalogSection />}
          {activeSection === 'prompts-behavior' && (
            <PromptsBehaviorSection level={entityLevel} agent={activeAgent} onSaved={() => { void refresh(); }} />
          )}
          {activeSection === 'skills-tools' && (
            <SkillsToolsSection level={entityLevel} agent={activeAgent} workspace={workspace} onSaved={() => { void refresh(); }} />
          )}
          {activeSection === 'routing-channels' && (
            <RoutingChannelsSection level={entityLevel} agent={activeAgent} workspace={workspace} />
          )}
          {activeSection === 'handoffs' && <HandoffsSection agent={activeAgent} />}
          {activeSection === 'hooks' && <HooksSection />}
          {activeSection === 'versions' && <VersionsSection />}
          {activeSection === 'operations' && <OperationsSection />}
        </div>
      </div>
    </div>
  );
}
