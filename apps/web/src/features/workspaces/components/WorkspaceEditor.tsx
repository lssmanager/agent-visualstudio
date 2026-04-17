import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2, ArrowRight } from 'lucide-react';

import { createWorkspace } from '../../../lib/api';
import { ProfileSpec, WorkspaceSpec } from '../../../lib/types';

interface WorkspaceEditorProps {
  profiles: ProfileSpec[];
  onCreated: (response: { workspaceSpec: WorkspaceSpec; created: boolean; message: string; timestamp: string }) => void;
}

export function WorkspaceEditor({ profiles, onCreated }: WorkspaceEditorProps) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<{
    name: string;
    profileId?: string;
    defaultModel?: string;
    skillIds?: string[];
  }>();

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const selectedProfileId = watch('profileId');
  const selectedProfile   = profiles.find((p) => p.id === selectedProfileId);

  const handleCreate = handleSubmit(async (values) => {
    setLoading(true);
    setError(null);
    try {
      const result = await createWorkspace({
        name: values.name,
        profileId: values.profileId,
        defaultModel: values.defaultModel || undefined,
        skillIds: values.skillIds?.length ? values.skillIds : undefined,
      });
      onCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  });

  return (
    <form onSubmit={handleCreate} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Profile selector */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Profile <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <select
            {...register('profileId', { required: 'Select a profile' })}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 pr-9 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
          >
            <option value="">Select a profile…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <ArrowRight size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-slate-400" />
        </div>
        {errors.profileId && <p className="text-xs text-red-600">{errors.profileId.message}</p>}
      </div>

      {/* Profile summary */}
      {selectedProfile && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs space-y-1.5">
          {selectedProfile.description && (
            <p className="text-slate-600">{selectedProfile.description}</p>
          )}
          {selectedProfile.defaultModel && (
            <p className="text-slate-500">
              Model: <span className="font-mono text-slate-700">{selectedProfile.defaultModel}</span>
            </p>
          )}
          {selectedProfile.defaultSkills && selectedProfile.defaultSkills.length > 0 && (
            <p className="text-slate-500">
              Skills: <span className="text-slate-700">{selectedProfile.defaultSkills.join(', ')}</span>
            </p>
          )}
          {selectedProfile.routines && selectedProfile.routines.length > 0 && (
            <p className="text-slate-500">
              Routines: <span className="text-slate-700">{selectedProfile.routines.join(', ')}</span>
            </p>
          )}
        </div>
      )}

      {/* Workspace name */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Workspace Name <span className="text-red-500">*</span>
        </label>
        <input
          {...register('name', {
            required: 'Name is required',
            minLength: { value: 2, message: 'At least 2 characters' },
          })}
          placeholder="e.g., My Operations Workspace"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
        />
        {errors.name && <p className="text-xs text-red-600">{errors.name.message}</p>}
      </div>

      {/* Optional: Model override */}
      {selectedProfile && (
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Model <span className="text-slate-400 font-normal normal-case">(optional override)</span>
          </label>
          <input
            {...register('defaultModel')}
            placeholder={selectedProfile.defaultModel ?? 'e.g., openai/gpt-4o'}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !selectedProfileId}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {loading ? (
          <><Loader2 size={15} className="animate-spin" />Creating workspace…</>
        ) : (
          'Create with Bootstrap'
        )}
      </button>

      <p className="text-center text-xs text-slate-400">
        Profile skills and routines will be applied automatically by the backend.
      </p>
    </form>
  );
}
