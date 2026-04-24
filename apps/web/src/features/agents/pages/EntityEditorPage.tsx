import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SquarePen, Save, Lock, Users, GitBranch, Zap, History, Activity, ChevronRight, Target } from 'lucide-react';

import { PageHeader } from '../../../components';
import { useHierarchy } from '../../../lib/HierarchyContext';
import { useStudioState } from '../../../lib/StudioStateContext';
import {
  saveAgent,
  updateWorkspace,
  getEffectiveProfile,
  bindProfile,
  unbindProfile,
  saveProfileOverride,
  getHooks,
  getRuns,
  getEditorReadiness,
  getEditorSectionStatus,
  getEditorInheritance,
  getEditorVersions,
  getEditorReadinessByWorkspace,
  getEditorDependencies,
  getEditorPromptGraph,
  getEditorSectionDependencyImpact,
  getEditorRollbackRisk,
  getEditorSkillsTools,
  patchEditorSkillsTools,
} from '../../../lib/api';
import type { AgentSpec, EditorSkillsToolsDto, EffectiveProfileDto, HookSpec, RunSpec, WorkspaceSpec } from '../../../lib/types';
import { RadarChart } from '../../../components/ui/Charts';
import { AnalyticsStateBoundary } from '../../analytics/components/AnalyticsStateBoundary';
import { TimeWindowSelector } from '../../analytics/components/TimeWindowSelector';
import { useAnalyticsMetric } from '../../analytics/hooks/useAnalyticsMetric';
import type { AnalyticsWindow } from '../../analytics/types';
import { NODE_QUERY_KEY } from '../../../lib/studioRouting';
import { ProfileScopeTab } from '../../studio/components/admin/ProfileScopeTab';

type EntitySection =
  | 'identity'
  | 'catalog'
  | 'prompts-behavior'
  | 'skills-tools'
  | 'routing-channels'
  | 'handoffs'
  | 'hooks'
  | 'versions'
  | 'operations'
  | 'readiness';

type EntityLevel = 'agency' | 'department' | 'workspace' | 'agent' | 'subagent';
type BuilderCreateType = 'agency' | 'department' | 'workspace' | 'agent' | 'subagent';

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
  readiness: 'Readiness',
};

const MATRIX: Record<EntityLevel, EntitySection[]> = {
  agency:     ['identity', 'prompts-behavior', 'skills-tools', 'handoffs', 'routing-channels', 'hooks', 'versions', 'operations', 'readiness'],
  department: ['identity', 'prompts-behavior', 'skills-tools', 'handoffs', 'routing-channels', 'hooks', 'versions', 'operations', 'readiness'],
  workspace:  ['identity', 'prompts-behavior', 'skills-tools', 'handoffs', 'routing-channels', 'hooks', 'versions', 'operations', 'readiness'],
  agent:      ['identity', 'prompts-behavior', 'skills-tools', 'handoffs', 'routing-channels', 'hooks', 'versions', 'operations', 'readiness'],
  subagent:   ['identity', 'prompts-behavior', 'skills-tools', 'handoffs', 'routing-channels', 'hooks', 'versions', 'operations', 'readiness'],
};

type BuilderPrimaryTab = 'builder' | 'profile';

