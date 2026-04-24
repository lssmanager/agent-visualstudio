import type { ProfileSpec } from '../../../../lib/types';

type Props = {
  open: boolean;
  profiles: ProfileSpec[];
  onSelect: (profileId: string) => void;
  onClose: () => void;
};

export function ProfilesHubModal({ open, profiles, onSelect, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="rounded-lg border p-4 space-y-3" role="dialog" aria-label="Profiles hub modal">
      <p className="text-sm font-semibold">Select profile template</p>
      <div className="grid gap-2">
        {profiles.map((profile) => (
          <button key={profile.id} type="button" className="rounded-md border px-3 py-1 text-xs text-left" onClick={() => onSelect(profile.id)}>
            {profile.name}
          </button>
        ))}
      </div>
      <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={onClose}>Close</button>
    </div>
  );
}

