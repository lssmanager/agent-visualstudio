import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Activity, Zap, BookOpen, GitBranch, Anchor, Radio, CheckCircle, XCircle } from 'lucide-react';

import type {
  CanonicalNodeLevel,
  DashboardOverviewDto,
  MetricsKpisDto,
  MetricsRunsDto,
  MetricsTokensDto,
  MetricsSessionsDto,
  MetricsBudgetDto,
  MetricsModelMixDto,
  MetricsLatencyDto,
  MetricsSessionsHeatmapDto,
  MetricsRunsTokenCorrelationDto,
  MetricsBudgetForecastDto,
} from '../../../../lib/types';
import {
  getMetricsKpis,
  getMetricsRuns,
  getMetricsTokens,
  getMetricsSessions,
  getMetricsBudget,
  getMetricsModelMix,
  getMetricsLatency,
  getMetricsSessionsHeatmap,
  getMetricsRunsTokenCorrelation,
  getMetricsBudgetForecast,
} from '../../../../lib/api';
import { Sparkline, AreaChart, BarChart, DonutChart, BulletGauge, LatencyBar } from '../../../../components/ui/Charts';
import { AnalyticsStateBoundary } from '../../../analytics/components/AnalyticsStateBoundary';
import { TimeWindowSelector } from '../../../analytics/components/TimeWindowSelector';
import { PlannedVisualQueue } from '../../../analytics/components/PlannedVisualQueue';
import type { AnalyticsWindow } from '../../../analytics/types';

