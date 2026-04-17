import { ReactNode } from 'react';

interface KpiGridProps {
  children: ReactNode;
  cols?: 2 | 3 | 4;
}

const colsMap: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

export function KpiGrid({ children, cols = 4 }: KpiGridProps) {
  return (
    <div className={`grid gap-4 ${colsMap[cols]}`}>
      {children}
    </div>
  );
}
