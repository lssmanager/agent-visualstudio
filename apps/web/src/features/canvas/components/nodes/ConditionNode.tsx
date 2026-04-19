import { Handle, Position } from 'reactflow';
import { GitBranch } from 'lucide-react';

interface ConditionNodeProps {
  data: { label?: string; config?: { expression?: string; branches?: string[] } };
  selected?: boolean;
}

export function ConditionNode({ data, selected }: ConditionNodeProps) {
  const expression = data.config?.expression ?? 'condition';

  return (
    <div
      className="rounded-lg border-2 px-3 py-2 min-w-[140px] shadow-sm"
      style={{
        background: '#fefce8',
        borderColor: selected ? '#ca8a04' : '#fde047',
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-yellow-600 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#ca8a04' }}>
          <GitBranch size={13} className="text-white" />
        </div>
        <div>
          <div className="text-[11px] font-semibold" style={{ color: '#854d0e' }}>Condition</div>
          <div className="text-[10px] truncate max-w-[100px] font-mono" style={{ color: '#a16207' }}>
            {expression}
          </div>
        </div>
      </div>
      {data.config?.branches && (
        <div className="flex gap-1 mt-1">
          {data.config.branches.map((b, i) => (
            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: '#fef3c7', color: '#92400e' }}>
              {b}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} id="true" className="!bg-yellow-600 !w-2.5 !h-2.5 !left-[30%]" />
      <Handle type="source" position={Position.Bottom} id="false" className="!bg-yellow-600 !w-2.5 !h-2.5 !left-[70%]" />
    </div>
  );
}
