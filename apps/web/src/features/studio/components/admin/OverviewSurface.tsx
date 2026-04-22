import { type CSSProperties, type ReactNode } from 'react';
import { Activity, Zap, BookOpen, GitBranch, Anchor, Radio, CheckCircle, XCircle } from 'lucide-react';

import type { DashboardOverviewDto } from '../../../../lib/types';

export function OverviewSurface({ data }: { data: DashboardOverviewDto }) {
  const hasFailedRuns = data.runsSummary.failed > 0;
  const runtimeOk = data.runtimeHealth.ok;

  return (
    <section style={panelStyle}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--text-lg)' }}>Overview</h2>
        <span style={levelBadge}>{data.scope.level}</span>
        <span
          style={{
            ...runtimePill,
            background: runtimeOk
              ? 'var(--tone-success-bg, rgba(16,185,129,0.1))'
              : 'var(--tone-danger-bg, rgba(239,68,68,0.08))',
            color: runtimeOk
              ? 'var(--tone-success-text, #10b981)'
              : 'var(--tone-danger-text, #ef4444)',
          }}
        >
          {runtimeOk ? <CheckCircle size={9} /> : <XCircle size={9} />}
          {runtimeOk ? 'Runtime online' : 'Runtime degraded'}
        </span>
      </div>

      {/* ── Primary KPI Strip ─────────────────────────────────────── */}
      <div style={kpiGrid}>
        <KpiCard
          label="Agents"
          value={data.kpis.agents}
          sub={`+ ${data.kpis.subagents} subagents`}
        />
        <KpiCard
          label="Active Sessions"
          value={data.sessionsSummary.active}
          sub={`${data.sessionsSummary.total} total · ${data.sessionsSummary.paused} paused`}
          tone={data.sessionsSummary.active > 0 ? 'primary' : 'default'}
        />
        <KpiCard
          label="Runs"
          value={data.runsSummary.total}
          sub={hasFailedRuns ? `${data.runsSummary.failed} failed` : 'all clean'}
          tone={hasFailedRuns ? 'danger' : 'default'}
        />
        <KpiCard
          label="Channels"
          value={data.channelsSummary.enabledBindings}
          sub={`${data.channelsSummary.totalBindings} bindings · ${data.channelsSummary.uniqueChannels.length} types`}
        />
      </div>

      {/* ── Structure + Coverage ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* Structure */}
        <div style={sectionCard}>
          <div style={cardLabel}>Structure</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
            <StructRow icon={<GitBranch size={10} />} label="Departments" value={data.kpis.departments} />
            <StructRow icon={<Anchor size={10} />} label="Workspaces" value={data.kpis.workspaces} />
            <StructRow icon={<BookOpen size={10} />} label="Profiles" value={data.kpis.profiles} />
            <StructRow icon={<Zap size={10} />} label="Skills" value={data.kpis.skills} />
          </div>
        </div>

        {/* Coverage */}
        <div style={sectionCard}>
          <div style={cardLabel}>Coverage</div>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <MeterRow
              label="Hook coverage"
              value={data.hooksCoverage.enabledHooks}
              max={Math.max(data.hooksCoverage.totalHooks, 1)}
              tone="primary"
            />
            <MeterRow
              label="Enabled channels"
              value={data.channelsSummary.enabledBindings}
              max={Math.max(data.channelsSummary.totalBindings, 1)}
              tone="success"
            />
            <MeterRow
              label="Runtime actions"
              value={data.runtimeHealth.supportedTopologyActions}
              max={6}
              tone={data.runtimeHealth.supportedTopologyActions < 3 ? 'warning' : 'success'}
            />
          </div>
        </div>
      </div>

      {/* ── Activity strip ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }}>
        <StatusChip
          label="Running"
          value={data.runsSummary.running}
          tone={data.runsSummary.running > 0 ? 'primary' : 'muted'}
        />
        <StatusChip
          label="Awaiting approval"
          value={data.runsSummary.waitingApproval}
          tone={data.runsSummary.waitingApproval > 0 ? 'warning' : 'muted'}
        />
        <StatusChip
          label="Paused sessions"
          value={data.sessionsSummary.paused}
          tone={data.sessionsSummary.paused > 0 ? 'warning' : 'muted'}
        />
        <StatusChip
          label="Snapshots"
          value={data.versionSummary.totalSnapshots}
          tone="default"
        />
      </div>

      {/* ── Channel types ────────────────────────────────────────── */}
      {data.channelsSummary.uniqueChannels.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Radio size={11} style={{ color: 'var(--text-muted)' }} />
          {data.channelsSummary.uniqueChannels.map((ch) => (
            <span key={ch} style={channelChip}>{ch}</span>
          ))}
        </div>
      )}

      {/* ── Version footer ───────────────────────────────────────── */}
      {data.versionSummary.latestSnapshotAt && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            paddingTop: 8,
            borderTop: '1px solid var(--border-primary)',
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Activity size={10} />
            Latest snapshot:{' '}
            <strong>{data.versionSummary.latestLabel ?? data.versionSummary.latestSnapshotId ?? 'unnamed'}</strong>
          </span>
          <span>{new Date(data.versionSummary.latestSnapshotAt).toLocaleString()}</span>
        </div>
      )}
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'muted';

function toneColor(tone: Tone): { text: string; bg: string } {
  switch (tone) {
    case 'primary':  return { text: 'var(--color-primary)', bg: 'var(--color-primary-soft)' };
    case 'success':  return { text: 'var(--tone-success-text, #10b981)', bg: 'var(--tone-success-bg, rgba(16,185,129,0.08))' };
    case 'warning':  return { text: 'var(--tone-warning-text, #f59e0b)', bg: 'var(--tone-warning-bg, rgba(245,158,11,0.08))' };
    case 'danger':   return { text: 'var(--tone-danger-text, #ef4444)', bg: 'var(--tone-danger-bg, rgba(239,68,68,0.08))' };
    case 'muted':    return { text: 'var(--text-muted)', bg: 'var(--bg-tertiary)' };
    default:         return { text: 'var(--text-primary)', bg: 'var(--bg-secondary)' };
  }
}

function KpiCard({ label, value, sub, tone = 'default' }: { label: string; value: number; sub?: string; tone?: Tone }) {
  const { text, bg } = toneColor(tone);
  return (
    <div style={{ ...kpiCardStyle, background: bg }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: text, lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function StructRow({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ color: 'var(--text-muted)' }}>{icon}</span>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function MeterRow({ label, value, max, tone }: { label: string; value: number; max: number; tone: Tone }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const { text } = toneColor(tone);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: text }}>{value}/{max}</span>
      </div>
      <div style={{ height: 4, borderRadius: 99, background: 'var(--border-primary)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: text, borderRadius: 99, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

function StatusChip({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const { text, bg } = toneColor(tone);
  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-primary)',
        background: bg,
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 800, color: text }}>{value}</span>
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

const kpiGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0,1fr))',
  gap: 10,
};

const kpiCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  padding: '12px 14px',
};

const sectionCard: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-secondary)',
  padding: 12,
};

const cardLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
};

const levelBadge: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 999,
  padding: '2px 7px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  background: 'var(--color-primary-soft)',
  color: 'var(--color-primary)',
};

const runtimePill: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 999,
  padding: '2px 7px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const channelChip: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  borderRadius: 999,
  padding: '2px 7px',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-primary)',
  color: 'var(--text-muted)',
};
