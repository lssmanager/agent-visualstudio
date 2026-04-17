import { useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useStudioState } from '../../../lib/StudioStateContext';
import { ProfileSpec } from '../../../lib/types';
import { createWorkspace } from '../../../lib/api';
import { ProfileGallery } from '../components/ProfileGallery';
import { PageHeader, EmptyState, Badge, Card, Toast } from '../../../components';

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
  const { state, refresh } = useStudioState();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ProfileSpec | null>(state.profiles[0] ?? null);
  const [showModal, setShowModal] = useState(false);
  const [wsName, setWsName] = useState('');
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  function openModal() {
    setWsName('');
    setShowModal(true);
  }

  async function handleCreateFromProfile() {
    if (!selected || !wsName.trim()) return;
    setCreating(true);
    try {
      await createWorkspace({ name: wsName.trim(), profileId: selected.id });
      await refresh();
      setShowModal(false);
      navigate('/');
    } catch (err) {
      setToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to create workspace',
      });
    } finally {
      setCreating(false);
    }
  }

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

        {/* Right: Detail panel */}
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
                        <Badge key={skill} variant="info">{skill}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {(selected as any).routines?.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Routines</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(selected as any).routines.map((r: any) => (
                        <Badge
                          key={typeof r === 'string' ? r : r.id ?? r.name}
                          variant="default"
                        >
                          {typeof r === 'string' ? r : r.name ?? r.id}
                        </Badge>
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

                <button
                  onClick={openModal}
                  className="w-full mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
                >
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

      {/* Create Workspace Modal */}
      {showModal && selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Create Workspace</h3>
                <p className="text-sm text-slate-600 mt-1">
                  Using profile: <strong>{selected.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={18} className="text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Workspace Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  placeholder="e.g. My Support Team"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && !creating && void handleCreateFromProfile()}
                />
              </div>

              {selected.defaultModel && (
                <p className="text-xs text-slate-500">
                  Default model:{' '}
                  <span className="font-mono bg-slate-100 px-1 rounded">{selected.defaultModel}</span>
                </p>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  disabled={creating}
                  className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleCreateFromProfile()}
                  disabled={!wsName.trim() || creating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating…' : 'Create Workspace'}
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
