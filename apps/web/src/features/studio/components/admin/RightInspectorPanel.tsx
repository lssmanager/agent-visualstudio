import { useState, type CSSProperties, type ReactNode } from 'react';
import { Activity, Zap, Cpu, Tag, ChevronDown, ChevronRight } from 'lucide-react';

import type { DashboardInspectorDto } from '../../../../lib/types';

export function RightInspectorPanel({ data }: { data: DashboardInspectorDto | null }) {
  return (
    <aside style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-md)' }}>Inspector</h3>
        {data && (
          <span
            style={{
              ...levelBadge,
              background: 'var(--color-primary-soft)',
              color: 'var(--color-primary)',
            }}
          >
            {data.entityMeta.level}
          </span>
        )}
      </div>

      {data ? (
        <>
          {/* Entity name + description */}
          <div style={{ paddingBottom: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              {data.entityMeta.name}
            </div>
            {data.entityMeta.description && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                {data.entityMeta.description}
              </div>
            )}
            {data.entityMeta.owner && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Owner: <strong>{data.entityMeta.owner}</strong>
              </div>
            )}
            {data.entityMeta.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                {data.entityMeta.tags.map((tag) => (
                  <span key={tag} style={{ ...tagChip }}>
                    <Tag size={9} /> {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Effective Config Summary */}
          <Section title="Effective Config">
            <div style={{ display: 'grid', gap: 1, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
              <ConfigRow icon={<Cpu size={10} />} label="Model" value={data.effectiveConfigSummary.model ?? 'None'} />
              <ConfigRow
                icon={<Zap size={10} />}
                label="Skills"
                value={data.effectiveConfigSummary.skills.length > 0 ? `${data.effectiveConfigSummary.skills.length} assigned` : 'None'}
                detail={data.effectiveConfigSummary.skills.join(', ') || undefined}
              />
              <ConfigRow
                icon={<Activity size={10} />}
                label="Routing"
                value={data.effectiveConfigSummary.routingRules > 0 ? `${data.effectiveConfigSummary.routingRules} rule${data.effectiveConfigSummary.routingRules !== 1 ? 's' : ''}` : 'None'}
                last
              />
            </div>
          </Section>

          {/* Assigned Profiles */}
          <Section title="Assigned Profiles">
            {data.assignedProfiles.length === 0 ? (
              <EmptyText text="No profiles assigned in this scope." />
            ) : (
              data.assignedProfiles.map((item) => (
                <BindingRow key={item.id} name={item.name} source={item.source} />
              ))
            )}
          </Section>

          {/* Skills Bindings */}
          <Section title="Skills">
            {data.skillBindings.length === 0 ? (
              <EmptyText text="No skills in this scope." />
            ) : (
              <>
                {data.skillBindings.slice(0, 6).map((item) => (
                  <BindingRow key={item.id} name={item.name} source={item.source} enabled={item.enabled} />
                ))}
                {data.skillBindings.length > 6 && (
                  <EmptyText text={`+${data.skillBindings.length - 6} more`} />
                )}
              </>
            )}
          </Section>

          {/* Tool Bindings */}
          {data.toolBindings.length > 0 && (
            <Section title="Tools" defaultOpen={false}>
              {data.toolBindings.slice(0, 5).map((item) => (
                <BindingRow key={item.id} name={item.name} source={item.source} enabled={item.enabled} />
              ))}
              {data.toolBindings.length > 5 && (
                <EmptyText text={`+${data.toolBindings.length - 5} more`} />
              )}
            </Section>
          )}

          {/* Recent Changes */}
          <Section title="Recent Changes">
            {data.recentChanges.length === 0 ? (
              <EmptyText text="No recent changes." />
            ) : (
              data.recentChanges.slice(0, 5).map((item, index) => (
                <div key={`${item.at}-${index}`} style={changeItemStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{item.type}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{item.at}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.message}</div>
                </div>
              ))
            )}
          </Section>
        </>
      ) : (
        <div style={{ padding: '24px 0', textAlign: 'center', display: 'grid', gap: 6 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Activity size={14} style={{ color: 'var(--text-muted)' }} />
          </div>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>Loading inspector…</p>
        </div>
      )}
    </aside>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={sectionStyle}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%' }}
      >
        <h4 style={{ margin: 0, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', fontWeight: 700 }}>
          {title}
        </h4>
        {open
          ? <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
          : <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />
        }
      </button>
      {open && <div style={{ display: 'grid', gap: 6 }}>{children}</div>}
    </section>
  );
}

function ConfigRow({
  icon,
  label,
  value,
  detail,
  last,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr',
        gap: 6,
        padding: '6px 8px',
        background: 'var(--bg-secondary)',
        borderBottom: last ? 'none' : '1px solid var(--border-primary)',
      }}
    >
      <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
        {icon}{label}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>
        {value}
        {detail && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 3 }}>({detail})</span>}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 6 }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontSize: 11 }}>{value}</span>
    </div>
  );
}

function BindingRow({ name, source, enabled }: { name: string; source: string; enabled?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--text-primary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          padding: '1px 5px',
          borderRadius: 999,
          background: enabled === false ? 'var(--bg-tertiary)' : 'var(--color-primary-soft)',
          color: enabled === false ? 'var(--text-muted)' : 'var(--color-primary)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {source}{enabled === false ? ' · off' : ''}
      </span>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>{text}</div>;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const panelStyle: CSSProperties = {
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  padding: 16,
  display: 'grid',
  gap: 12,
  alignContent: 'start',
};

const sectionStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  padding: 10,
  display: 'grid',
  gap: 6,
};

const changeItemStyle: CSSProperties = {
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-primary)',
  padding: '6px 8px',
  display: 'grid',
  gap: 3,
};

const levelBadge: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 999,
  padding: '2px 7px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tagChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  fontSize: 10,
  fontWeight: 600,
  borderRadius: 999,
  padding: '2px 6px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-primary)',
  color: 'var(--text-muted)',
};
