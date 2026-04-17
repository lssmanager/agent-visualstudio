import { useState } from 'react';
import { BookOpen } from 'lucide-react';

import { useStudioState } from '../../../lib/StudioStateContext';
import { ProfileSpec } from '../../../lib/types';
import { ProfileEditor } from '../components/ProfileEditor';
import { ProfileGallery } from '../components/ProfileGallery';
import { PageHeader, EmptyState, Badge } from '../../../components';

export default function ProfilesPage() {
  const { state } = useStudioState();
  const [selected, setSelected] = useState<ProfileSpec | null>(state.profiles[0] ?? null);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Profiles"
        description="Pre-configured templates for agents, skills, and workflows"
        icon={BookOpen}
      />

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Gallery */}
        <div className="lg:col-span-3">
          <ProfileGallery profiles={state.profiles} onSelect={setSelected} />
        </div>

        {/* Right: Editor/Info */}
        <div className="lg:col-span-1">
          {selected ? (
            <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4 sticky top-20">
              <h3 className="font-semibold text-slate-900">Selected Profile</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-slate-600">Name</p>
                  <p className="font-medium text-slate-900">{selected.name}</p>
                </div>
                <div>
                  <p className="text-slate-600">Description</p>
                  <p className="text-slate-700">{selected.description}</p>
                </div>
                {selected.defaultModel && (
                  <div>
                    <p className="text-slate-600">Default Model</p>
                    <p className="font-mono text-xs bg-slate-50 p-2 rounded text-slate-900">
                      {selected.defaultModel}
                    </p>
                  </div>
                )}
                {selected.defaultSkills && selected.defaultSkills.length > 0 && (
                  <div>
                    <p className="text-slate-600 mb-2">Default Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.defaultSkills.map((skill) => (
                        <Badge key={skill} variant="info">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <button className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                  Use This Profile
                </button>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="No Profile Selected"
              description="Select a profile from the gallery to view details"
            />
          )}
        </div>
      </div>
    </div>
  );
}
