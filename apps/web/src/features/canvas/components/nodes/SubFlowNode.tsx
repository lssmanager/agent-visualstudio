import { Handle, Position, type NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';

interface SubFlowData {
  config?: {
    label?:       string;
    flowId?:      string;
    flowName?:    string;
    inputMap?:    Record<string, string>;
    outputMap?:   Record<string, string>;
    waitForEnd?:  boolean;
  };
  selected?: boolean;
}

export function SubFlowNode({ data, selected }: NodeProps<SubFlowData>) {
  const { label, flowName, flowId, waitForEnd } = data.config ?? {};
  const displayName = label ?? flowName ?? flowId ?? 'Sub-Flow';

  return (
    <div
      className="rounded-lg border-2 px-3 py-2 min-w-[150px] shadow-sm"
      style={{
        background: '#fdf4ff',
        borderColor: selected ? '#9333ea' : '#d8b4fe',
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-2.5 !h-2.5" />

      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: '#9333ea' }}
        >
          <GitBranch size={13} className="text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold" style={{ color: '#6b21a8' }}>Sub-Flow</div>
          <div className="text-[10px] truncate max-w-[110px]" style={{ color: '#a855f7' }}>
            {displayName}
          </div>
        </div>
      </div>

      {flowId && (
        <div className="text-[9px] mt-1 font-mono truncate" style={{ color: '#9ca3af' }}>
          id: {flowId}
        </div>
      )}

      {waitForEnd && (
        <div
          className="text-[9px] mt-1 px-1.5 py-0.5 rounded inline-block"
          style={{ background: '#ede9fe', color: '#7c3aed' }}
        >
          sync
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-purple-500 !w-2.5 !h-2.5" />
    </div>
  );
}
