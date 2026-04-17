import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { createWorkspace } from '../../../lib/api';
import { ProfileSpec, WorkspaceSpec } from '../../../lib/types';

interface WorkspaceEditorProps {
  profiles: ProfileSpec[];
  onCreated: (response: { workspaceSpec: WorkspaceSpec; created: boolean; message: string; timestamp: string }) => void;
}

export function WorkspaceEditor({ profiles, onCreated }: WorkspaceEditorProps) {
  const { register, handleSubmit, watch } = useForm<{
    name: string;
    profileId?: string;
    defaultModel?: string;
    skillIds?: string[];
  }>();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedProfileId = watch('profileId');
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  const handleCreate = handleSubmit(async (values) => {
    setLoading(true);
    setError(null);
    try {
      // Send only what user explicitly set - backend handles merge order
      // (request > profile > defaults)
      const result = await createWorkspace({
        name: values.name,
        profileId: values.profileId,
        defaultModel: values.defaultModel || undefined,
        skillIds: values.skillIds?.length ? values.skillIds : undefined,
        // NO routines - backend resolves from profile
      });
      onCreated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  });

  return (
    <form className="rounded border border-slate-300 bg-white p-3" onSubmit={handleCreate}>
      <h3 className="mb-3 text-sm font-semibold">Create Workspace from Profile</h3>

      {error && <div className="mb-2 rounded bg-red-100 p-2 text-xs text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-2">
        {/* Profile Selector */}
        <div>
          <label className="block text-xs font-medium text-slate-600">Profile (Required)</label>
          <select {...register('profileId', { required: true })} className="w-full rounded border px-2 py-1 text-sm">
            <option value="">Select a profile...</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
        </div>

        {/* Workspace Name */}
        <div>
          <label className="block text-xs font-medium text-slate-600">Workspace Name (Required)</label>
          <input
            {...register('name', { required: true })}
            placeholder="e.g., My Operations Workspace"
            className="w-full rounded border px-2 py-1 text-sm"
          />
        </div>

        {/* Optional: Model Override */}
        {selectedProfile && (
          <div>
            <label className="block text-xs font-medium text-slate-600">
              AI Model (Optional - uses profile default: {selectedProfile.defaultModel})
            </label>
            <input
              {...register('defaultModel')}
              placeholder="e.g., openai/gpt-5.4-mini"
              className="w-full rounded border px-2 py-1 text-sm"
            />
          </div>
        )}

        {/* Show Profile Info (Information-only, backend handles merge) */}
        {selectedProfile && (
          <div className="rounded bg-slate-50 p-2 text-xs">
            <div className="font-medium text-slate-700">Profile: {selectedProfile.name}</div>
            <div className="mt-1 text-slate-600">{selectedProfile.description}</div>
            {selectedProfile.defaultModel && (
              <div className="mt-1">
                <span className="font-medium">Default Model:</span> {selectedProfile.defaultModel}
              </div>
            )}
            {selectedProfile.defaultSkills && selectedProfile.defaultSkills.length > 0 && (
              <div className="mt-1">
                <span className="font-medium">Profile Skills:</span> {selectedProfile.defaultSkills.join(', ')}
              </div>
            )}
            {selectedProfile.routines && selectedProfile.routines.length > 0 && (
              <div className="mt-1">
                <span className="font-medium">Profile Routines:</span> {selectedProfile.routines.join(', ')}
              </div>
            )}
            <div className="mt-2 rounded bg-slate-100 p-1.5 text-slate-600">
              <strong>Note:</strong> These profile values will be applied by the backend if you don't override them.
            </div>
          </div>
        )}
      </div>

      <button
        disabled={loading || !selectedProfileId}
        className="mt-3 w-full rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        {loading ? 'Creating...' : 'Create with Bootstrap'}
      </button>

      <div className="mt-2 text-xs text-slate-500">
        Workspace will be created with profile defaults. Profile skills and routines will be applied automatically.
      </div>
    </form>
  );
}
