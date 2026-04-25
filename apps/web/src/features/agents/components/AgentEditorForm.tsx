import { useEffect, useMemo, useRef, useState } from 'react';

import {
  getAgentReadiness,
  getEditorSkillsTools,
  getStudioState,
  patchEditorSkillsTools,
  publishVersion,
  saveAgent,
} from '../../../lib/api';
import { AgentSpec, AgentReadinessState, EditorSkillsToolsDto, ProfileSpec, SkillSpec } from '../../../lib/types';
import { AgentBootstrapModal } from './modals/AgentBootstrapModal';
import { CoreFilesImportModal } from './modals/CoreFilesImportModal';
import { ProfilesHubModal } from './modals/ProfilesHubModal';
import { AgentBehaviorSection } from './sections/AgentBehaviorSection';
import { AgentHandoffsSection } from './sections/AgentHandoffsSection';
import { AgentHooksSection } from './sections/AgentHooksSection';
import { AgentIdentitySection } from './sections/AgentIdentitySection';
import { AgentOperationsSection } from './sections/AgentOperationsSection';
import { AgentReadinessPanel } from './sections/AgentReadinessPanel';
import { AgentRoutingSection } from './sections/AgentRoutingSection';
import { AgentSkillsToolsSection } from './sections/AgentSkillsToolsSection';
import { AgentVersionsSection } from './sections/AgentVersionsSection';

type SectionKey =
  | 'identity'
  | 'prompts-behavior'
  | 'skills-tools'
  | 'handoffs'
  | 'routing-channels'
  | 'hooks'
  | 'versions'
  | 'operations'
  | 'readiness';

const SECTION_LABEL: Record<SectionKey, string> = {
  identity: 'Identity',
  'prompts-behavior': 'Prompts / Behavior',
  'skills-tools': 'Skills / Tools',
  handoffs: 'Handoffs',
  'routing-channels': 'Routing & Channels',
  hooks: 'Hooks',
  versions: 'Versions',
  operations: 'Operations',
  readiness: 'Readiness',
};

interface AgentEditorFormProps {
  workspaceId: string;
  agent?: AgentSpec;
  agents?: AgentSpec[];
  skills: SkillSpec[];
  onSaved: (agent: AgentSpec) => void;
  onError?: (err: Error) => void;
}

function computeReadiness(agent: AgentSpec) {
  const checks = {
    identityComplete: Boolean(agent.identity?.name && agent.identity?.creature && agent.identity?.vibe),
    behaviorComplete: Boolean(agent.behavior?.systemPrompt?.trim()),
    toolsAssigned: Boolean((agent.skillsTools?.assignedSkills?.length ?? 0) + (agent.skillsTools?.enabledTools?.length ?? 0) > 0),
    routingConfigured: Boolean(agent.routingChannels?.allowedChannels?.length),
    hooksConfigured: agent.hooks?.heartbeat?.promptSource !== undefined,
    operationsConfigured: Boolean(agent.operations?.startup && agent.operations?.safety),
    versionsReady: true,
  };

  const score = Math.round((Object.values(checks).filter(Boolean).length / Object.keys(checks).length) * 100);
  const state =
    !checks.identityComplete ? 'missing_identity'
    : !checks.behaviorComplete ? 'missing_behavior'
    : !agent.model ? 'missing_model'
    : !checks.routingConfigured ? 'missing_channel_binding'
    : !agent.operations?.memoryPolicy ? 'missing_memory_policy'
    : !agent.operations?.safety ? 'missing_safety_policy'
    : 'ready_to_publish';

  return { checks, score, state } as const;
}

