import { ProfileSpec } from '../../../lib/types';
import { BookOpen, Wrench, Clock } from 'lucide-react';

interface ProfileSummaryCardProps {
  profile: ProfileSpec;
}

export function ProfileSummaryCard({ profile }: ProfileSummaryCardProps) {
  return (
    <div
      className="rounded-xl border p-4 space-y-3"
      style={{
        borderColor: 'var(--border-primary)',
        background: 'var(--bg-secondary)',
      }}
    >
      <div className="flex items-start gap-2">
        <BookOpen size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-primary)' }} />
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{profile.name}</p>
          {profile.description && (
            <p className="text-xs mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>{profile.description}</p>
          )}
        </div>
      </div>

      {profile.defaultModel && (
        <div className="flex items-center gap-2 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>Model:</span>
          <span
            className="font-mono rounded px-1.5 py-0.5 text-xs border"
            style={{
              background: 'var(--input-bg)',
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          >
            {profile.defaultModel}
          </span>
        </div>
      )}

      {profile.defaultSkills && profile.defaultSkills.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
            <Wrench size={12} />
            <span>Skills ({profile.defaultSkills.length})</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {profile.defaultSkills.map((s) => (
              <span
                key={s}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono border"
                style={{
                  background: 'var(--input-bg)',
                  borderColor: 'var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {profile.routines && profile.routines.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
            <Clock size={12} />
            <span>Routines ({profile.routines.length})</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {profile.routines.map((r) => (
              <span
                key={r}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono border"
                style={{
                  background: 'var(--input-bg)',
                  borderColor: 'var(--color-primary)',
                  color: 'var(--color-primary)',
                }}
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
