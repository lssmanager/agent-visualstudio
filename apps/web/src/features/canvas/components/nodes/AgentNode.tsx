import { Handle, Position } from 'reactflow';
import { Bot } from 'lucide-react';

interface AgentNodeProps {
  data: {
    label?: string;
    config?: {
      agentId?: string;
      model?: string;
      agentName?: string;
      source?: string;
      templateId?: string;
    };
  };
  selected?: boolean;
}

export function AgentNode({ data, selected }: AgentNodeProps) {
  const name = data.config?.agentName ?? data.config?.agentId ?? 'Agent';
  const isFromTemplate = data.config?.source === 'agency-agents';

  return (
    <div
      className="rounded-lg border px-3 py-2 min-w-[130px]"
      style={{
        background: selected ? '#dcfce7' : '#f0fdf4',
        borderColor: selected ? '#16a34a' : '#86efac',
        boxShadow: selected ? '0 0 0 2px #16a34a33' : 'none',
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-1.5">
        <Bot size={14} style={{ color: '#16a34a' }} />
        <div>
          <div className="text-[11px] font-semibold" style={{ color: '#166534' }}>Agent</div>
          <div className="text-[10px] truncate max-w-[100px]" style={{ color: '#22c55e' }}>{name}</div>
          {/* IMP-01: badge de trazabilidad para nodos creados desde AgentLibraryPanel */}
          {isFromTemplate && (
            <div className="text-[8px] mt-0.5 truncate max-w-[100px]" style={{ color: '#60a5fa' }}>
              📦 template
            </div>
          )}
        </div>
      </div>
      {data.config?.model && (
        <div className="text-[9px] mt-1 font-mono" style={{ color: '#4ade80' }}>
          {data.config.model}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
