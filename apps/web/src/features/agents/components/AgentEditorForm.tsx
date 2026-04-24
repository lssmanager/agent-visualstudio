import { useMemo, useState } from 'react';

import { saveAgent } from '../../../lib/api';
import { AgentSpec, SkillSpec } from '../../../lib/types';
import { AgentBehaviorSection } from './sections/AgentBehaviorSection';
import { AgentHandoffsSection } from './sections/AgentHandoffsSection';
import { AgentHooksSection } from './sections/AgentHooksSection';
import { AgentIdentitySection } from './sections/AgentIdentitySection';
import { AgentOperationsSection } from './sections/AgentOperationsSection';
import { AgentReadinessPanel } from './sections/AgentReadinessPanel';
import { AgentRoutingSection } from './sections/AgentRoutingSection';
import { AgentSkillsToolsSection } from './sections/AgentSkillsToolsSection';

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

export function AgentEditorForm({ workspaceId, agent, onSaved, onError }: AgentEditorFormProps) {
  const defaults = useMemo<AgentSpec>(
    () =>
      agent ?? {
        id: crypto.randomUUID(),
        workspaceId,
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
  const readiness = computeReadiness(draft);

  return (
    <form
      className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          try {
            const saved = await saveAgent(draft);
            onSaved(saved);
          } catch (err) {
            onError?.(err instanceof Error ? err : new Error(String(err)));
          }
        })();
      }}
    >
      <div className="space-y-4">
        <AgentIdentitySection value={draft} onChange={setDraft} />
        <AgentBehaviorSection value={draft} onChange={setDraft} />
        <AgentSkillsToolsSection data={null} onPatch={async () => Promise.resolve()} />
        <AgentHandoffsSection value={draft} />
        <AgentRoutingSection value={draft} />
        <AgentHooksSection value={draft} />
        <AgentOperationsSection value={draft} />
        <button
          type="submit"
          className="rounded px-3 py-2 text-sm font-medium"
          style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
        >
          Save Agent
        </button>
      </div>
      <AgentReadinessPanel state={readiness.state} score={readiness.score} checks={readiness.checks} />
    </form>
  );
}

