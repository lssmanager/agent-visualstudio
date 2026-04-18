import { type ComponentType } from 'react';
import { type LucideProps } from 'lucide-react';

interface EmptySectionProps {
  icon:         ComponentType<LucideProps>;
  title:        string;
  description?: string;
  ctaLabel?:    string;
  onCta?:       () => void;
}

export function EmptySection({ icon: Icon, title, description, ctaLabel, onCta }: EmptySectionProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <Icon size={48} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
      <div className="space-y-1">
        <p className="text-base font-heading font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
          {title}
        </p>
        {description && (
          <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
            {description}
          </p>
        )}
      </div>
      {ctaLabel && onCta && (
        <button
          onClick={onCta}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: 'var(--color-primary)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-primary-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-primary)'; }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}
