import { type ReactNode } from 'react';

interface SurfaceCardProps {
  tier?: 'primary' | 'secondary' | 'elevated';
  children: ReactNode;
  className?: string;
  padding?: string;
}

const tierBg: Record<NonNullable<SurfaceCardProps['tier']>, string> = {
  primary: 'var(--card-bg)',
  secondary: 'var(--bg-secondary)',
  elevated: 'var(--bg-elevated)',
};

export function SurfaceCard({
  tier = 'primary',
  children,
  className = '',
  padding = '20px',
}: SurfaceCardProps) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{
        background: tierBg[tier],
        border: '1px solid var(--card-border)',
        boxShadow: 'var(--shadow-sm)',
        padding,
      }}
    >
      {children}
    </div>
  );
}
