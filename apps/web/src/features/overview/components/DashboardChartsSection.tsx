/**
 * DashboardChartsSection
 * Sección agregadora de todos los charts de Fase 6.
 * Se inserta en OverviewPage debajo de los KPI cards legacy.
 */
import { KpiSparklineCards } from './charts/KpiSparklineCards';
import { RunsErrorRateChart } from './charts/RunsErrorRateChart';
import { TokensStackedArea } from './charts/TokensStackedArea';
import { BudgetGauge } from './charts/BudgetGauge';
import { ModelMixDonut } from './charts/ModelMixDonut';
import { LatencyBarsChart } from './charts/LatencyBarsChart';
import { useKpis, useRunsTimeline } from '../../../lib/useDashboard';

export function DashboardChartsSection() {
  // KPI cards comparten datos con sparkline del timeline
  const kpis = useKpis(30_000);
  const sparkline = useRunsTimeline('24h', '1h');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* OV-01: KPI Sparkline Cards */}
      <KpiSparklineCards
        kpis={kpis.data}
        sparkData={sparkline.data?.buckets}
        loading={kpis.loading}
      />

      {/* OV-02 + OV-03: Runs/Error + Tokens */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
          gap: 14,
        }}
        className="dashboard-charts-2col"
      >
        <RunsErrorRateChart />
        <TokensStackedArea />
      </div>

      {/* OV-05 + OV-06 + OV-09: Budget + Model mix + Latency */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 14,
        }}
        className="dashboard-charts-3col"
      >
        <BudgetGauge />
        <ModelMixDonut />
        <LatencyBarsChart />
      </div>

      <style>{`
        @media (max-width: 900px) {
          .dashboard-charts-2col { grid-template-columns: 1fr !important; }
          .dashboard-charts-3col { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
