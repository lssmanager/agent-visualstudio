import { useNavigate } from 'react-router-dom';
import { Plus, Users, BookOpen, GitBranch, Rocket } from 'lucide-react';

interface OverviewHeroProps {
  workspaceName: string;
  description?: string;
}

export function OverviewHero({ workspaceName, description }: OverviewHeroProps) {
  const navigate = useNavigate();

  const actions = [
    { label: 'New agent', icon: Users, path: '/agents/new' },
    { label: 'New profile', icon: BookOpen, path: '/profiles' },
    { label: 'New flow', icon: GitBranch, path: '/routing' },
    { label: 'Test workspace', icon: Rocket, path: '/studio' },
  ];

  return (
    <div
      style={{
        borderRadius: 'var(--radius-2xl)',
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        boxShadow: 'var(--shadow-lg)',
        padding: '32px 36px',
      }}
    >
      {/* Tag pill */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 14px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--color-primary-soft)',
          color: 'var(--color-primary)',
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 16,
        }}
      >
        Dashboard overview · personalizable · editable
      </div>

      {/* Title */}
      <h1
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-3xl)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          margin: '0 0 8px 0',
          lineHeight: 1.2,
        }}
      >
        {workspaceName}
      </h1>

      {/* Description */}
      <p
        style={{
          color: 'var(--text-muted)',
          fontSize: 'var(--text-sm)',
          lineHeight: 1.6,
          maxWidth: 600,
          margin: '0 0 24px 0',
        }}
      >
        {description || 'Monitor your workspace agents, flows, runtime health and sessions from this central dashboard.'}
      </p>

      {/* Quick action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {actions.map(({ label, icon: Icon, path }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-primary)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all var(--transition)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'var(--color-primary-soft)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)';
              (e.currentTarget as HTMLElement).style.color = 'var(--color-primary)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-primary)';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