export function OverviewSurface({ data }: { data: DashboardOverviewDto }) {
  const hasFailedRuns = data.runsSummary.failed > 0;
  const runtimeOk = data.runtimeHealth.ok;
  const level = data.scope.level as CanonicalNodeLevel;
  const id = data.scope.id;
  const [window, setWindow] = useState<AnalyticsWindow>('24H');

  const [kpis, setKpis] = useState<MetricsKpisDto | null>(null);
  const [runsMetric, setRunsMetric] = useState<MetricsRunsDto | null>(null);
  const [tokensMetric, setTokensMetric] = useState<MetricsTokensDto | null>(null);
  const [sessionsMetric, setSessionsMetric] = useState<MetricsSessionsDto | null>(null);
  const [budget, setBudget] = useState<MetricsBudgetDto | null>(null);
  const [modelMix, setModelMix] = useState<MetricsModelMixDto | null>(null);
  const [latency, setLatency] = useState<MetricsLatencyDto | null>(null);
  const [sessionsHeatmap, setSessionsHeatmap] = useState<MetricsSessionsHeatmapDto | null>(null);
  const [runsTokenCorrelation, setRunsTokenCorrelation] = useState<MetricsRunsTokenCorrelationDto | null>(null);
  const [budgetForecast, setBudgetForecast] = useState<MetricsBudgetForecastDto | null>(null);

  useEffect(() => {
    void getMetricsKpis(level, id, window).then(setKpis).catch(() => null);
    void getMetricsRuns(level, id, window, '1H').then(setRunsMetric).catch(() => null);
    void getMetricsTokens(level, id, window, '1H').then(setTokensMetric).catch(() => null);
    void getMetricsSessions(level, id, window, '1H').then(setSessionsMetric).catch(() => null);
    void getMetricsBudget(level, id, window).then(setBudget).catch(() => null);
    void getMetricsModelMix(level, id, window).then(setModelMix).catch(() => null);
    void getMetricsLatency(level, id, window).then(setLatency).catch(() => null);
    void getMetricsSessionsHeatmap(level, id, window).then(setSessionsHeatmap).catch(() => null);
    void getMetricsRunsTokenCorrelation(level, id, window).then(setRunsTokenCorrelation).catch(() => null);
    void getMetricsBudgetForecast(level, id, window).then(setBudgetForecast).catch(() => null);
  }, [level, id, window]);

  const runsTrend = kpis?.runs.trend.map((p) => p.value) ?? [];
  const sessionsTrend = kpis?.sessions.trend.map((p) => p.value) ?? [];
  const agentsTrend = kpis?.agents.trend.map((p) => p.value) ?? [];
  const channelsTrend = kpis?.channels.trend.map((p) => p.value) ?? [];

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
      <TimeWindowSelector value={window} onChange={setWindow} />

      {/* ── KPI Sparkline Strip ───────────────────────────────────── */}
      <div style={kpiGrid}>
        <KpiSparkCard
          label="Agents"
          value={kpis?.agents.current ?? data.kpis.agents}
          delta={kpis?.agents.delta}
          sub={`+${data.kpis.subagents} subagents`}
          trend={agentsTrend}
          color="var(--color-primary)"
        />
        <KpiSparkCard
          label="Sessions"
          value={kpis?.sessions.current ?? data.sessionsSummary.active}
          delta={kpis?.sessions.delta}
          sub={`${data.sessionsSummary.total} total · ${data.sessionsSummary.paused} paused`}
          trend={sessionsTrend}
          color="var(--tone-success-text, #10b981)"
          tone={data.sessionsSummary.active > 0 ? 'success' : 'default'}
        />
        <KpiSparkCard
          label="Runs"
          value={kpis?.runs.current ?? data.runsSummary.total}
          delta={kpis?.runs.delta}
          sub={hasFailedRuns ? `${data.runsSummary.failed} failed` : 'all clean'}
          trend={runsTrend}
          color={hasFailedRuns ? 'var(--tone-danger-text, #ef4444)' : 'var(--color-primary)'}
          tone={hasFailedRuns ? 'danger' : 'default'}
        />
        <KpiSparkCard
          label="Channels"
          value={kpis?.channels.current ?? data.channelsSummary.enabledBindings}
          delta={kpis?.channels.delta}
          sub={`${data.channelsSummary.totalBindings} bindings`}
          trend={channelsTrend}
          color="#8b5cf6"
        />
      </div>

      {/* ── Activity chips ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }}>
        <StatusChip label="Running"            value={kpis?.running ?? data.runsSummary.running}          tone={data.runsSummary.running > 0 ? 'primary' : 'muted'} />
        <StatusChip label="Awaiting approval"  value={kpis?.awaitingApproval ?? data.runsSummary.waitingApproval} tone={data.runsSummary.waitingApproval > 0 ? 'warning' : 'muted'} />
        <StatusChip label="Paused sessions"    value={kpis?.paused ?? data.sessionsSummary.paused}        tone={data.sessionsSummary.paused > 0 ? 'warning' : 'muted'} />
        <StatusChip label="Snapshots"          value={kpis?.snapshots ?? data.versionSummary.totalSnapshots} tone="default" />
      </div>

      {/* ── Runs 24h Area Chart ───────────────────────────────────── */}
      {runsMetric && (
        <AnalyticsStateBoundary state={runsMetric.state ?? 'ready'} title="Runs metric">
        {runsMetric.series.length > 0 && (
        <div style={sectionCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={cardLabel}>Runs – 24h</span>
            <div style={{ display: 'flex', gap: 10 }}>
              <LegendDot color="var(--color-primary)" label="total" />
              <LegendDot color="var(--tone-danger-text, #ef4444)" label="failed" />
            </div>
          </div>
          <AreaChart
            series={[
              { key: 'total',  color: 'var(--color-primary)',                    values: runsMetric.series.map((s) => s.total) },
              { key: 'failed', color: 'var(--tone-danger-text, #ef4444)',         values: runsMetric.series.map((s) => s.failed) },
            ]}
            labels={runsMetric.series.map((s) => s.ts.slice(11, 16))}
            height={80}
          />
          <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
            <Stat label="Total" value={runsMetric.totals.total} />
            <Stat label="Failed" value={runsMetric.totals.failed} tone="danger" />
            <Stat label="Error rate" value={`${(runsMetric.totals.errorRate * 100).toFixed(1)}%`} tone={runsMetric.totals.errorRate > 0.1 ? 'danger' : 'success'} />
          </div>
        </div>
      )}
        </AnalyticsStateBoundary>
      )}

      {/* ── Tokens + Sessions row ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* Tokens */}
        {tokensMetric && (
          <AnalyticsStateBoundary state={tokensMetric.state ?? 'ready'} title="Tokens metric">
          <div style={sectionCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={cardLabel}>Tokens – 24h</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <LegendDot color="var(--color-primary)" label="prompt" />
                <LegendDot color="#8b5cf6" label="completion" />
              </div>
            </div>
            <AreaChart
              series={[
                { key: 'prompt',     color: 'var(--color-primary)', values: tokensMetric.series.map((s) => s.prompt) },
                { key: 'completion', color: '#8b5cf6',              values: tokensMetric.series.map((s) => s.completion) },
              ]}
              height={70}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <Stat label="Prompt"     value={fmt(tokensMetric.totals.prompt)} />
              <Stat label="Completion" value={fmt(tokensMetric.totals.completion)} />
            </div>
          </div>
          </AnalyticsStateBoundary>
        )}

        {/* Sessions */}
        {sessionsMetric && (
          <AnalyticsStateBoundary state={sessionsMetric.state ?? 'ready'} title="Sessions metric">
          <div style={sectionCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={cardLabel}>Sessions – 24h</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <LegendDot color="var(--tone-success-text, #10b981)" label="active" />
                <LegendDot color="var(--text-muted)" label="completed" />
              </div>
            </div>
            <AreaChart
              series={[
                { key: 'active',    color: 'var(--tone-success-text, #10b981)', values: sessionsMetric.series.map((s) => s.active) },
                { key: 'completed', color: 'var(--text-muted)',                 values: sessionsMetric.series.map((s) => s.completed) },
              ]}
              height={70}
            />
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <Stat label="Active"    value={sessionsMetric.totals.active} tone="success" />
              <Stat label="Completed" value={sessionsMetric.totals.completed} />
            </div>
          </div>
          </AnalyticsStateBoundary>
        )}

        {/* Fallback if no metrics yet */}
        {!tokensMetric && !sessionsMetric && (
          <>
            <div style={sectionCard}>
              <div style={cardLabel}>Structure</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                <StructRow icon={<GitBranch size={10} />} label="Departments" value={data.kpis.departments} />
                <StructRow icon={<Anchor size={10} />} label="Workspaces" value={data.kpis.workspaces} />
                <StructRow icon={<BookOpen size={10} />} label="Profiles" value={data.kpis.profiles} />
                <StructRow icon={<Zap size={10} />} label="Skills" value={data.kpis.skills} />
              </div>
            </div>
            <div style={sectionCard}>
              <div style={cardLabel}>Coverage</div>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <MeterRow label="Hook coverage" value={data.hooksCoverage.enabledHooks} max={Math.max(data.hooksCoverage.totalHooks, 1)} tone="primary" />
                <MeterRow label="Enabled channels" value={data.channelsSummary.enabledBindings} max={Math.max(data.channelsSummary.totalBindings, 1)} tone="success" />
                <MeterRow label="Runtime actions" value={data.runtimeHealth.supportedTopologyActions} max={6} tone={data.runtimeHealth.supportedTopologyActions < 3 ? 'warning' : 'success'} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Budget gauges ─────────────────────────────────────────── */}
      {budget && (
        <AnalyticsStateBoundary state={budget.state ?? 'ready'} title="Budget metric">
        {budget.budgets.length > 0 && (
        <div style={sectionCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={cardLabel}>Budget Usage</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              ${budget.totalUsedUsd.toFixed(2)} / ${budget.totalLimitUsd.toFixed(2)}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {budget.budgets.slice(0, 4).map((b) => (
              <BulletGauge key={b.id} label={b.name} value={b.pctUsed} status={b.status} />
            ))}
          </div>
        </div>
      )}
        </AnalyticsStateBoundary>
      )}

      {/* ── Model mix + Latency ───────────────────────────────────── */}
      {(modelMix || latency) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {/* Model mix donut */}
          {modelMix && (
            <AnalyticsStateBoundary state={modelMix.state ?? 'ready'} title="Model mix metric">
            {modelMix.models.length > 0 && (
            <div style={sectionCard}>
              <div style={cardLabel}>Model Mix</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
                <DonutChart
                  slices={modelMix.models.slice(0, 6).map((m, i) => ({
                    label: m.model,
                    value: m.count,
                    color: PALETTE[i % PALETTE.length],
                  }))}
                  size={80}
                  thickness={18}
                  centerLabel={`${modelMix.models.length}`}
                  centerSub="models"
                />
                <div style={{ display: 'grid', gap: 4, flex: 1, minWidth: 0 }}>
                  {modelMix.models.slice(0, 5).map((m, i) => (
                    <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                      <span style={{ fontSize: 9, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.model}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {m.pct.toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
            </AnalyticsStateBoundary>
          )}

          {/* Latency bars */}
          {latency && (
            <AnalyticsStateBoundary state={latency.state ?? 'ready'} title="Latency metric">
            {latency.models.length > 0 && (
            <div style={sectionCard}>
              <div style={cardLabel}>Latency (p50 / p95)</div>
              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                {latency.models.slice(0, 5).map((m) => (
                  <LatencyBar key={m.model} model={m.model} p50={m.p50ms} p95={m.p95ms} />
                ))}
              </div>
            </div>
          )}
            </AnalyticsStateBoundary>
          )}
        </div>
      )}

      {/* ── Structure + Coverage (always shown) ─────────────────── */}
      {modelMix && modelMix.models.length > 0 && (
        <div style={sectionCard}>
          <div style={cardLabel}>Model Spend Ranked</div>
          <div style={{ marginTop: 8 }}>
            <BarChart
              data={modelMix.models
                .slice()
                .sort((a, b) => b.costUsd - a.costUsd)
                .slice(0, 8)
                .map((item, index) => ({
                  label: item.model,
                  value: Math.max(0, Math.round(item.costUsd * 100)),
                  color: PALETTE[index % PALETTE.length],
                }))}
              height={90}
            />
          </div>
        </div>
      )}

      {(tokensMetric || sessionsMetric) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={sectionCard}>
            <div style={cardLabel}>Structure</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
              <StructRow icon={<GitBranch size={10} />} label="Departments" value={data.kpis.departments} />
              <StructRow icon={<Anchor size={10} />} label="Workspaces"   value={data.kpis.workspaces} />
              <StructRow icon={<BookOpen size={10} />} label="Profiles"   value={data.kpis.profiles} />
              <StructRow icon={<Zap size={10} />} label="Skills"          value={data.kpis.skills} />
            </div>
          </div>
          <div style={sectionCard}>
            <div style={cardLabel}>Coverage</div>
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              <MeterRow label="Hook coverage"   value={data.hooksCoverage.enabledHooks}           max={Math.max(data.hooksCoverage.totalHooks, 1)}          tone="primary" />
              <MeterRow label="Enabled channels" value={data.channelsSummary.enabledBindings}     max={Math.max(data.channelsSummary.totalBindings, 1)}      tone="success" />
              <MeterRow label="Runtime actions"  value={data.runtimeHealth.supportedTopologyActions} max={6} tone={data.runtimeHealth.supportedTopologyActions < 3 ? 'warning' : 'success'} />
            </div>
          </div>
        </div>
      )}

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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <div style={sectionCard}>
          <div style={cardLabel}>Sessions Heatmap (P1)</div>
          {sessionsHeatmap ? (
            <AnalyticsStateBoundary state={sessionsHeatmap.state ?? 'ready'} title="Sessions heatmap">
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 2 }}>
                {sessionsHeatmap.cells.filter((cell) => cell.hour % 4 === 0).slice(0, 84).map((cell, idx) => {
                  const intensity = Math.min(1, cell.sessions / 6);
                  return <div key={`${cell.weekday}-${cell.hour}-${idx}`} title={`d${cell.weekday} h${cell.hour}: ${cell.sessions}`} style={{ height: 10, borderRadius: 2, background: `rgba(59,130,246,${0.12 + intensity * 0.75})`, border: '1px solid var(--border-primary)' }} />;
                })}
              </div>
            </AnalyticsStateBoundary>
          ) : (
            <AnalyticsStateBoundary state="planned_not_operational" title="Sessions heatmap">
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Planned or unavailable.</div>
            </AnalyticsStateBoundary>
          )}
        </div>
        <div style={sectionCard}>
          <div style={cardLabel}>Runs ↔ Tokens Correlation (P1)</div>
          {runsTokenCorrelation ? (
            <AnalyticsStateBoundary state={runsTokenCorrelation.state ?? 'ready'} title="Runs-token correlation">
              <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                {runsTokenCorrelation.points.slice(-8).map((point) => (
                  <div key={point.hourBucket} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{new Date(point.hourBucket).toLocaleTimeString()}</span>
                    <span style={{ color: 'var(--text-primary)' }}>{point.runs} runs</span>
                    <span style={{ color: 'var(--text-muted)' }}>{fmt(point.tokens)} tok</span>
                  </div>
                ))}
              </div>
            </AnalyticsStateBoundary>
          ) : (
            <AnalyticsStateBoundary state="planned_not_operational" title="Runs-token correlation">
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Planned or unavailable.</div>
            </AnalyticsStateBoundary>
          )}
        </div>
        <div style={sectionCard}>
          <div style={cardLabel}>Budget Forecast (P1)</div>
          {budgetForecast ? (
            <AnalyticsStateBoundary state={budgetForecast.state ?? 'ready'} title="Budget forecast">
              <div style={{ marginTop: 8, display: 'grid', gap: 6, fontSize: 11 }}>
                <div style={{ color: 'var(--text-muted)' }}>Current: <strong style={{ color: 'var(--text-primary)' }}>${budgetForecast.currentSpendUsd.toFixed(2)}</strong></div>
                <div style={{ color: 'var(--text-muted)' }}>Soft cap: ${budgetForecast.softCapUsd.toFixed(2)} {budgetForecast.projectedSoftCapAt ? `→ ${new Date(budgetForecast.projectedSoftCapAt).toLocaleDateString()}` : ''}</div>
                <div style={{ color: 'var(--text-muted)' }}>Hard cap: ${budgetForecast.hardCapUsd.toFixed(2)} {budgetForecast.projectedHardCapAt ? `→ ${new Date(budgetForecast.projectedHardCapAt).toLocaleDateString()}` : ''}</div>
              </div>
            </AnalyticsStateBoundary>
          ) : (
            <AnalyticsStateBoundary state="planned_not_operational" title="Budget forecast">
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Planned or unavailable.</div>
            </AnalyticsStateBoundary>
          )}
        </div>
      </div>

      {data.versionSummary.latestSnapshotAt && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 8, borderTop: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Activity size={10} />
            Latest snapshot:{' '}
            <strong>{data.versionSummary.latestLabel ?? data.versionSummary.latestSnapshotId ?? 'unnamed'}</strong>
          </span>
          <span>{new Date(data.versionSummary.latestSnapshotAt).toLocaleString()}</span>
        </div>
      )}

      <PlannedVisualQueue
        title="P2 Refinements"
        items={[
          { id: 'ov-p2-1', label: 'Cost Anomaly Bands', note: 'Requires anomaly scoring contract per model/time bucket.' },
          { id: 'ov-p2-2', label: 'Fallback Transition Timeline', note: 'Requires model fallback transition events in runtime telemetry.' },
          { id: 'ov-p2-3', label: 'Budget Guardrail Simulation', note: 'Requires scenario simulation endpoint with policy snapshots.' },
        ]}
      />
    </section>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const PALETTE = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'danger' | 'success' }) {
  const color = tone === 'danger' ? 'var(--tone-danger-text, #ef4444)' : tone === 'success' ? 'var(--tone-success-text, #10b981)' : 'var(--text-primary)';
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color }}>{value}</div>
    </div>
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

function KpiSparkCard({
  label, value, delta, sub, trend, color, tone = 'default',
}: {
  label: string; value: number; delta?: number; sub?: string;
  trend: number[]; color: string; tone?: Tone;
}) {
  const { text, bg } = toneColor(tone);
  const showDelta = typeof delta === 'number';
  const deltaPositive = (delta ?? 0) >= 0;

  return (
    <div style={{ ...kpiCardStyle, background: bg }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, color: text, lineHeight: 1.1 }}>{value}</div>
          {showDelta && (
            <div style={{ fontSize: 9, color: deltaPositive ? 'var(--tone-success-text,#10b981)' : 'var(--tone-danger-text,#ef4444)', marginTop: 2 }}>
              {deltaPositive ? '▲' : '▼'} {Math.abs(delta!)} vs prev
            </div>
          )}
          {sub && !showDelta && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
        </div>
        {trend.length > 1 && (
          <div style={{ paddingBottom: 4 }}>
            <Sparkline data={trend} color={color} height={30} width={64} fill />
          </div>
        )}
      </div>
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
    <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border-primary)', background: bg, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
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

