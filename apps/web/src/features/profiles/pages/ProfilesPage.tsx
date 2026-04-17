import { useState } from 'react';
import { BookOpen } from 'lucide-react';

import { useStudioState } from '../../../lib/StudioStateContext';
import { ProfileSpec } from '../../../lib/types';
import { ProfileGallery } from '../components/ProfileGallery';
import { PageHeader, EmptyState, Badge, Card } from '../../../components';

const categoryStyles: Record<string, string> = {
  operations:  'bg-blue-50 text-blue-700 border-blue-200',
  support:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  engineering: 'bg-purple-50 text-purple-700 border-purple-200',
  monitoring:  'bg-amber-50 text-amber-700 border-amber-200',
};

function getCategoryStyle(category?: string): string {
  return (category && categoryStyles[category]) ?? 'bg-slate-50 text-slate-700 border-slate-200';
}

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
            <Card className="sticky top-20 space-y-4">
              {/* Category + name */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-slate-900">{selected.name}</h3>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${getCategoryStyle((selected as any).category)}`}
                  >
                    {(selected as any).category ?? 'general'}
                  </span>
                </div>
                <p className="text-sm text-slate-600">{selected.description}</p>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 py-3 border-y border-slate-100 text-xs text-slate-500">
                <span>{selected.defaultSkills?.length ?? 0} skills</span>
                <span className="text-slate-300">·</span>
                <span>{(selected as any).routines?.length ?? 0} routines</span>
              </div>

              <div className="space-y-3 text-sm">
                {selected.defaultModel && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Default Model</p>
                    <p className="font-mono text-xs bg-slate-50 p-2 rounded border border-slate-100 text-slate-900">
                      {selected.defaultModel}
                    </p>
                  </div>
                )}
                {selected.defaultSkills && selected.defaultSkills.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Default Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.defaultSkills.map((skill) => (
                        <span
                          key={skill}
                          className="font-mono text-xs bg-slate-100 text-slate-700 rounded px-1.5 py-0.5"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(selected as any).routines?.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Routines</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(selected as any).routines.map((r: any) => (
                        <span
                          key={typeof r === 'string' ? r : r.id ?? r.name}
                          className="font-mono text-xs bg-slate-100 text-slate-700 rounded px-1.5 py-0.5"
                        >
                          {typeof r === 'string' ? r : r.name ?? r.id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {(selected as any).tags?.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(selected as any).tags.map((tag: string) => (
                        <Badge key={tag} variant="default">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <button className="w-full mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                  Use This Profile
                </button>
              </div>
            </Card>
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
