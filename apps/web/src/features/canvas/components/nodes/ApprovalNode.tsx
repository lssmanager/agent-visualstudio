import { Handle, Position } from 'reactflow';
import { ShieldCheck } from 'lucide-react';

interface ApprovalNodeProps {
  data: { label?: string; config?: { approvers?: string[]; timeout?: number } };
  selected?: boolean;
}

export function ApprovalNode({ data, selected }: ApprovalNodeProps) {
  return (
    <div
      className="rounded-lg border-2 px-3 py-2 min-w-[140px] shadow-sm"
      style={{
        background: '#fffbeb',
        borderColor: selected ? '#d97706' : '#fcd34d',
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#d97706' }}>
          <ShieldCheck size={13} className="text-white" />
        </div>
        <div>
          <div className="text-[11px] font-semibold" style={{ color: '#92400e' }}>Approval</div>
          <div className="text-[10px]" style={{ color: '#b45309' }}>
            {data.config?.approvers?.length ? `${data.config.approvers.length} approvers` : 'Human review'}
          </div>
        </div>
      </div>
      {data.config?.timeout && (
        <div className="text-[9px] mt-1" style={{ color: '#6b7280' }}>Timeout: {data.config.timeout}h</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500 !w-2.5 !h-2.5" />
    </div>
  );
}