const PRIMARY_TAB_SECTIONS: Record<BuilderPrimaryTab, EntitySection[]> = {
  builder: ['identity', 'prompts-behavior', 'skills-tools', 'handoffs', 'routing-channels', 'hooks', 'versions', 'operations', 'readiness'],
  profile: [],
};

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SectionLoading() {
  return (
    <div className="flex items-center gap-2 py-10 justify-center" style={{ color: 'var(--text-muted)' }}>
      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">Loadingâ€¦</span>
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
        <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Savingâ€¦</>
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

// â”€â”€ Identity Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          {saved && <span className="text-xs font-semibold" style={{ color: 'var(--tone-success-text)' }}>Saved âœ“</span>}
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
          {saved && <span className="text-xs font-semibold" style={{ color: 'var(--tone-success-text)' }}>Saved âœ“</span>}
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

// â”€â”€ Prompts/Behavior Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        {saved && <span className="text-xs font-semibold" style={{ color: 'var(--tone-success-text)' }}>Saved âœ“</span>}
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

// â”€â”€ Skills/Tools Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const [catalog, setCatalog] = useState<EditorSkillsToolsDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());

  const scopeId = (level === 'agent' || level === 'subagent') ? agent?.id : workspace?.id;

  const loadCatalog = useCallback(async () => {
    if (!scopeId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getEditorSkillsTools(level, scopeId);
      setCatalog(next);
      setSelectedSkills(new Set(next.effective.skills));
      setSelectedTools(new Set(next.effective.tools));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills/tools assignments');
    } finally {
      setLoading(false);
    }
  }, [level, scopeId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const handleToggleSkill = (skillId: string) => {
    setSelectedSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  };

  const handleToggleTool = (toolId: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  const handleSave = useCallback(async () => {
    if (!scopeId) return;
    setSaving(true);
    setError(null);
    try {
      await patchEditorSkillsTools({
        level,
        id: scopeId,
        skills: { select: [...selectedSkills] },
        tools: { select: [...selectedTools] },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
      await loadCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [level, loadCatalog, onSaved, scopeId, selectedSkills, selectedTools]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Skills / Tools Assignment</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {selectedSkills.size} skills · {selectedTools.size} tools selected
          </p>
        </div>
        {saved && <span className="text-xs font-semibold" style={{ color: 'var(--tone-success-text)' }}>Saved</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Available Skills</p>
          {loading && <SectionLoading />}
          {!loading && (catalog?.skills ?? []).map((skill) => {
            const isBlocked = skill.state === 'blocked' || skill.state === 'disabled';
            const isChecked = selectedSkills.has(skill.id);
            return (
              <label key={skill.id} className="flex items-start gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)', opacity: isBlocked ? 0.65 : 1 }}>
                <input type="checkbox" checked={isChecked} disabled={isBlocked} onChange={() => handleToggleSkill(skill.id)} className="mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{skill.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{skill.description ?? 'No description'}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    source: {skill.source}{skill.blockedReason ? ` · blocked: ${skill.blockedReason}` : ''}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Available Tools</p>
          {loading && <SectionLoading />}
          {!loading && (catalog?.tools ?? []).map((tool) => {
            const isBlocked = tool.state === 'blocked' || tool.state === 'disabled';
            const isChecked = selectedTools.has(tool.id);
            return (
              <label key={tool.id} className="flex items-start gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)', opacity: isBlocked ? 0.65 : 1 }}>
                <input type="checkbox" checked={isChecked} disabled={isBlocked} onChange={() => handleToggleTool(tool.id)} className="mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{tool.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{tool.description ?? 'No description'}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    source: {tool.source}{tool.blockedReason ? ` · blocked: ${tool.blockedReason}` : ''}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {catalog && (
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
          <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Effective Assignment</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Skills: {catalog.effective.skills.join(', ') || 'None'} · Tools: {catalog.effective.tools.join(', ') || 'None'}
          </p>
        </div>
      )}

      {error && <p className="text-xs" style={{ color: 'var(--tone-danger-text)' }}>{error}</p>}
      <SaveButton saving={saving} onClick={() => { void handleSave(); }} />
    </div>
  );
}

// â”€â”€ Handoffs Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>â†’</span>
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

// â”€â”€ Routing & Channels Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
                  <span style={{ color: 'var(--text-muted)' }}>â†’</span>
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

// â”€â”€ Hooks Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Manage hooks in Settings â†’ Automations</p>
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
                  <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>â†’ {hook.action}</span>
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

// â”€â”€ Versions Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function VersionsSection({
  level,
  entityId,
}: {
  level: EntityLevel;
  entityId: string;
}) {
  const [window, setWindow] = useState<AnalyticsWindow>('24H');

  const versionsMetric = useAnalyticsMetric({
    level,
    id: entityId,
    window,
    fetcher: (lvl, scopeId, selectedWindow) => getEditorVersions(lvl, scopeId, selectedWindow),
    getState: (payload) => payload.state as any,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Versions Timeline</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Contract-backed versions for {level}:{entityId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ReadOnlyBadge />
          <TimeWindowSelector value={window} onChange={setWindow} />
        </div>
      </div>

      <AnalyticsStateBoundary state={versionsMetric.state} title="Versions timeline">
        {!versionsMetric.data?.data?.length ? (
          <div className="py-6 text-center rounded-lg border border-dashed" style={{ borderColor: 'var(--border-primary)' }}>
            <History size={24} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No versions</p>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 10, top: 0, bottom: 0, width: 2, background: 'var(--border-primary)' }} />
            <div className="space-y-2" style={{ paddingLeft: 28 }}>
              {versionsMetric.data.data.slice(0, 12).map((v, idx) => (
                <div
                  key={v.id}
                  style={{
                    position: 'relative',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-primary)',
                    background: v.status === 'current' ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
                    padding: '8px 12px',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: -24,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: v.status === 'current' ? 'var(--color-primary)' : 'var(--border-primary)',
                      border: '2px solid var(--bg-primary)',
                    }}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: v.status === 'current' ? 'var(--color-primary)' : 'var(--text-primary)' }}>
                        {v.label}
                        {idx === 0 && (
                          <span style={{ fontSize: 9, marginLeft: 6, fontWeight: 700, textTransform: 'uppercase', background: 'var(--color-primary)', color: '#fff', padding: '1px 5px', borderRadius: 999 }}>
                            latest
                          </span>
                        )}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {new Date(v.at).toLocaleString()}
                      </p>
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{v.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </AnalyticsStateBoundary>

      {versionsMetric.error && (
        <p className="text-xs" style={{ color: 'var(--tone-danger-text)' }}>{versionsMetric.error}</p>
      )}
    </div>
  );
}

// â”€â”€ Operations Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
                  {run.steps && ` Â· ${run.steps.length} steps`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// â”€â”€ Catalog Section (agency level) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Readiness Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ReadinessSection({
  level,
  entityId,
}: {
  level: EntityLevel;
  entityId: string;
}) {
  const [window, setWindow] = useState<AnalyticsWindow>('24H');

  const readinessMetric = useAnalyticsMetric({
    level,
    id: entityId,
    window,
    fetcher: (lvl, scopeId, selectedWindow) => getEditorReadiness(lvl, scopeId, selectedWindow),
    getState: (payload) => payload.state as any,
  });

  const sectionStatusMetric = useAnalyticsMetric({
    level,
    id: entityId,
    window,
    fetcher: (lvl, scopeId, selectedWindow) => getEditorSectionStatus(lvl, scopeId, selectedWindow),
    getState: (payload) => payload.state as any,
  });

  const inheritanceMetric = useAnalyticsMetric({
    level,
    id: entityId,
    window,
    fetcher: (lvl, scopeId, selectedWindow) => getEditorInheritance(lvl, scopeId, selectedWindow),
    getState: (payload) => payload.state as any,
  });

  const readinessByWorkspaceMetric = useAnalyticsMetric({
    level,
    id: entityId,
    window,
    fetcher: (lvl, scopeId, selectedWindow) => getEditorReadinessByWorkspace(lvl, scopeId, selectedWindow),
    getState: (payload) => payload.state as any,
  });

  const dependenciesMetric = useAnalyticsMetric({
    level,
    id: entityId,
    window,
    fetcher: (lvl, scopeId, selectedWindow) => getEditorDependencies(lvl, scopeId, selectedWindow),
    getState: (payload) => payload.state as any,
  });

  const promptGraphMetric = useAnalyticsMetric({
    level,
    id: entityId,
    window,
    fetcher: (lvl, scopeId, selectedWindow) => getEditorPromptGraph(lvl, scopeId, selectedWindow),
    getState: (payload) => payload.state as any,
  });

  const sectionImpactMetric = useAnalyticsMetric({
    level,
    id: entityId,
    window,
    fetcher: (lvl, scopeId, selectedWindow) => getEditorSectionDependencyImpact(lvl, scopeId, selectedWindow),
    getState: (payload) => payload.state as any,
  });

  const rollbackRiskMetric = useAnalyticsMetric({
    level,
    id: entityId,
    window,
    fetcher: (lvl, scopeId, selectedWindow) => getEditorRollbackRisk(lvl, scopeId, selectedWindow),
    getState: (payload) => payload.state as any,
  });

  const axes = useMemo(
    () =>
      (readinessMetric.data?.data ?? []).map((item) => ({
        label: item.dimension,
        value: Math.max(0, Math.min(1, item.score)),
      })),
    [readinessMetric.data],
  );

  const overallPct = axes.length > 0 ? Math.round((axes.reduce((sum, a) => sum + a.value, 0) / axes.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Config Readiness</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {overallPct}% complete across {axes.length} dimensions (contract-backed)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: overallPct >= 80 ? 'var(--tone-success-text, #10b981)' : overallPct >= 50 ? 'var(--tone-warning-text, #f59e0b)' : 'var(--tone-danger-text, #ef4444)',
            }}
          >
            {overallPct}%
          </div>
          <TimeWindowSelector value={window} onChange={setWindow} />
        </div>
      </div>

      <AnalyticsStateBoundary state={readinessMetric.state} title="Readiness radar">
        {axes.length >= 3 && (
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <RadarChart axes={axes} size={160} color="var(--color-primary)" />
            <div style={{ flex: 1, minWidth: 120, display: 'grid', gap: 8 }}>
              {axes.map((axis) => {
                const pct = Math.round(axis.value * 100);
                const color = pct >= 80 ? 'var(--tone-success-text, #10b981)' : pct >= 40 ? 'var(--tone-warning-text, #f59e0b)' : 'var(--tone-danger-text, #ef4444)';
                return (
                  <div key={axis.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{axis.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color }}>{pct}%</span>
                    </div>
                    <div style={{ height: 3, background: 'var(--border-primary)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </AnalyticsStateBoundary>

      <AnalyticsStateBoundary state={sectionStatusMetric.state} title="Section stepper">
        <div style={{ display: 'grid', gap: 8 }}>
          {(sectionStatusMetric.data?.data ?? []).map((row, index) => {
            const tone =
              row.status === 'complete'
                ? 'var(--tone-success-text, #10b981)'
                : row.status === 'in_progress'
                  ? 'var(--color-primary)'
                  : row.status === 'blocked'
                    ? 'var(--tone-danger-text, #ef4444)'
                    : 'var(--text-muted)';
            return (
              <div key={`${row.section}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: 999, border: `1px solid ${tone}`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
                  {index + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{row.section}</div>
                  <div style={{ fontSize: 10, color: tone, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.status.replace('_', ' ')}</div>
                </div>
              </div>
            );
          })}
        </div>
      </AnalyticsStateBoundary>

      <AnalyticsStateBoundary state={inheritanceMetric.state} title="Inheritance matrix">
        <div
          className="rounded-lg border overflow-hidden"
          style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
        >
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid var(--border-primary)',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: 'var(--text-muted)',
            }}
          >
            Inheritance &amp; Override Matrix
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['Field', 'Effective Value', 'Source'].map((h) => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-primary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(inheritanceMetric.data?.data ?? []).map((row, i) => (
                <tr key={`${row.field}-${i}`} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-primary)' }}>
                  <td style={{ padding: '5px 10px', color: 'var(--text-muted)', fontWeight: 600 }}>{row.field}</td>
                  <td style={{ padding: '5px 10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{row.effectiveValue}</td>
                  <td style={{ padding: '5px 10px' }}>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        borderRadius: 999,
                        padding: '1px 6px',
                        background: row.source === 'local_override' ? 'var(--tone-warning-bg, rgba(245,158,11,0.08))' : 'var(--bg-tertiary)',
                        color: row.source === 'local_override' ? 'var(--tone-warning-text, #f59e0b)' : 'var(--text-muted)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {row.source.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AnalyticsStateBoundary>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnalyticsStateBoundary state={readinessByWorkspaceMetric.state} title="Workspace readiness (P1)">
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
          >
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-primary)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
              Workspace Readiness Bars (P1)
            </div>
            <div style={{ padding: 10, display: 'grid', gap: 8 }}>
              {(readinessByWorkspaceMetric.data?.data ?? []).slice(0, 8).map((row) => (
                <div key={row.workspaceId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>{row.workspaceName}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{row.readinessPct}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 99, background: 'var(--border-primary)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, row.readinessPct))}%`, height: '100%', background: 'var(--color-primary)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AnalyticsStateBoundary>

        <AnalyticsStateBoundary state={dependenciesMetric.state} title="Dependency tree (P1)">
          <div
            className="rounded-lg border overflow-hidden"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
          >
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-primary)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
              Dependency Tree (P1)
            </div>
            <div style={{ padding: 10, display: 'grid', gap: 6 }}>
              {(dependenciesMetric.data?.edges ?? []).slice(0, 10).map((edge, idx) => (
                <div key={`${edge.from}-${edge.to}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{edge.from} â†’ {edge.to}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{edge.kind}</span>
                </div>
              ))}
            </div>
          </div>
        </AnalyticsStateBoundary>
      </div>

      {(readinessMetric.error || sectionStatusMetric.error || inheritanceMetric.error || readinessByWorkspaceMetric.error || dependenciesMetric.error) && (
        <p className="text-xs" style={{ color: 'var(--tone-danger-text)' }}>
          {readinessMetric.error ?? sectionStatusMetric.error ?? inheritanceMetric.error ?? readinessByWorkspaceMetric.error ?? dependenciesMetric.error}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AnalyticsStateBoundary state={promptGraphMetric.state} title="Prompt graph (P2)">
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Prompt Graph (P2)</div>
            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
              {(promptGraphMetric.data?.edges ?? []).map((edge, idx) => (
                <div key={`${edge.from}-${edge.to}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 10 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{edge.from} â†’ {edge.to}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{edge.weight.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </AnalyticsStateBoundary>

        <AnalyticsStateBoundary state={sectionImpactMetric.state} title="Section dependency impact (P2)">
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Section Dependency Impact (P2)</div>
            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
              {(sectionImpactMetric.data?.rows ?? []).map((row, idx) => (
                <div key={`${row.section}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 10 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{row.section}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{row.impactScore}</span>
                </div>
              ))}
            </div>
          </div>
        </AnalyticsStateBoundary>

        <AnalyticsStateBoundary state={rollbackRiskMetric.state} title="Rollback risk (P2)">
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rollback Risk (P2)</div>
            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
              {(rollbackRiskMetric.data?.versions ?? []).slice(0, 6).map((row) => (
                <div key={row.versionId} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, fontSize: 10 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{row.label}</span>
                  <span style={{ color: row.riskScore > 70 ? 'var(--tone-danger-text, #ef4444)' : 'var(--text-muted)' }}>{row.riskScore}</span>
                </div>
              ))}
            </div>
          </div>
        </AnalyticsStateBoundary>
      </div>
    </div>
  );
}

// â”€â”€ EntityEditorPage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function EntityEditorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tree, selectedNode, selectedLineage, scope, selectByEntity } = useHierarchy();
  const { state, refresh } = useStudioState();
  const [activeSection, setActiveSection] = useState<EntitySection>('identity');
  const [activePrimaryTab, setActivePrimaryTab] = useState<BuilderPrimaryTab>('builder');
  const [createName, setCreateName] = useState('');
  const [createModel, setCreateModel] = useState('');
  const [createRole, setCreateRole] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createCreature, setCreateCreature] = useState('');
  const [createVibe, setCreateVibe] = useState('');
  const [createEmoji, setCreateEmoji] = useState('');
  const [createAvatar, setCreateAvatar] = useState('');
  const [createSystemPrompt, setCreateSystemPrompt] = useState('');
  const [createPersonalityGuide, setCreatePersonalityGuide] = useState('');
  const [createHumanContext, setCreateHumanContext] = useState('');
  const [createAllowedChannels, setCreateAllowedChannels] = useState('');
  const [createLocalNotes, setCreateLocalNotes] = useState('');
  const [createEscalationPolicy, setCreateEscalationPolicy] = useState('');
  const [createApprovalLane, setCreateApprovalLane] = useState('');
  const [createHeartbeatEnabled, setCreateHeartbeatEnabled] = useState(false);
  const [createQuietHoursStart, setCreateQuietHoursStart] = useState('23:00');
  const [createQuietHoursEnd, setCreateQuietHoursEnd] = useState('08:00');
  const [createMemoryScope, setCreateMemoryScope] = useState<'main_session_only' | 'shared_safe' | 'disabled'>('main_session_only');
  const [createSafetyApproval, setCreateSafetyApproval] = useState(true);
  const [createHorizontalLinks, setCreateHorizontalLinks] = useState('');
  const [createSection, setCreateSection] = useState<EntitySection>('identity');
  const [profilePanel, setProfilePanel] = useState<EffectiveProfileDto | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const createMode = searchParams.get('mode') === 'create';
  const createTypeRaw = searchParams.get('type');
  const createTypeFromQuery: BuilderCreateType =
    createTypeRaw === 'agency' ||
    createTypeRaw === 'department' ||
    createTypeRaw === 'workspace' ||
    createTypeRaw === 'subagent'
      ? createTypeRaw
      : 'agent';
  const requestedParentWorkspaceId = searchParams.get('parentWorkspaceId');
  const requestedParentAgentId = searchParams.get('parentAgentId');
  const requestedProfileId = searchParams.get('profileId');

  const level = selectedNode?.level;
  const entityLevel: EntityLevel | null =
    level === 'agency' || level === 'department' || level === 'workspace' || level === 'agent' || level === 'subagent'
      ? level
      : null;

  const sections = useMemo(() => (entityLevel ? MATRIX[entityLevel] : []), [entityLevel]);
  const contextLabel = selectedLineage.map((node) => node.label).join(' / ');
  const activePrimarySections = useMemo(
    () => PRIMARY_TAB_SECTIONS[activePrimaryTab].filter((section) => sections.includes(section)),
    [activePrimaryTab, sections],
  );

  // Ensure active section is valid for current level
  useEffect(() => {
    if (sections.length && !sections.includes(activeSection)) {
      setActiveSection(sections[0]);
    }
  }, [sections, activeSection]);

  useEffect(() => {
    if (activePrimaryTab !== 'profile' && !activePrimarySections.includes(activeSection)) {
      setActiveSection(activePrimarySections[0] ?? 'identity');
    }
  }, [activePrimarySections, activePrimaryTab, activeSection]);

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
  const selectedCreateContextLevel = selectedNode?.level
    ?? (scope.subagentId ? 'subagent'
      : scope.agentId ? 'agent'
      : scope.workspaceId ? 'workspace'
      : scope.departmentId ? 'department'
      : scope.agencyId ? 'agency'
      : null);
  const workspace = state.workspace;
  const profileCatalog = useMemo(() => state.profiles ?? [], [state.profiles]);
  const profilePrefill = requestedProfileId ? state.profiles.find((item) => item.id === requestedProfileId) ?? null : null;
  const workspaceOptions = useMemo(
    () =>
      Object.values(tree.nodes)
        .filter((node) => node.level === 'workspace')
        .map((node) => ({ id: node.id, label: node.label })),
    [tree.nodes],
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    requestedParentWorkspaceId ?? scope.workspaceId ?? workspaceOptions[0]?.id ?? '',
  );
  const [createKind, setCreateKind] = useState<BuilderCreateType>(createTypeFromQuery);

  useEffect(() => {
    if (createMode || !entityLevel || !selectedNode?.id) return;
    let cancelled = false;
    setProfilePanel(null);
    setProfileError(null);
    getEffectiveProfile(entityLevel, selectedNode.id)
      .then((next) => {
        if (!cancelled) setProfilePanel(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setProfileError(err instanceof Error ? err.message : 'Failed to load profile');
      });
    return () => {
      cancelled = true;
    };
  }, [createMode, entityLevel, selectedNode?.id]);

  useEffect(() => {
    if (!createMode) return;
    setSelectedWorkspaceId(requestedParentWorkspaceId ?? scope.workspaceId ?? workspaceOptions[0]?.id ?? '');
  }, [createMode, requestedParentWorkspaceId, scope.workspaceId, workspaceOptions]);

  useEffect(() => {
    if (!createMode) return;
    if (createTypeFromQuery === 'agency' || createTypeFromQuery === 'department' || createTypeFromQuery === 'workspace') {
      setCreateKind(createTypeFromQuery);
      return;
    }
    if (createTypeFromQuery === 'subagent') {
      setCreateKind('subagent');
      return;
    }
    if (selectedCreateContextLevel === 'agent' || selectedCreateContextLevel === 'subagent') {
      setCreateKind('subagent');
      return;
    }
    setCreateKind('agent');
  }, [createMode, createTypeFromQuery, selectedCreateContextLevel]);

  useEffect(() => {
    if (!profilePrefill) return;
    if (!createModel && profilePrefill.defaultModel) setCreateModel(profilePrefill.defaultModel);
  }, [createModel, profilePrefill]);

  const handleCreateAgent = useCallback(async () => {
    if (createKind === 'agency' || createKind === 'department' || createKind === 'workspace') {
      setCreateError(`Creation for ${createKind} is now routed through Agents Builder context, but backend persistence for this level is not wired yet.`);
      return;
    }

    const parentWorkspaceId = selectedWorkspaceId || scope.workspaceId || workspace?.id;
    if (!parentWorkspaceId) {
      setCreateError('Select a parent workspace before creating an agent.');
      return;
    }
    if (!createName.trim()) {
      setCreateError('Agent name is required.');
      return;
    }
    const nextId = `${createKind}-${Date.now()}`;
    const currentAgentId = requestedParentAgentId ?? (selectedNode?.level === 'agent'
      ? selectedNode.id
      : selectedNode?.level === 'subagent'
        ? (selectedNode.parentKey?.split(':')[1] ?? scope.agentId ?? undefined)
        : scope.agentId ?? undefined);
    const parentAgentId = createKind === 'subagent' ? currentAgentId : undefined;
    if (createKind === 'subagent' && !parentAgentId) {
      setCreateError('To create a subagent, select an agent in hierarchy first.');
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      await saveAgent(({
        id: nextId,
        parentWorkspaceId,
        workspaceId: parentWorkspaceId,
        name: createName.trim(),
        role: createRole || 'Agent',
        description: createDescription || '',
        instructions: createSystemPrompt,
        model: createModel || profilePrefill?.defaultModel || workspace?.defaultModel || '',
        skillRefs: profilePrefill?.defaultSkills ?? [],
        tags: [
          ...(profilePrefill?.tags ?? []),
          ...createHorizontalLinks
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => `shared-with:${item}`),
        ],
        visibility: 'workspace',
        executionMode: 'direct',
        kind: createKind,
        parentAgentId,
        handoffRules: [],
        channelBindings: [],
        identity: {
          name: createName.trim(),
          creature: createCreature,
          role: createRole || 'Agent',
          description: createDescription || '',
          vibe: createVibe,
          emoji: createEmoji,
          avatar: createAvatar,
        },
        behavior: {
          systemPrompt: createSystemPrompt,
          personalityGuide: createPersonalityGuide,
          operatingPrinciples: [],
          boundaries: [],
          privacyRules: [],
          continuityRules: [],
          responseStyle: '',
        },
        humanContext: {
          context: createHumanContext,
        },
        skillsTools: {
          assignedSkills: profilePrefill?.defaultSkills ?? [],
          enabledTools: [],
          localNotes: createLocalNotes,
          environmentNotes: '',
        },
        handoffs: {
          allowedTargets: [],
          escalationPolicy: createEscalationPolicy,
          approvalLane: createApprovalLane,
          internalActionsAllowed: [],
          externalActionsRequireApproval: [],
          publicPostingRequiresApproval: true,
        },
        routingChannels: {
          allowedChannels: createAllowedChannels.split(',').map((item) => item.trim()).filter(Boolean),
          groupChatMode: 'respond_when_mentioned',
          reactionPolicy: 'limited',
          maxReactionsPerMessage: 1,
          avoidTripleTap: true,
          platformFormattingRules: '',
          responseTriggerPolicy: '',
        },
        hooks: {
          heartbeat: {
            enabled: createHeartbeatEnabled,
            promptSource: createHeartbeatEnabled ? 'inline' : 'disabled',
            quietHoursStart: createQuietHoursStart,
            quietHoursEnd: createQuietHoursEnd,
          },
          lifecycleHooks: [],
          proactiveChecks: [],
          cronHooks: [],
        },
        operations: {
          startup: {
            readSoul: true,
            readUser: true,
            readDailyMemory: true,
            readLongTermMemoryInMainSessionOnly: true,
          },
          memoryPolicy: {
            dailyNotesEnabled: true,
            longTermMemoryEnabled: true,
            memoryScope: createMemoryScope,
          },
          safety: {
            destructiveCommandsRequireApproval: createSafetyApproval,
            externalActionsRequireApproval: createSafetyApproval,
            privateDataProtection: true,
            recoverableDeletePreferred: true,
          },
        },
        isEnabled: true,
      }) as AgentSpec & { parentWorkspaceId: string });
      await refresh();
      selectByEntity(createKind === 'subagent' ? 'subagent' : 'agent', nextId);
      navigate(`/entity-editor?${NODE_QUERY_KEY}=${createKind === 'subagent' ? 'subagent' : 'agent'}:${nextId}`, { replace: true });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setCreateBusy(false);
    }
  }, [createDescription, createHorizontalLinks, createKind, createModel, createName, createRole, navigate, profilePrefill, refresh, requestedParentAgentId, scope.agentId, scope.workspaceId, selectByEntity, selectedNode, selectedWorkspaceId, workspace?.defaultModel]);

  const refreshProfilePanel = useCallback(async () => {
    if (!entityLevel || !selectedNode?.id) return;
    setProfilePanel(await getEffectiveProfile(entityLevel, selectedNode.id));
  }, [entityLevel, selectedNode?.id]);

  const handleBindProfilePanel = useCallback(async (profileId: string) => {
    if (!entityLevel || !selectedNode?.id || !profileId) return;
    setProfileBusy(true);
    setProfileError(null);
    try {
      await bindProfile(entityLevel, selectedNode.id, profileId);
      await refreshProfilePanel();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to bind profile');
    } finally {
      setProfileBusy(false);
    }
  }, [entityLevel, refreshProfilePanel, selectedNode?.id]);

  const handleUnbindProfilePanel = useCallback(async () => {
    if (!entityLevel || !selectedNode?.id) return;
    setProfileBusy(true);
    setProfileError(null);
    try {
      await unbindProfile(entityLevel, selectedNode.id);
      await refreshProfilePanel();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to unbind profile');
    } finally {
      setProfileBusy(false);
    }
  }, [entityLevel, refreshProfilePanel, selectedNode?.id]);

  const handleSaveProfileOverridePanel = useCallback(async (payload: { model?: string; skills?: string[] }) => {
    if (!entityLevel || !selectedNode?.id) return;
    setProfileBusy(true);
    setProfileError(null);
    try {
      await saveProfileOverride(entityLevel, selectedNode.id, payload);
      await refreshProfilePanel();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to save override');
    } finally {
      setProfileBusy(false);
    }
  }, [entityLevel, refreshProfilePanel, selectedNode?.id]);

  if (createMode) {
    const createSections: EntitySection[] = [
      'identity',
      'prompts-behavior',
      'skills-tools',
      'handoffs',
      'routing-channels',
      'hooks',
      'versions',
      'operations',
      'readiness',
    ];
    const readinessChecks = {
      identityComplete: Boolean(createName.trim() && createCreature.trim() && createVibe.trim()),
      behaviorComplete: Boolean(createSystemPrompt.trim()),
      toolsAssigned: Boolean((profilePrefill?.defaultSkills?.length ?? 0) > 0 || createLocalNotes.trim()),
      routingConfigured: Boolean(createAllowedChannels.split(',').map((item) => item.trim()).filter(Boolean).length > 0),
      hooksConfigured: createHeartbeatEnabled || createQuietHoursStart.length > 0 || createQuietHoursEnd.length > 0,
      operationsConfigured: createSafetyApproval && Boolean(createMemoryScope),
      versionsReady: Boolean(createName.trim()),
    };
    const readinessItems: Array<{ key: string; ok: boolean; label: string }> = [
      { key: 'identity', ok: readinessChecks.identityComplete, label: 'Identity' },
      { key: 'behavior', ok: readinessChecks.behaviorComplete, label: 'Behavior' },
      { key: 'tools', ok: readinessChecks.toolsAssigned, label: 'Skills / Tools' },
      { key: 'routing', ok: readinessChecks.routingConfigured, label: 'Routing / Channels' },
      { key: 'hooks', ok: readinessChecks.hooksConfigured, label: 'Hooks' },
      { key: 'ops', ok: readinessChecks.operationsConfigured, label: 'Operations' },
      { key: 'versions', ok: readinessChecks.versionsReady, label: 'Versions Preview' },
    ];

    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title={`Agents Builder · Create ${createKind.charAt(0).toUpperCase()}${createKind.slice(1)}`}
          icon={SquarePen}
          description="Single create surface with explicit context, hierarchy-aware defaults, and 9 builder sections."
        />
        <div className="space-y-4">
          <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
              {createSections.map((section) => (
                <button
                  key={section}
                  type="button"
                  onClick={() => setCreateSection(section)}
                  style={{ ...buttonStyle, background: createSection === section ? 'var(--color-primary-soft)' : 'var(--bg-primary)', color: createSection === section ? 'var(--color-primary)' : 'var(--text-primary)' }}
                >
                  {SECTION_LABEL[section]}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: 'var(--border-primary)', background: 'var(--card-bg)' }}>
            <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
              <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>Creation Context</p>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                Selected level: <strong>{selectedCreateContextLevel ?? 'none'}</strong> · Creating: <strong>{createKind}</strong>
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Vertical inheritance: Agency → Department → Workspace → Agent → Subagent. Horizontal links can be defined for shared dependencies between same-level entities.
              </p>
              <div>
                <label style={labelStyle()}>Horizontal sharing links (same-level IDs, comma-separated)</label>
                <input
                  style={inputStyle()}
                  value={createHorizontalLinks}
                  onChange={(event) => setCreateHorizontalLinks(event.target.value)}
                  placeholder="marketing, growth, ads-workspace, agent-copywriter"
                />
              </div>
            </div>

            {createSection === 'identity' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label style={labelStyle()}>Parent Workspace</label><select style={inputStyle()} value={selectedWorkspaceId} onChange={(e) => setSelectedWorkspaceId(e.target.value)}><option value="">Select workspace</option>{workspaceOptions.map((item) => (<option key={item.id} value={item.id}>{item.label}</option>))}</select></div>
                <div><label style={labelStyle()}>Profile source</label><input style={inputStyle()} value={profilePrefill?.name ?? 'blank'} disabled /></div>
                <div><label style={labelStyle()}>Name</label><input style={inputStyle()} value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Pick a name for this agent" /></div>
                <div><label style={labelStyle()}>Creature</label><input style={inputStyle()} value={createCreature} onChange={(e) => setCreateCreature(e.target.value)} placeholder="AI assistant, orchestrator, dev agent..." /></div>
                <div><label style={labelStyle()}>Role</label><input style={inputStyle()} value={createRole} onChange={(e) => setCreateRole(e.target.value)} placeholder="What kind of agent is this?" /></div>
                <div><label style={labelStyle()}>Vibe</label><input style={inputStyle()} value={createVibe} onChange={(e) => setCreateVibe(e.target.value)} placeholder="warm, sharp, calm, direct..." /></div>
                <div><label style={labelStyle()}>Emoji</label><input style={inputStyle()} value={createEmoji} onChange={(e) => setCreateEmoji(e.target.value)} placeholder="Signature emoji" /></div>
                <div><label style={labelStyle()}>Avatar URL</label><input style={inputStyle()} value={createAvatar} onChange={(e) => setCreateAvatar(e.target.value)} placeholder="Workspace path or URL" /></div>
                <div className="md:col-span-2"><label style={labelStyle()}>Description</label><input style={inputStyle()} value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} placeholder="Agent mission summary" /></div>
              </div>
            )}

            {createSection === 'prompts-behavior' && (
              <div className="space-y-4">
                <div><label style={labelStyle()}>System Prompt</label><textarea rows={5} style={{ ...inputStyle(), resize: 'vertical' }} value={createSystemPrompt} onChange={(e) => setCreateSystemPrompt(e.target.value)} placeholder="Describe the agent's core mission and operating mode." /></div>
                <div><label style={labelStyle()}>Personality Guide</label><textarea rows={3} style={{ ...inputStyle(), resize: 'vertical' }} value={createPersonalityGuide} onChange={(e) => setCreatePersonalityGuide(e.target.value)} placeholder="How should this agent sound and behave?" /></div>
                <div><label style={labelStyle()}>Human Context</label><textarea rows={3} style={{ ...inputStyle(), resize: 'vertical' }} value={createHumanContext} onChange={(e) => setCreateHumanContext(e.target.value)} placeholder="Keep this useful and respectful, not invasive." /></div>
              </div>
            )}

            {createSection === 'skills-tools' && (
              <div className="space-y-3">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Assignments come from catalog/inheritance/profile. No ad-hoc installation from this panel.</p>
                <div><label style={labelStyle()}>Model</label><input style={inputStyle()} value={createModel} onChange={(e) => setCreateModel(e.target.value)} placeholder="Default model" /></div>
                <div><label style={labelStyle()}>TOOLS.md local notes</label><textarea rows={5} style={{ ...inputStyle(), resize: 'vertical' }} value={createLocalNotes} onChange={(e) => setCreateLocalNotes(e.target.value)} placeholder="Device aliases, SSH aliases, TTS preferences, environment notes..." /></div>
              </div>
            )}

            {createSection === 'handoffs' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label style={labelStyle()}>Escalation Policy</label><textarea rows={3} style={{ ...inputStyle(), resize: 'vertical' }} value={createEscalationPolicy} onChange={(e) => setCreateEscalationPolicy(e.target.value)} placeholder="When should this agent escalate?" /></div>
                <div><label style={labelStyle()}>Approval Lane</label><textarea rows={3} style={{ ...inputStyle(), resize: 'vertical' }} value={createApprovalLane} onChange={(e) => setCreateApprovalLane(e.target.value)} placeholder="Which actions require human approval?" /></div>
              </div>
            )}

            {createSection === 'routing-channels' && (
              <div className="space-y-3">
                <label style={labelStyle()}>Allowed Channels (comma-separated)</label>
                <textarea rows={3} style={{ ...inputStyle(), resize: 'vertical' }} value={createAllowedChannels} onChange={(e) => setCreateAllowedChannels(e.target.value)} placeholder="discord-main, whatsapp-team, inbox-ops" />
              </div>
            )}

            {createSection === 'hooks' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2"><input type="checkbox" checked={createHeartbeatEnabled} onChange={(e) => setCreateHeartbeatEnabled(e.target.checked)} /><span className="text-sm" style={{ color: 'var(--text-primary)' }}>Enable heartbeat</span></div>
                <div><label style={labelStyle()}>Quiet start</label><input style={inputStyle()} value={createQuietHoursStart} onChange={(e) => setCreateQuietHoursStart(e.target.value)} placeholder="23:00" /></div>
                <div><label style={labelStyle()}>Quiet end</label><input style={inputStyle()} value={createQuietHoursEnd} onChange={(e) => setCreateQuietHoursEnd(e.target.value)} placeholder="08:00" /></div>
              </div>
            )}

            {createSection === 'versions' && (
              <div className="space-y-3">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Core Files Preview (deterministic draft)</p>
                <pre className="text-xs overflow-auto rounded-lg border p-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
{`IDENTITY.md
Name: ${createName || '<empty>'}
Creature: ${createCreature || '<empty>'}
Role: ${createRole || '<empty>'}
Vibe: ${createVibe || '<empty>'}
Emoji: ${createEmoji || '<empty>'}

SOUL.md
SystemPrompt: ${createSystemPrompt || '<empty>'}
Personality: ${createPersonalityGuide || '<empty>'}

TOOLS.md
${createLocalNotes || '<empty>'}
`}
                </pre>
              </div>
            )}

            {createSection === 'operations' && (
              <div className="space-y-3">
                <label style={labelStyle()}>Memory Scope</label>
                <select style={inputStyle()} value={createMemoryScope} onChange={(e) => setCreateMemoryScope(e.target.value as 'main_session_only' | 'shared_safe' | 'disabled')}>
                  <option value="main_session_only">main_session_only</option>
                  <option value="shared_safe">shared_safe</option>
                  <option value="disabled">disabled</option>
                </select>
                <div className="flex items-center gap-2"><input type="checkbox" checked={createSafetyApproval} onChange={(e) => setCreateSafetyApproval(e.target.checked)} /><span className="text-sm" style={{ color: 'var(--text-primary)' }}>Require approval for external/destructive actions</span></div>
              </div>
            )}

            {createSection === 'readiness' && (
              <div className="space-y-2">
                {readinessItems.map((item) => (
                  <div key={item.key} className="flex items-center gap-2 text-sm" style={{ color: item.ok ? 'var(--tone-success-text)' : 'var(--text-muted)' }}>
                    <span>{item.ok ? '✓' : '✗'}</span>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            )}

            {createError && <p className="text-xs" style={{ color: 'var(--tone-danger-text)' }}>{createError}</p>}
            <div className="flex items-center gap-2">
              <SaveButton
                saving={createBusy}
                onClick={() => { void handleCreateAgent(); }}
                disabled={
                  createKind === 'agency' ||
                  createKind === 'department' ||
                  createKind === 'workspace' ||
                  !selectedWorkspaceId ||
                  !createName.trim() ||
                  (createKind === 'subagent' && !(scope.agentId || selectedNode?.level === 'agent' || selectedNode?.level === 'subagent'))
                }
              />
              <button type="button" onClick={() => navigate('/entity-editor')} style={{ ...inputStyle(), width: 'auto', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>

          <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
            <p className="text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.07em' }}>Readiness</p>
            {readinessItems.map((item) => (
              <div key={item.key} className="flex items-center gap-2 text-sm" style={{ color: item.ok ? 'var(--tone-success-text)' : 'var(--text-muted)' }}>
                <span>{item.ok ? '✓' : '⚠'}</span>
                <span>{item.label}</span>
              </div>
            ))}
            <div className="pt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Status: {readinessItems.every((item) => item.ok) ? 'ready_to_publish' : 'incomplete'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!entityLevel || !selectedNode) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="Agents Builder"
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
        title="Agents Builder"
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

      <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, max-content))', gap: 8 }}>
          <button type="button" onClick={() => setActivePrimaryTab('builder')} style={{ ...buttonStyle, background: activePrimaryTab === 'builder' ? 'var(--color-primary-soft)' : 'var(--bg-primary)', color: activePrimaryTab === 'builder' ? 'var(--color-primary)' : 'var(--text-primary)' }}>Builder</button>
          <button type="button" onClick={() => setActivePrimaryTab('profile')} style={{ ...buttonStyle, background: activePrimaryTab === 'profile' ? 'var(--color-primary-soft)' : 'var(--bg-primary)', color: activePrimaryTab === 'profile' ? 'var(--color-primary)' : 'var(--text-primary)' }}>Profile</button>
        </div>
        {activePrimaryTab === 'builder' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
          {sections.filter((section) => activePrimarySections.includes(section)).map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => setActiveSection(section)}
              style={{ ...buttonStyle, background: activeSection === section ? 'var(--color-primary-soft)' : 'var(--bg-primary)', color: activeSection === section ? 'var(--color-primary)' : 'var(--text-primary)' }}
            >
              {SECTION_LABEL[section]}
            </button>
          ))}
        </div>
        )}
      </div>

      <div className="rounded-xl border p-6" style={{ borderColor: 'var(--card-border)', background: 'var(--card-bg)' }}>
        <div className="min-w-0">
          {activePrimaryTab === 'profile' && (
            profilePanel ? (
              <ProfileScopeTab
                profile={profilePanel}
                profiles={profileCatalog}
                busy={profileBusy}
                onBind={(profileId) => void handleBindProfilePanel(profileId)}
                onUnbind={() => void handleUnbindProfilePanel()}
                onSaveOverride={(payload) => void handleSaveProfileOverridePanel(payload)}
              />
            ) : (
              <div className="space-y-2">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {profileError ? 'No profile data available for this scope.' : 'Loading profile view...'}
                </p>
                {profileError && <p className="text-xs" style={{ color: 'var(--tone-danger-text)' }}>{profileError}</p>}
              </div>
            )
          )}
          {activePrimaryTab === 'builder' && (
          <>
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
          {activeSection === 'versions' && <VersionsSection level={entityLevel} entityId={selectedNode?.id ?? ''} />}
          {activeSection === 'operations' && <OperationsSection />}
          {activeSection === 'readiness' && (
            <ReadinessSection
              level={entityLevel}
              entityId={selectedNode?.id ?? ''}
            />
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
