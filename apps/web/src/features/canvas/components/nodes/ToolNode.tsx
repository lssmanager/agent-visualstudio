import { Handle, Position } from 'reactflow';
import { Wrench } from 'lucide-react';

interface ToolNodeProps {
  data: { label?: string; config?: { skillId?: string; functionName?: string } };
  selected?: boolean;
}

export function ToolNode({ data, selected }: ToolNodeProps) {
  const name = data.config?.functionName ?? data.config?.skillId ?? 'Tool';

  return (
    <div
      className="rounded-lg border-2 px-3 py-2 min-w-[140px] shadow-sm"
      style={{
        background: '#faf5ff',
        borderColor: selected ? '#7c3aed' : '#c4b5fd',
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-violet-500 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#7c3aed' }}>
          <Wrench size={13} className="text-white" />
        </div>
        <div>
          <div className="text-[11px] font-semibold" style={{ color: '#5b21b6' }}>Tool</div>
          <div className="text-[10px] truncate max-w-[100px]" style={{ color: '#7c3aed' }}>{name}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-violet-500 !w-2.5 !h-2.5" />
    </div>
  );
}
