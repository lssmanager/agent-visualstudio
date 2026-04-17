import { useState } from 'react';

import { useStudioState } from '../../../lib/StudioStateContext';
import { ProfileSpec } from '../../../lib/types';
import { ProfileEditor } from '../components/ProfileEditor';
import { ProfileGallery } from '../components/ProfileGallery';

export function ProfilesPage() {
  const { state } = useStudioState();
  const [selected, setSelected] = useState<ProfileSpec | null>(state.profiles[0] ?? null);

  return (
    <div className="space-y-4 p-4">
      <ProfileGallery profiles={state.profiles} onSelect={setSelected} />
      {selected && <ProfileEditor profile={selected} />}
    </div>
  );
}
