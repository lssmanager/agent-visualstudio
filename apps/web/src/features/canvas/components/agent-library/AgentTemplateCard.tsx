import type { AgentTemplate } from './useAgencyTemplates';

interface AgentTemplateCardProps {
  agent: AgentTemplate;
  onClick: (agent: AgentTemplate) => void;
}

const DEPT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  engineering:          { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
  design:               { bg: '#fdf4ff', text: '#7e22ce', dot: '#a855f7' },
  marketing:            { bg: '#fff7ed', text: '#c2410c', dot: '#f97316' },
  product:              { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' },
  sales:                { bg: '#fef9c3', text: '#854d0e', dot: '#eab308' },
  finance:              { bg: '#ecfdf5', text: '#065f46', dot: '#10b981' },
  testing:              { bg: '#f0f9ff', text: '#0369a1', dot: '#0ea5e9' },
  strategy:             { bg: '#faf5ff', text: '#6b21a8', dot: '#9333ea' },
  support:              { bg: '#fff1f2', text: '#be123c', dot: '#f43f5e' },
  'project-management': { bg: '#f8fafc', text: '#334155', dot: '#64748b' },
  integrations:         { bg: '#f0fdfa', text: '#115e59', dot: '#14b8a6' },
  'game-development':   { bg: '#fefce8', text: '#713f12', dot: '#f59e0b' },
  academic:             { bg: '#eff6ff', text: '#1e3a8a', dot: '#6366f1' },
  specialized:          { bg: '#fdf2f8', text: '#9d174d', dot: '#ec4899' },
};

const DEFAULT_COLOR = { bg: '#f8fafc', text: '#475569', dot: '#94a3b8' };

export function AgentTemplateCard({ agent, onClick }: AgentTemplateCardProps) {
  const colors = DEPT_COLORS[agent.department] ?? DEFAULT_COLOR;
  const shortDesc =
    agent.description.length > 150
      ? agent.description.slice(0, 147) + '…'
      : agent.description;

  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>) => {
    // Serializar el AgentTemplate completo para que EditableFlowCanvas lo consuma
    e.dataTransfer.setData(
      'application/agency-agent-template',
      JSON.stringify(agent),
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <button
      draggable
      onDragStart={handleDragStart}
      onClick={() => onClick(agent)}
      className="w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm focus-visible:outline-none focus-visible:ring-2"
      style={{
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border-primary)',
        cursor: 'grab',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = colors.dot;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-primary)';
      }}
      aria-label={`Ver o arrastrar agente ${agent.name}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none flex-shrink-0" role="img" aria-label={agent.department}>
            {agent.emoji ?? '🤖'}
          </span>
          <span
            className="text-xs font-medium truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {agent.name}
          </span>
        </div>

        {/* Badge fuente + hint drag */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span
            className="text-[9px] opacity-40"
            style={{ color: 'var(--text-muted)' }}
            title="Arrastra al canvas"
          >
            ☰
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
            style={{ background: colors.bg, color: colors.text }}
          >
            agency-agents
          </span>
        </div>
      </div>

      {/* Descripción corta */}
      <p
        className="text-[11px] leading-relaxed line-clamp-3"
        style={{ color: 'var(--text-muted)' }}
      >
        {shortDesc}
      </p>

      {/* Tags */}
      {agent.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {agent.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{ background: 'var(--shell-chip-bg)', color: 'var(--text-muted)' }}
            >
              {tag}
            </span>
          ))}
          {agent.tags.length > 3 && (
            <span
              className="text-[10px]"
              style={{ color: 'var(--text-faint)' }}
            >
              +{agent.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
