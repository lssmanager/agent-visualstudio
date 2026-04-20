import { useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useStudioState } from '../../../lib/StudioStateContext';
import { ProfileSpec } from '../../../lib/types';
import { createWorkspace } from '../../../lib/api';
import { ProfileGallery } from '../components/ProfileGallery';
import { PageHeader, EmptyState, Badge, Card, Toast } from '../../../components';

const categoryTokens: Record<string, { bg: string; color: string; border: string }> = {
  operations:  { bg: 'var(--color-primary-soft)', color: 'var(--color-primary)', border: 'var(--color-primary-soft)' },
  support:     { bg: 'var(--tone-success-bg)', color: 'var(--color-success)', border: 'var(--tone-success-border)' },
  engineering: { bg: 'var(--color-accent-soft)', color: 'var(--color-accent)', border: 'var(--color-accent-soft)' },
  monitoring:  { bg: 'var(--tone-warning-bg)', color: 'var(--color-warning)', border: 'var(--tone-warning-border)' },
};

const defaultCategoryToken = { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: 'var(--border-primary)' };

function getCategoryToken(category?: string) {
  return (category && categoryTokens[category]) ?? defaultCategoryToken;
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
      <PageHeader
        title="Profiles"
        description="Pre-configured templates for agents, skills, and workflows"
        icon={BookOpen}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Gallery */}
        <div className="lg:col-span-3">
          <ProfileGallery profiles={state.profiles} onSelect={setSelected} />
        </div>

        {/* Right: Detail panel */}
        <div className="lg:col-span-1">
          {selected ? (
            <Card className="sticky top-20 space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>{selected.name}</h3>
                  {(() => {
                    const ct = getCategoryToken((selected as any).category);
                    return (
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
                        style={{ background: ct.bg, color: ct.color, border: `1px solid ${ct.border}` }}
                      >
                        {(selected as any).category ?? 'general'}
                      </span>
                    );
                  })()}
                </div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{selected.description}</p>
              </div>

              {/* Stats row */}
              <div
                className="flex items-center gap-4 py-3 text-xs"
                style={{ borderTop: '1px solid var(--border-secondary)', borderBottom: '1px solid var(--border-secondary)', color: 'var(--text-muted)' }}
              >
                <span>{selected.defaultSkills?.length ?? 0} skills</span>
                <span style={{ color: 'var(--border-primary)' }}>·</span>
                <span>{(selected as any).routines?.length ?? 0} routines</span>
              </div>

              <div className="space-y-3 text-sm">
                {selected.defaultModel && (
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Default Model</p>
                    <p
                      className="font-mono text-xs p-2 rounded"
                      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)', color: 'var(--text-primary)' }}
                    >
                      {selected.defaultModel}
                    </p>
                  </div>
                )}
                {selected.defaultSkills && selected.defaultSkills.length > 0 && (
                  <div>
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Default Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.defaultSkills.map((skill) => (
                        <Badge key={skill} variant="info">{skill}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {(selected as any).routines?.length > 0 && (
                  <div>
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Routines</p>
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
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(selected as any).tags.map((tag: string) => (
                        <Badge key={tag} variant="default">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={openModal}
                  className="w-full mt-2 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                  style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--btn-primary-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--btn-primary-bg)'; }}
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
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Create Workspace</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Using profile: <strong>{selected.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Workspace Name <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  placeholder="e.g. My Support Team"
                  className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                  style={{
                    background: 'var(--input-bg)',
                    border: '1px solid var(--input-border)',
                    color: 'var(--input-text)',
                  }}
                  onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--input-focus)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 2px var(--color-primary-soft)'; }}
                  onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--input-border)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && !creating && void handleCreateFromProfile()}
                />
              </div>

              {selected.defaultModel && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Default model:{' '}
                  <span
                    className="font-mono px-1 rounded"
                    style={{ background: 'var(--bg-tertiary)' }}
                  >
                    {selected.defaultModel}
                  </span>
                </p>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setShowModal(false)}
                  disabled={creating}
                  className="px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleCreateFromProfile()}
                  disabled={!wsName.trim() || creating}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
                  onMouseEnter={(e) => { if (!creating) (e.currentTarget as HTMLElement).style.background = 'var(--btn-primary-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--btn-primary-bg)'; }}
                >
                  {creating ? 'Creating…' : 'Create Workspace'}
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {toast && (
        <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
