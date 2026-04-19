import { Handle, Position } from 'reactflow';
import { Bot } from 'lucide-react';

interface AgentNodeProps {
  data: { label?: string; config?: { agentId?: string; model?: string; agentName?: string } };
  selected?: boolean;
}

export function AgentNode({ data, selected }: AgentNodeProps) {
  const name = data.config?.agentName ?? data.config?.agentId ?? 'Agent';

  return (
    <div
      className="rounded-lg border-2 px-3 py-2 min-w-[140px] shadow-sm"
      style={{
        background: '#f0fdf4',
        borderColor: selected ? '#16a34a' : '#86efac',
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-green-500 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#16a34a' }}>
          <Bot size={13} className="text-white" />
        </div>
        <div>
          <div className="text-[11px] font-semibold" style={{ color: '#166534' }}>Agent</div>
          <div className="text-[10px] truncate max-w-[100px]" style={{ color: '#22c55e' }}>{name}</div>
        </div>
      </div>
      {data.config?.model && (
        <div className="text-[9px] mt-1 font-mono truncate" style={{ color: '#6b7280' }}>{data.config.model}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-green-500 !w-2.5 !h-2.5" />
    </div>
  );
}
