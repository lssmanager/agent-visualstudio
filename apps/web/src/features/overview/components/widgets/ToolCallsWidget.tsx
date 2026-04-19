import { SkillSpec } from '../../../../lib/types';
import { DashboardWidget } from '../DashboardWidget';
import { ProgressBar } from '../ProgressBar';

interface ToolCallsWidgetProps {
  skills: SkillSpec[];
}

export function ToolCallsWidget({ skills }: ToolCallsWidgetProps) {
  // Group skills by category and count functions
  const categoryMap = new Map<string, number>();
  for (const skill of skills) {
    const cat = skill.category || 'uncategorized';
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + (skill.functions?.length ?? 1));
  }

  const sorted = [...categoryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const maxVal = sorted.length > 0 ? sorted[0][1] : 1;

  return (
    <DashboardWidget title="Tool calls" chip="today">
      {sorted.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No skills configured</p>
      ) : (
        sorted.map(([cat, count]) => (
          <ProgressBar
            key={cat}
            label={cat}
            value={count}
            max={maxVal}
            tone="primary"
          />
        ))
      )}
    </DashboardWidget>
  );
}
