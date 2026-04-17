import { useMemo } from 'react';
import { useForm } from 'react-hook-form';

import { saveAgent } from '../../../lib/api';
import { AgentSpec, SkillSpec } from '../../../lib/types';
import { AgentHandoffEditor } from './AgentHandoffEditor';
import { AgentInstructionEditor } from './AgentInstructionEditor';
import { AgentModelSelector } from './AgentModelSelector';
import { AgentSkillSelector } from './AgentSkillSelector';

interface AgentEditorFormProps {
  workspaceId: string;
  agent?: AgentSpec;
  skills: SkillSpec[];
  onSaved: (agent: AgentSpec) => void;
  onError?: (err: Error) => void;
}

export function AgentEditorForm({ workspaceId, agent, skills, onSaved, onError }: AgentEditorFormProps) {
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
        handoffRules: [],
        channelBindings: [],
        isEnabled: true,
      },
    [agent, workspaceId],
  );

  const { register, handleSubmit, setValue, watch } = useForm<AgentSpec>({ defaultValues: defaults });

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
