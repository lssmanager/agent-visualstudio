import { Handle, Position, type NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';

interface SubflowData {
  config?: {
    label?:        string;
    flowId?:       string;
    flowName?:     string;
    inputMapping?: Record<string, string>;
    outputKey?:    string;
  };
}

export function SubFlowNode({ data, selected }: NodeProps<SubflowData>) {
  const { label, flowName, flowId, outputKey } = data.config ?? {};
  const displayName = label ?? flowName ?? flowId ?? 'Subflow';

  return (
    <div
      className="rounded-lg border-2 px-3 py-2 shadow-sm"
      style={{
        minWidth: 150,
        background:  '#f0f9ff',
        borderColor: selected ? '#0369a1' : '#7dd3fc',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-sky-600 !w-2.5 !h-2.5"
      />

      <div className="flex items-center gap-2">
        <div
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ background: '#0369a1' }}
        >
          <GitBranch size={13} className="text-white" />
        </div>
        <div>
          <div className="text-[11px] font-semibold" style={{ color: '#0c4a6e' }}>
            Subflow
          </div>
          <div className="text-[10px] truncate max-w-[110px]" style={{ color: '#0ea5e9' }}>
            {displayName}
          </div>
        </div>
      </div>

      {outputKey && (
        <div className="text-[9px] mt-1 font-mono truncate" style={{ color: '#6b7280' }}>
          out → {outputKey}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-sky-600 !w-2.5 !h-2.5"
      />
    </div>
  );
}
