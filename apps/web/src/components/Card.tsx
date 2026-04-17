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
      className={`bg-white rounded-lg border border-slate-200 p-6 ${
        clickable ? 'cursor-pointer hover:shadow-md hover:border-blue-300 transition-all' : ''
      } ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
