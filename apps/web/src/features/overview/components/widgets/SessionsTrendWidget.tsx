import { DashboardWidget } from '../DashboardWidget';

interface SessionsTrendWidgetProps {
  sessionCount: number;
}

export function SessionsTrendWidget({ sessionCount }: SessionsTrendWidgetProps) {
  return (
    <DashboardWidget title="Sessions" chip="24h">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
        {/* Big number */}
        <span
          style={{
            fontSize: 'var(--text-4xl)',
            fontWeight: 700,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-heading)',
            lineHeight: 1,
          }}
        >
          {sessionCount}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
          active sessions
        </span>
      </div>

      {/* Inline SVG sparkline */}
      <svg
        viewBox="0 0 200 50"
        style={{ width: '100%', height: 48, marginTop: 12 }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path
          d="M0,40 L20,35 L40,25 L60,30 L80,15 L100,20 L120,10 L140,18 L160,8 L180,12 L200,5"
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M0,40 L20,35 L40,25 L60,30 L80,15 L100,20 L120,10 L140,18 L160,8 L180,12 L200,5 L200,50 L0,50 Z"
          fill="url(#spark-grad)"
        />
      </svg>
    </DashboardWidget>
  );
}
