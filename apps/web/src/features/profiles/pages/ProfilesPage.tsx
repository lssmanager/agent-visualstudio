import { useState } from 'react';

import { useStudioState } from '../../../lib/StudioStateContext';
import { ProfileSpec } from '../../../lib/types';
import { ProfileEditor } from '../components/ProfileEditor';
import { ProfileGallery } from '../components/ProfileGallery';
import { BookOpen } from 'lucide-react';

export default function ProfilesPage() {
  const { state } = useStudioState();
  const [selected, setSelected] = useState<ProfileSpec | null>(state.profiles[0] ?? null);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Profiles</h1>
        <p className="text-slate-600 mt-1">
          Profiles are pre-configured templates for agents, skills, and workflows
        </p>
      </div>

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
                        <span
                          key={skill}
                          className="inline-block bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs"
                        >
                          {skill}
                        </span>
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
            <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-slate-600 flex items-center justify-center h-64">
              <div>
                <BookOpen size={32} className="mx-auto mb-3 text-slate-300" />
                <p>Select a profile to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
