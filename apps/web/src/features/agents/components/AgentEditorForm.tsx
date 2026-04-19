import { useMemo } from 'react';
import { useForm } from 'react-hook-form';

import { saveAgent } from '../../../lib/api';
import { AgentKind, AgentSpec, SkillSpec } from '../../../lib/types';
import { AgentHandoffEditor } from './AgentHandoffEditor';
import { AgentInstructionEditor } from './AgentInstructionEditor';
import { AgentKindSelector } from './AgentKindSelector';
import { AgentModelSelector } from './AgentModelSelector';
import { AgentSkillSelector } from './AgentSkillSelector';

interface AgentEditorFormProps {
  workspaceId: string;
  agent?: AgentSpec;
  agents?: AgentSpec[];
  skills: SkillSpec[];
  onSaved: (agent: AgentSpec) => void;
  onError?: (err: Error) => void;
}

export function AgentEditorForm({ workspaceId, agent, agents = [], skills, onSaved, onError }: AgentEditorFormProps) {
  const defaults = useMemo<AgentSpec>(
    () =>
      agent ?? {
        id: crypto.randomUUID(),
        workspaceId,
        name: '',
        role: '',
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
        isEnabled: true,
      },
    [agent, workspaceId],
  );

  const { register, handleSubmit, setValue, watch } = useForm<AgentSpec>({ defaultValues: defaults });

  const currentKind = watch('kind') ?? 'agent';
  const orchestrators = agents.filter((a) => a.id !== agent?.id && (a.kind === 'orchestrator' || a.executionMode === 'orchestrated'));

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          const saved = await saveAgent(values);
          onSaved(saved);
        } catch (err) {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      })}
    >
      <div className="grid grid-cols-2 gap-3">
        <input {...register('name')} placeholder="Agent name" className="rounded border border-slate-300 px-3 py-2" />
        <input {...register('role')} placeholder="Role" className="rounded border border-slate-300 px-3 py-2" />
      </div>

      <input {...register('description')} placeholder="Description" className="w-full rounded border border-slate-300 px-3 py-2" />

      <AgentKindSelector value={currentKind as AgentKind} onChange={(kind) => setValue('kind', kind)} />

      {currentKind === 'subagent' && (
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Parent Agent
          </label>
          <select
            {...register('parentAgentId')}
            className="w-full rounded border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
          >
            <option value="">-- No parent --</option>
            {orchestrators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.kind ?? o.executionMode})
              </option>
            ))}
          </select>
        </div>
      )}

      {(currentKind === 'agent' || currentKind === 'orchestrator') && (
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Context Files
          </label>
          <input
            {...register('context')}
            placeholder="Comma-separated file paths (e.g. README.md, docs/api.md)"
            className="w-full rounded border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
          />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Files the agent can access as context during execution.
          </p>
        </div>
      )}

      <AgentModelSelector value={watch('model')} onChange={(value) => setValue('model', value)} />
      <AgentSkillSelector value={watch('skillRefs')} options={skills} onChange={(value) => setValue('skillRefs', value)} />
      <AgentInstructionEditor value={watch('instructions')} onChange={(value) => setValue('instructions', value)} />
      <AgentHandoffEditor value={watch('handoffRules')} onChange={(value) => setValue('handoffRules', value)} />

      <button type="submit" className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white">
        Save Agent
      </button>
    </form>
  );
}
