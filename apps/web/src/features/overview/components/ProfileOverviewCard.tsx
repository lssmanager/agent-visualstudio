import { ProfileSpec } from '../../../lib/types';

interface ProfileOverviewCardProps {
  profile: ProfileSpec;
  onClick?: () => void;
}

export function ProfileOverviewCard({ profile, onClick }: ProfileOverviewCardProps) {
  const skills = profile.defaultSkills ?? [];
  const maxShown = 3;
  const extra = skills.length - maxShown;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-secondary)',
        background: 'var(--bg-secondary)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all var(--transition)',
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)';
          (e.currentTarget as HTMLElement).style.background = 'var(--color-primary-soft)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-secondary)';
        (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)';
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          {profile.name}
        </p>
        {profile.description && (
          <p style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            margin: '2px 0 0 0',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {profile.description}
          </p>
        )}

        {skills.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {skills.slice(0, maxShown).map((s) => (
              <span
                key={s}
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                }}
              >
                {s}
              </span>
            ))}
            {extra > 0 && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>
                +{extra} more
              </span>
            )}
          </div>
        )}
      </div>

      {profile.category && (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '3px 10px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--color-primary-soft)',
            color: 'var(--color-primary)',
            flexShrink: 0,
            marginLeft: 12,
          }}
        >
          {profile.category}
        </span>
      )}
    </div>
  );
}