function parseImportedCoreFiles(files: Record<string, string>, current: AgentSpec): AgentSpec {
  const next = { ...current };
  const identity = { ...(next.identity ?? { name: next.name ?? '' }) };
  const behavior = { ...(next.behavior ?? {}) };
  const humanContext = { ...(next.humanContext ?? {}) };
  const handoffs = { ...(next.handoffs ?? {}) };
  const routingChannels = { ...(next.routingChannels ?? {}) };
  const hooks = { ...(next.hooks ?? {}) };
  const skillsTools = { ...(next.skillsTools ?? {}) };

  const identityText = files['IDENTITY.md'] ?? '';
  if (identityText) {
    const lines = identityText.split('\n').map((line) => line.trim());
    for (const line of lines) {
      if (line.toLowerCase().startsWith('name:')) identity.name = line.slice(5).trim();
      if (line.toLowerCase().startsWith('creature:')) identity.creature = line.slice(9).trim();
      if (line.toLowerCase().startsWith('role:')) identity.role = line.slice(5).trim();
      if (line.toLowerCase().startsWith('vibe:')) identity.vibe = line.slice(5).trim();
      if (line.toLowerCase().startsWith('emoji:')) identity.emoji = line.slice(6).trim();
      if (line.toLowerCase().startsWith('avatar:')) identity.avatar = line.slice(7).trim();
    }
  }

  const soulText = files['SOUL.md'] ?? '';
  if (soulText) {
    behavior.systemPrompt = soulText;
  }

  const userText = files['USER.md'] ?? '';
  if (userText) {
    humanContext.context = userText;
  }

  const agentsText = files['AGENTS.md'] ?? '';
  if (agentsText) {
    handoffs.escalationPolicy = agentsText;
    routingChannels.responseTriggerPolicy = agentsText;
    hooks.proactiveChecks = agentsText.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 8);
  }

  const toolsText = files['TOOLS.md'] ?? '';
  if (toolsText) {
    skillsTools.localNotes = toolsText;
  }

  next.identity = identity;
  next.name = identity.name ?? next.name;
  next.role = identity.role ?? next.role;
  next.behavior = behavior;
  next.instructions = behavior.systemPrompt ?? next.instructions;
  next.humanContext = humanContext;
  next.handoffs = handoffs;
  next.routingChannels = routingChannels;
  next.hooks = hooks;
  next.skillsTools = skillsTools;

  return next;
}

