import { Handle, Position } from 'reactflow';
import { CircleStop } from 'lucide-react';

interface EndNodeProps {
  data: { label?: string; config?: { outcome?: string } };
  selected?: boolean;
}

export function EndNode({ data, selected }: EndNodeProps) {
  return (
    <div
      className="rounded-lg border-2 px-3 py-2 min-w-[120px] shadow-sm"
      style={{
        background: '#f3f4f6',
        borderColor: selected ? '#4b5563' : '#d1d5db',
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-500 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#4b5563' }}>
          <CircleStop size={13} className="text-white" />
        </div>
        <div>
          <div className="text-[11px] font-semibold" style={{ color: '#374151' }}>End</div>
          <div className="text-[10px]" style={{ color: '#6b7280' }}>
            {data.config?.outcome ?? 'completed'}
          </div>
        </div>
      </div>
    </div>
  );
}
