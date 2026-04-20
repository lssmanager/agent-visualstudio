import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  clickable?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = '', clickable = false, onClick }: CardProps) {
  return (
    <div
      className={`rounded-lg p-6 ${
        clickable ? 'cursor-pointer transition-all' : ''
      } ${className}`}
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        ...(clickable ? {} : {}),
      }}
      onClick={onClick}
      onMouseEnter={clickable ? (e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)';
      } : undefined}
      onMouseLeave={clickable ? (e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--card-border)';
      } : undefined}
    >
      {children}
    </div>
  );
}
