import { useState } from 'react';

import { ProfileSpec } from '../../../lib/types';
import { RoutineTogglePanel } from './RoutineTogglePanel';

interface ProfileEditorProps {
  profile: ProfileSpec;
}

export function ProfileEditor({ profile }: ProfileEditorProps) {
  const [enabledRoutines, setEnabledRoutines] = useState<string[]>(profile.routines ?? []);

  return (
    <div className="space-y-3 rounded border border-slate-300 bg-white p-3">
      <h3 className="text-sm font-semibold">Profile Editor</h3>
      <p className="text-sm">{profile.name}</p>
      <RoutineTogglePanel routines={profile.routines ?? []} enabled={enabledRoutines} onChange={setEnabledRoutines} />
    </div>
  );
}
