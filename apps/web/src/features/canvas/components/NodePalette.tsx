import { DragEvent } from 'react';

import type { FlowNodeType } from '../../../lib/types';
import { NODE_TEMPLATES } from '../lib/canvas-utils';

interface NodePaletteProps {
  onDragStart?: (nodeType: FlowNodeType) => void;
}

export function NodePalette({ onDragStart }: NodePaletteProps) {
  function handleDragStart(e: DragEvent<HTMLDivElement>, type: FlowNodeType) {
    e.dataTransfer.setData('application/reactflow-type', type);
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(type);
  }

  return (
    <div
      className="rounded-lg border p-3 space-y-2"
      style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
    >
      <h4 className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
        Node Palette
      </h4>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        Drag nodes onto the canvas
      </p>
      <div className="space-y-1">
        {NODE_TEMPLATES.map((tmpl) => (
          <div
            key={tmpl.type}
            draggable
            onDragStart={(e) => handleDragStart(e, tmpl.type)}
            className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing transition-colors"
            style={{ background: 'var(--bg-primary)' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-primary)'; }}
          >
            <div
              className="w-5 h-5 rounded flex items-center justify-center text-[11px]"
              style={{ background: tmpl.color + '20', color: tmpl.color }}
            >
              {tmpl.icon}
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {tmpl.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
