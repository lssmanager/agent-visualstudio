import { ProfileSpec } from '../../../lib/types';
import { BookOpen, Wrench, Clock } from 'lucide-react';

interface ProfileSummaryCardProps {
  profile: ProfileSpec;
}

export function ProfileSummaryCard({ profile }: ProfileSummaryCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <BookOpen size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-slate-800">{profile.name}</p>
          {profile.description && (
            <p className="text-xs text-slate-500 mt-0.5 leading-snug">{profile.description}</p>
          )}
        </div>
      </div>

      {profile.defaultModel && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Model:</span>
          <span className="font-mono bg-white border border-slate-200 text-slate-700 rounded px-1.5 py-0.5 text-xs">
            {profile.defaultModel}
          </span>
        </div>
      )}

      {profile.defaultSkills && profile.defaultSkills.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
            <Wrench size={12} />
            <span>Skills ({profile.defaultSkills.length})</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {profile.defaultSkills.map((s) => (
              <span
                key={s}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-white border border-slate-200 text-slate-600"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {profile.routines && profile.routines.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
            <Clock size={12} />
            <span>Routines ({profile.routines.length})</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {profile.routines.map((r) => (
              <span
                key={r}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-white border border-blue-200 text-blue-600"
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
