import { type ReactNode } from 'react';

interface SplitPaneShellProps {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  leftWidth?: string;
  rightWidth?: string;
  className?: string;
}

export function SplitPaneShell({
  left,
  center,
  right,
  leftWidth = '260px',
  rightWidth = '320px',
  className = '',
}: SplitPaneShellProps) {
  const hasCenter = center !== undefined && center !== null;
  const hasLeft = left !== undefined && left !== null;
  const hasRight = right !== undefined && right !== null;

  let gridTemplate: string;
  if (hasLeft && hasCenter && hasRight) {
    gridTemplate = `${leftWidth} 1fr ${rightWidth}`;
  } else if (hasLeft && hasRight) {
    gridTemplate = `${leftWidth} 1fr`;
  } else if (hasLeft && hasCenter) {
    gridTemplate = `${leftWidth} 1fr`;
  } else if (hasCenter && hasRight) {
    gridTemplate = `1fr ${rightWidth}`;
  } else {
    gridTemplate = '1fr';
  }

  const panes: { key: string; node: ReactNode }[] = [];
  if (hasLeft)   panes.push({ key: 'left', node: left });
  if (hasCenter) panes.push({ key: 'center', node: center });
  if (hasRight)  panes.push({ key: 'right', node: right });

  return (
    <div
      className={`h-full ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns: gridTemplate,
      }}
    >
      {panes.map((pane, idx) => (
        <div
          key={pane.key}
          className="overflow-auto"
          style={{
            borderRight: idx < panes.length - 1
              ? '1px solid var(--border-primary)'
              : undefined,
          }}
        >
          {pane.node}
        </div>
      ))}
    </div>
  );
}
