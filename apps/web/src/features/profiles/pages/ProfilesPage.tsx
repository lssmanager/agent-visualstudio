import type { CSSProperties, ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { BookOpen, Hammer, Layers3, Sparkles, Cpu, Zap, Star, Tag, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { createWorkspace } from '../../../lib/api';
import { useStudioState } from '../../../lib/StudioStateContext';
import { useHierarchy } from '../../../lib/HierarchyContext';
import { PageHeader, Toast } from '../../../components';
import type { ProfileSpec } from '../../../lib/types';

type HubTab = 'profiles' | 'skills' | 'tools' | 'templates';

const HUB_TABS: Array<{ id: HubTab; label: string; planned?: boolean }> = [
  { id: 'profiles', label: 'Profiles' },
  { id: 'skills', label: 'Skills' },
  { id: 'tools', label: 'Tools' },
  { id: 'templates', label: 'Templates', planned: true },
];

export default function ProfilesPage() {
  const { state, refresh } = useStudioState();
  const { canonical } = useHierarchy();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<HubTab>('profiles');
  const [selectedProfileId, setSelectedProfileId] = useState(state.profiles[0]?.id ?? '');
  const [workspaceName, setWorkspaceName] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const selectedProfile = useMemo(
    () => state.profiles.find((p) => p.id === selectedProfileId) ?? null,
    [state.profiles, selectedProfileId],
  );

  const tools = canonical?.catalog.tools ?? [];

  async function handleCreateWorkspace() {
    if (!selectedProfile || !workspaceName.trim()) return;
    setBusy(true);
    try {
      await createWorkspace({ name: workspaceName.trim(), profileId: selectedProfile.id });
      await refresh();
      setToast({ type: 'success', message: 'Workspace created from selected profile' });
      navigate('/administration?tab=overview');
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create workspace' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', display: 'grid', gap: 14 }}>
      <PageHeader
        title="Profiles Hub"
        description="Global reusable catalog for profiles, skills, tools and templates."
        icon={BookOpen}
      />

      {/* Tab bar */}
      <section style={panelStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${HUB_TABS.length}, minmax(0,1fr))`, gap: 8 }}>
          {HUB_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-primary)',
                background: activeTab === tab.id ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
                color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--text-muted)',
                fontSize: 12,
                fontWeight: 700,
                padding: '8px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {tab.label}
              {tab.planned && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: 'var(--tone-warning-bg, rgba(245,158,11,0.1))', color: 'var(--tone-warning-text, #f59e0b)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Soon
                </span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* ── Profiles tab ─────────────────────────────────────────────── */}
      {activeTab === 'profiles' && (
        <section
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 14 }}
          className="studio-responsive-two-col"
        >
          {/* Catalog list */}
          <div style={{ ...panelStyle, gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Profile Catalog</h2>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {state.profiles.length} profile{state.profiles.length !== 1 ? 's' : ''}
              </span>
            </div>
            {state.profiles.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No profiles available in catalog.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {state.profiles.map((profile) => (
                  <ProfileCard
                    key={profile.id}
                    profile={profile}
                    selected={selectedProfileId === profile.id}
                    onClick={() => setSelectedProfileId(profile.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          <aside style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
            {selectedProfile ? (
              <ProfileDetailPanel
                profile={selectedProfile}
                workspaceName={workspaceName}
                onWorkspaceNameChange={setWorkspaceName}
                onCreateWorkspace={() => void handleCreateWorkspace()}
                busy={busy}
              />
            ) : (
              <div style={{ ...panelStyle, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 32 }}>
                Select a profile to view details.
              </div>
            )}
          </aside>
        </section>
      )}

      {/* ── Skills tab ───────────────────────────────────────────────── */}
      {activeTab === 'skills' && (
        <section style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Skills Catalog</h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {state.skills.length} skill{state.skills.length !== 1 ? 's' : ''}
            </span>
          </div>
          {state.skills.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>No skills in catalog.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {state.skills.map((skill) => (
                <div key={skill.id} style={itemCardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{skill.name}</strong>
                    {skill.category && (
                      <span style={{ ...chipStyle, background: 'var(--color-primary-soft)', color: 'var(--color-primary)', flexShrink: 0 }}>
                        {skill.category}
                      </span>
                    )}
                  </div>
                  {skill.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{skill.description}</div>
                  )}
                  {skill.functions.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
                      {skill.functions.slice(0, 4).map((fn) => (
                        <span key={fn.name} style={{ ...chipStyle, background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                          {fn.name}
                        </span>
                      ))}
                      {skill.functions.length > 4 && (
                        <span style={{ ...chipStyle, background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                          +{skill.functions.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    v{skill.version} · {skill.functions.length} function{skill.functions.length !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Tools tab ────────────────────────────────────────────────── */}
      {activeTab === 'tools' && (
        <section style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Tools Catalog</h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {tools.length} tool{tools.length !== 1 ? 's' : ''}
            </span>
          </div>
          {tools.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--text-muted)' }}>
              <Hammer size={14} />
              <span style={{ fontSize: 13 }}>
                Tools are registered via MCP server connections. Configure in Administration → Settings → Providers.
              </span>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {tools.map((tool) => (
                <div key={tool.id} style={itemCardStyle}>
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{tool.name}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tool.description}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Templates tab ────────────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <section style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Templates &amp; Presets</h2>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                borderRadius: 999,
                padding: '3px 8px',
                background: 'var(--tone-warning-bg, rgba(245,158,11,0.08))',
                color: 'var(--tone-warning-text, #f59e0b)',
                border: '1px solid var(--tone-warning-border, rgba(245,158,11,0.3))',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Planned — not yet operational
            </span>
          </div>

          {/* Non-interactive notice */}
          <div
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--tone-warning-border, rgba(245,158,11,0.3))',
              background: 'var(--tone-warning-bg, rgba(245,158,11,0.08))',
              padding: '10px 14px',
              fontSize: 12,
              color: 'var(--tone-warning-text, #f59e0b)',
            }}
          >
            Templates are a planned feature. They will allow bootstrapping workspaces from pre-configured starting points once the template catalog backend is implemented. For now, use the <strong>Profiles</strong> tab to create a workspace from a profile directly.
          </div>

          {/* Preview-only cards (non-interactive) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <TemplateCard
              icon={<Layers3 size={18} />}
              title="Runtime defaults"
              description="Use platform defaults for all settings. Best for exploratory workspaces with no special requirements."
            />
            <TemplateCard
              icon={<Sparkles size={18} />}
              title="Profile starter kit"
              description={`Start from any of the ${state.profiles.length} catalog profiles. Pre-wires model, skills, and routines automatically.`}
            />
            <TemplateCard
              icon={<BookOpen size={18} />}
              title="Scoped behavior"
              description="Inherit configuration from a parent scope and apply targeted overrides only where needed."
            />
          </div>
        </section>
      )}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Profile Card ──────────────────────────────────────────────────────────────

function ProfileCard({ profile, selected, onClick }: { profile: ProfileSpec; selected: boolean; onClick: () => void }) {
  const skillCount = profile.defaultSkills?.length ?? 0;
  const routineCount = profile.routines?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--border-primary)'}`,
        background: selected ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
        padding: '12px 14px',
        cursor: 'pointer',
        display: 'grid',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
        <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>{profile.name}</strong>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          {profile.category && (
            <span style={{ ...chipStyle, background: selected ? 'rgba(34,89,242,0.18)' : 'var(--bg-tertiary)', color: selected ? 'var(--color-primary)' : 'var(--text-muted)' }}>
              {profile.category}
            </span>
          )}
          {selected && (
            <span style={{ ...chipStyle, background: 'var(--color-primary)', color: '#fff' }}>
              <Check size={9} /> Active
            </span>
          )}
        </div>
      </div>

      {profile.description && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
          {profile.description}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
        {profile.defaultModel && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Cpu size={10} /> {profile.defaultModel}
          </span>
        )}
        {skillCount > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Zap size={10} /> {skillCount} skill{skillCount !== 1 ? 's' : ''}
          </span>
        )}
        {routineCount > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Star size={10} /> {routineCount} routine{routineCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Profile Detail Panel ──────────────────────────────────────────────────────

function ProfileDetailPanel({
  profile,
  workspaceName,
  onWorkspaceNameChange,
  onCreateWorkspace,
  busy,
}: {
  profile: ProfileSpec;
  workspaceName: string;
  onWorkspaceNameChange: (v: string) => void;
  onCreateWorkspace: () => void;
  busy: boolean;
}) {
  return (
    <>
      {/* Catalog info + effective config */}
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-primary)' }}>{profile.name}</h3>
            {profile.category && (
              <span style={{ ...chipStyle, background: 'var(--color-primary-soft)', color: 'var(--color-primary)', marginTop: 4, display: 'inline-flex' }}>
                {profile.category}
              </span>
            )}
          </div>
          <span style={{ ...chipStyle, background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border-primary)', flexShrink: 0 }}>
            Catalog
          </span>
        </div>

        {profile.description && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{profile.description}</p>
        )}

        {/* Config table */}
        <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
          <ConfigRow label="Model" value={profile.defaultModel ?? 'None'} icon={<Cpu size={11} />} />
          <ConfigRow
            label="Skills"
            value={(profile.defaultSkills ?? []).length > 0 ? `${(profile.defaultSkills ?? []).length} assigned` : 'None'}
            detail={(profile.defaultSkills ?? []).join(', ') || undefined}
            icon={<Zap size={11} />}
          />
          <ConfigRow
            label="Routines"
            value={(profile.routines ?? []).length > 0 ? `${(profile.routines ?? []).length} routines` : 'None'}
            detail={(profile.routines ?? []).join(', ') || undefined}
            icon={<Star size={11} />}
          />
          <ConfigRow
            label="Tags"
            value={(profile.tags ?? []).join(', ') || 'None'}
            icon={<Tag size={11} />}
            last
          />
        </div>

        {/* Skills pills */}
        {(profile.defaultSkills ?? []).length > 0 && (
          <div>
            <div style={sectionLabelStyle}>Assigned Skills</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {(profile.defaultSkills ?? []).map((s) => (
                <span key={s} style={{ ...chipStyle, background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
                  <Zap size={9} /> {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Routines pills */}
        {(profile.routines ?? []).length > 0 && (
          <div>
            <div style={sectionLabelStyle}>Routines</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {(profile.routines ?? []).map((r) => (
                <span key={r} style={{ ...chipStyle, background: 'var(--bg-tertiary)', color: 'var(--text-muted)', border: '1px solid var(--border-primary)' }}>
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create workspace CTA */}
      <div style={panelStyle}>
        <div>
          <div style={sectionLabelStyle}>Use this profile</div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
            Bootstrap a new workspace pre-configured with <strong style={{ color: 'var(--text-primary)' }}>{profile.name}</strong>.
          </p>
        </div>
        <input
          value={workspaceName}
          onChange={(e) => onWorkspaceNameChange(e.target.value)}
          placeholder={`e.g. ${profile.name} Workspace`}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={onCreateWorkspace}
          disabled={busy || !workspaceName.trim()}
          style={{
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: busy || !workspaceName.trim() ? 'var(--bg-tertiary)' : 'var(--color-primary)',
            color: busy || !workspaceName.trim() ? 'var(--text-muted)' : '#fff',
            padding: '10px 14px',
            cursor: busy || !workspaceName.trim() ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {busy ? 'Creating workspace…' : 'Create workspace'}
        </button>
      </div>
    </>
  );
}

// ── Config Row ────────────────────────────────────────────────────────────────

function ConfigRow({
  label,
  value,
  detail,
  icon,
  last,
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr',
        gap: 8,
        padding: '8px 10px',
        background: 'var(--bg-secondary)',
        borderBottom: last ? 'none' : '1px solid var(--border-primary)',
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {icon}{label}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
        {value}
        {detail && <span style={{ color: 'var(--text-muted)', marginLeft: 4, fontWeight: 400 }}>({detail})</span>}
      </span>
    </div>
  );
}

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div style={{ ...itemCardStyle, alignItems: 'start' }}>
      <div style={{ color: 'var(--color-primary)', marginBottom: 2 }}>{icon}</div>
      <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{title}</strong>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{description}</p>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: CSSProperties = {
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  padding: 16,
  display: 'grid',
  gap: 12,
};

const itemCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  padding: 12,
  display: 'grid',
  gap: 6,
};

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 999,
  padding: '2px 7px',
  lineHeight: 1.5,
  whiteSpace: 'nowrap' as const,
};

const inputStyle: CSSProperties = {
  width: '100%',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--input-text)',
  padding: '10px 12px',
  fontSize: 13,
  boxSizing: 'border-box',
};

const sectionLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 6,
};
