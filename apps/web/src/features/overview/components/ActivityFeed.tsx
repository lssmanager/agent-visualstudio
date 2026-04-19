import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { SectionCard } from '../../../components/ui/SectionCard';
import { FunctionsSummaryWidget } from './widgets/FunctionsSummaryWidget';

interface ActivityFeedProps {
  runtimeOk: boolean;
  diagnostics: string[];
  agentCount: number;
  enabledAgentCount: number;
  profileCount: number;
  flowCount: number;
  enabledFlowCount: number;
  sessionCount: number;
}

interface AlertItem {
  icon: typeof AlertTriangle;
  label: string;
  tone: 'success' | 'warning' | 'danger';
}

export function ActivityFeed({
  runtimeOk,
  diagnostics,
  agentCount,
  enabledAgentCount,
  profileCount,
  flowCount,
  enabledFlowCount,
  sessionCount,
}: ActivityFeedProps) {
  const alerts: AlertItem[] = [];

  if (!runtimeOk) {
    alerts.push({ icon: AlertTriangle, label: 'Runtime degraded — Gateway not responding', tone: 'danger' });
  }
  if (diagnostics.length > 0) {
    alerts.push({ icon: AlertTriangle, label: `Compilation: ${diagnostics.length} issue${diagnostics.length > 1 ? 's' : ''} detected`, tone: 'warning' });
  }
  if (runtimeOk && diagnostics.length === 0) {
    alerts.push({ icon: CheckCircle, label: 'All systems operational', tone: 'success' });
  }

  const toneMap = {
    success: { bg: 'var(--tone-success-bg)', border: 'var(--tone-success-border)', color: 'var(--tone-success-text)' },
    warning: { bg: 'var(--tone-warning-bg)', border: 'var(--tone-warning-border)', color: 'var(--tone-warning-text)' },
    danger:  { bg: 'var(--tone-danger-bg)',  border: 'var(--tone-danger-border)',  color: 'var(--tone-danger-text)' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Alerts */}
      <SectionCard title="Activity + Alerts" icon={<Info size={16} />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map((alert, i) => {
            const tone = toneMap[alert.tone];
            const Icon = alert.icon;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                }}
              >
                <Icon size={14} style={{ color: tone.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: tone.color }}>{alert.label}</span>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Functions summary */}
      <FunctionsSummaryWidget
        agentCount={agentCount}
        enabledAgentCount={enabledAgentCount}
        profileCount={profileCount}
        flowCount={flowCount}
        enabledFlowCount={enabledFlowCount}
        sessionCount={sessionCount}
      />
    </div>
  );
}