export function AgentEditorForm({ workspaceId, agent, onSaved, onError, agents = [] }: AgentEditorFormProps) {
  const defaults = useMemo<AgentSpec>(
    () =>
      agent ?? {
        id: crypto.randomUUID(),
        workspaceId,
        parentWorkspaceId: workspaceId,
        name: '',
        role: 'Agent',
        description: '',
        instructions: '',
        model: 'openai/gpt-5.4-mini',
        skillRefs: [],
        tags: [],
        visibility: 'workspace',
        executionMode: 'direct',
        kind: 'agent',
        handoffRules: [],
        channelBindings: [],
        identity: {
          name: '',
          creature: '',
          vibe: '',
          role: 'Agent',
          description: '',
          emoji: '',
          avatar: '',
        },
        behavior: {
          systemPrompt: '',
          personalityGuide: '',
          operatingPrinciples: [],
          boundaries: [],
          privacyRules: [],
          continuityRules: [],
          responseStyle: '',
        },
        skillsTools: {
          assignedSkills: [],
          enabledTools: [],
          localNotes: '',
        },
        handoffs: {
          allowedTargets: [],
          escalationPolicy: '',
          approvalLane: '',
          internalActionsAllowed: [],
          externalActionsRequireApproval: [],
          publicPostingRequiresApproval: true,
        },
        routingChannels: {
          allowedChannels: [],
          groupChatMode: 'respond_when_mentioned',
          reactionPolicy: 'limited',
          maxReactionsPerMessage: 1,
          avoidTripleTap: true,
          platformFormattingRules: '',
          responseTriggerPolicy: '',
        },
        hooks: {
          heartbeat: { enabled: false, promptSource: 'disabled' },
          lifecycleHooks: [],
          cronHooks: [],
          proactiveChecks: [],
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
            memoryScope: 'main_session_only',
          },
          safety: {
            destructiveCommandsRequireApproval: true,
            externalActionsRequireApproval: true,
            privateDataProtection: true,
            recoverableDeletePreferred: true,
          },
        },
        isEnabled: true,
      },
    [agent, workspaceId],
  );

  const [draft, setDraft] = useState<AgentSpec>(defaults);
  const [skillsToolsData, setSkillsToolsData] = useState<EditorSkillsToolsDto | null>(null);
  const [activeSection, setActiveSection] = useState<SectionKey>('identity');
  const [bootOpen, setBootOpen] = useState(!agent);
  const [profileSource, setProfileSource] = useState<'template' | 'blank' | 'imported'>('blank');
  const [profiles, setProfiles] = useState<ProfileSpec[]>([]);
  const [profilesModalOpen, setProfilesModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [persistedAgentId, setPersistedAgentId] = useState<string | null>(agent?.id ?? null);
  const [remoteReadiness, setRemoteReadiness] = useState<{ state: AgentReadinessState; score: number; checks: Record<string, boolean>; missingFields: string[] } | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const localReadiness = computeReadiness(draft);
  const readinessView = remoteReadiness ?? {
    state: localReadiness.state,
    score: localReadiness.score,
    checks: localReadiness.checks,
    missingFields: [],
  };

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const studio = await getStudioState();
        setProfiles(studio.profiles ?? []);
      } catch {
        setProfiles([]);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      if (!draft.id) return;
      const data = await getEditorSkillsTools('agent', draft.id);
      setSkillsToolsData(data);
    })();
  }, [draft.id]);

  useEffect(() => {
    if (!persistedAgentId) {
      setRemoteReadiness(null);
      return;
    }

    let active = true;
    const load = async () => {
      try {
        const response = await getAgentReadiness(persistedAgentId);
        if (!active) return;
        setRemoteReadiness({
          state: response.state,
          score: response.score,
          checks: response.checks,
          missingFields: response.missingFields,
        });
      } catch {
        if (active) {
          setRemoteReadiness(null);
        }
      }
    };

    void load();
    const timer = setInterval(() => {
      void load();
    }, 2000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [persistedAgentId]);

  const availableTargets = useMemo(
    () => agents.filter((candidate) => candidate.id !== draft.id).map((candidate) => ({ id: candidate.id, name: candidate.name ?? candidate.identity?.name ?? candidate.id })),
    [agents, draft.id],
  );

  const applyProfile = (profile: ProfileSpec) => {
    setDraft((prev) => ({
      ...prev,
      model: profile.defaultModel ?? prev.model,
      skillRefs: profile.defaultSkills ?? prev.skillRefs,
      skillsTools: {
        ...(prev.skillsTools ?? {}),
        assignedSkills: profile.defaultSkills ?? prev.skillsTools?.assignedSkills ?? [],
      },
      tags: profile.tags ?? prev.tags,
    }));
    setProfileSource('template');
    setProfilesModalOpen(false);
    setBootOpen(false);
  };

  const publishEnabled = readinessView.state === 'ready_to_publish' && Boolean(persistedAgentId);

  const handlePublish = () => {
    if (!persistedAgentId || readinessView.state !== 'ready_to_publish') return;
    void (async () => {
      setPublishBusy(true);
      try {
        await publishVersion(`agent-${persistedAgentId}-publish`, 'Published from Agent Builder readiness gate');
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setPublishBusy(false);
      }
    })();
  };

  const switchSection = (key: SectionKey) => {
    setActiveSection(key);
    const hasContent = persistedAgentId || draft.identity?.name?.trim() || draft.name?.trim();
    if (!hasContent) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setAutoSaveStatus('saving');
    void saveAgent(draft)
      .then((saved) => {
        setPersistedAgentId(saved.id);
        setDraft(saved);
        onSaved(saved);
        setAutoSaveStatus('saved');
        autoSaveTimerRef.current = setTimeout(() => setAutoSaveStatus('idle'), 2000);
      })
      .catch(() => setAutoSaveStatus('idle'));
  };

  const scoreColor =
    readinessView.score === 100
      ? 'var(--tone-success-text, #16a34a)'
      : readinessView.score >= 60
        ? 'var(--color-primary)'
        : '#f59e0b';

  const isReadinessTab = activeSection === 'readiness';

  return (
    <>
      <AgentBootstrapModal
        open={bootOpen}
        onSelectProfile={() => setProfilesModalOpen(true)}
        onStartBlank={() => {
          setProfileSource('blank');
          setBootOpen(false);
        }}
        onImportCoreFiles={() => setImportModalOpen(true)}
      />

      <ProfilesHubModal
        open={profilesModalOpen}
        profiles={profiles}
        onSelect={(profileId) => {
          const selected = profiles.find((item) => item.id === profileId);
          if (selected) applyProfile(selected);
        }}
        onClose={() => setProfilesModalOpen(false)}
      />

      <CoreFilesImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onParsed={(files) => {
          setDraft((prev) => parseImportedCoreFiles(files, prev));
          setProfileSource('imported');
          setImportModalOpen(false);
          setBootOpen(false);
        }}
      />

      <form
        className={`grid gap-4 grid-cols-1 ${isReadinessTab ? 'xl:grid-cols-[220px_minmax(0,1fr)]' : 'xl:grid-cols-[220px_minmax(0,1fr)_280px]'}`}
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            try {
              const saved = await saveAgent(draft);
              setPersistedAgentId(saved.id);
              setDraft(saved);
              onSaved(saved);
            } catch (err) {
              onError?.(err instanceof Error ? err : new Error(String(err)));
            }
          })();
        }}
      >
        {/* Header bar — spans full width */}
        <div className="xl:col-span-3 rounded-md border px-3 py-2 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Agent Builder</p>
            <div className="flex items-center gap-2">
              {autoSaveStatus === 'saving' && (
                <span className="text-xs opacity-60">Saving…</span>
              )}
              {autoSaveStatus === 'saved' && (
                <span className="text-xs font-medium" style={{ color: 'var(--tone-success-text, #16a34a)' }}>Saved</span>
              )}
              <span className="rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide opacity-70">
                {readinessView.state.replace(/_/g, ' ')}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-xs font-bold"
                style={{
                  background: readinessView.score === 100 ? 'rgba(22,163,74,0.12)' : 'var(--bg-tertiary)',
                  color: scoreColor,
                }}
              >
                {readinessView.score}%
              </span>
            </div>
          </div>
          {/* Readiness progress bar */}
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${readinessView.score}%`, background: scoreColor }}
            />
          </div>
        </div>

        {/* Section nav sidebar */}
        <aside className="rounded-md border overflow-hidden self-start">
          <div className="px-3 py-2 text-xs font-semibold uppercase opacity-70 border-b">Builder sections</div>
          <nav className="py-1">
            {(Object.keys(SECTION_LABEL) as SectionKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => switchSection(key)}
                className="w-full text-left px-3 py-2 text-sm"
                style={{
                  background: activeSection === key ? 'var(--color-primary-soft)' : 'transparent',
                  color: activeSection === key ? 'var(--color-primary)' : 'var(--text-muted)',
                  fontWeight: activeSection === key ? 600 : 400,
                }}
              >
                {SECTION_LABEL[key]}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content area */}
        <div className="space-y-4 min-w-0">
          {activeSection === 'identity' && <AgentIdentitySection value={draft} onChange={setDraft} profileSource={profileSource} />}
          {activeSection === 'prompts-behavior' && <AgentBehaviorSection value={draft} onChange={setDraft} />}
          {activeSection === 'skills-tools' && (
            <AgentSkillsToolsSection
              data={skillsToolsData}
              localNotes={draft.skillsTools?.localNotes ?? ''}
              onNotesChange={(notes) =>
                setDraft((prev) => ({ ...prev, skillsTools: { ...(prev.skillsTools ?? {}), localNotes: notes } }))
              }
              onPatch={async (payload) => {
                if (!draft.id) return;
                await patchEditorSkillsTools({ level: 'agent', id: draft.id, ...payload });
                const data = await getEditorSkillsTools('agent', draft.id);
                setSkillsToolsData(data);
                setDraft((prev) => ({
                  ...prev,
                  skillsTools: {
                    ...(prev.skillsTools ?? {}),
                    assignedSkills: data.effective.skills,
                    enabledTools: data.effective.tools,
                    localNotes: prev.skillsTools?.localNotes ?? '',
                  },
                  skillRefs: data.effective.skills,
                }));
              }}
            />
          )}
          {activeSection === 'handoffs' && <AgentHandoffsSection value={draft} onChange={setDraft} availableTargets={availableTargets} />}
          {activeSection === 'routing-channels' && <AgentRoutingSection value={draft} onChange={setDraft} />}
          {activeSection === 'hooks' && <AgentHooksSection value={draft} onChange={setDraft} />}
          {activeSection === 'versions' && <AgentVersionsSection agentId={draft.id} />}
          {activeSection === 'operations' && <AgentOperationsSection value={draft} onChange={setDraft} />}
          {activeSection === 'readiness' && (
            <AgentReadinessPanel
              state={readinessView.state}
              score={readinessView.score}
              checks={readinessView.checks}
              missingFields={readinessView.missingFields}
              publishEnabled={publishEnabled}
              publishing={publishBusy}
              onPublish={handlePublish}
              fullPage
            />
          )}

          {/* Action buttons — shown on all tabs */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              className="rounded px-4 py-2 text-sm font-medium"
              style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
            >
              Save Changes
            </button>
            <button
              type="button"
              className="rounded px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
              style={{
                background: publishEnabled ? '#16a34a' : 'var(--bg-tertiary)',
                color: publishEnabled ? '#fff' : 'var(--text-muted)',
              }}
              disabled={!publishEnabled || publishBusy}
              onClick={handlePublish}
            >
              {publishBusy ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </div>

        {/* Right panel — compact readiness summary, hidden on readiness tab */}
        {!isReadinessTab && (
          <AgentReadinessPanel
            state={readinessView.state}
            score={readinessView.score}
            checks={readinessView.checks}
            missingFields={readinessView.missingFields}
            publishEnabled={publishEnabled}
            publishing={publishBusy}
            onPublish={handlePublish}
          />
        )}
      </form>
    </>
  );
}
