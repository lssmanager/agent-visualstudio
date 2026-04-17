import { useEffect, useState } from 'react';

import { getStudioState } from '../../../lib/api';
import { ProfileSpec } from '../../../lib/types';
import { WorkspaceEditor } from '../../workspaces/components/WorkspaceEditor';

interface OnboardingPageProps {
  onComplete: () => Promise<void>;
}

export default function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const [profiles, setProfiles] = useState<ProfileSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStudioState()
      .then((s) => {
        setProfiles(s.profiles);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load profiles');
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-lg space-y-6 p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900">Welcome to OpenClaw Studio</h1>
          <p className="mt-1 text-sm text-slate-600">
            Create your first workspace by selecting a profile below.
          </p>
        </div>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-center text-xs text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center">
            <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            <p className="text-xs text-slate-500">Loading profiles...</p>
          </div>
        ) : (
          <WorkspaceEditor
            profiles={profiles}
            onCreated={async () => {
              await onComplete();
            }}
          />
        )}
      </div>
    </div>
  );
}
