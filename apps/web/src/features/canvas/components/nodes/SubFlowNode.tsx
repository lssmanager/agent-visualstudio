import { Handle, Position } from 'reactflow';
import { GitBranch } from 'lucide-react';

interface SubFlowNodeProps {
  data: { label?: string; config?: { subFlowId?: string; label?: string } };
  selected?: boolean;
}

export function SubFlowNode({ data, selected }: SubFlowNodeProps) {
  const name = data.config?.label ?? data.config?.subFlowId ?? 'SubFlow';

  return (
    <div
      className="rounded-lg border-2 px-3 py-2 min-w-[140px] shadow-sm"
      style={{
        background: '#f5f3ff',
        borderColor: selected ? '#7c3aed' : '#c4b5fd',
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-violet-500 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ background: '#7c3aed' }}
        >
          <GitBranch size={13} className="text-white" />
        </div>
        <div>
          <div className="text-[11px] font-semibold" style={{ color: '#5b21b6' }}>SubFlow</div>
          <div className="text-[10px] truncate max-w-[100px]" style={{ color: '#7c3aed' }}>
            {name}
          </div>
        </div>
      </div>
      {data.config?.subFlowId && (
        <div className="text-[9px] mt-1 font-mono truncate" style={{ color: '#6b7280' }}>
          {data.config.subFlowId}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-violet-500 !w-2.5 !h-2.5" />
    </div>
  );
}
