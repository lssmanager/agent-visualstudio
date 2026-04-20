import { type ReactNode } from 'react';

interface MetricStripProps {
  children: ReactNode;
  cols?: 3 | 4 | 5 | 6;
}

const colsMap: Record<number, string> = {
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6',
};

export function MetricStrip({ children, cols = 4 }: MetricStripProps) {
  return (
    <div className={`grid gap-4 ${colsMap[cols]}`}>
      {children}
    </div>
  );
}
