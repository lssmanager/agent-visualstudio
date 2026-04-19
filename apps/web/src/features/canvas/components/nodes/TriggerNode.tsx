import { Handle, Position } from 'reactflow';
import { Zap } from 'lucide-react';

interface TriggerNodeProps {
  data: { label?: string; config?: { triggerType?: string; schedule?: string; webhookPath?: string } };
  selected?: boolean;
}

export function TriggerNode({ data, selected }: TriggerNodeProps) {
  const triggerType = data.config?.triggerType ?? 'manual';

  return (
    <div
      className="rounded-lg border-2 px-3 py-2 min-w-[140px] shadow-sm"
      style={{
        background: '#eff6ff',
        borderColor: selected ? '#2563eb' : '#93c5fd',
      }}
    >
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: '#2563eb' }}>
          <Zap size={13} className="text-white" />
        </div>
        <div>
          <div className="text-[11px] font-semibold" style={{ color: '#1e40af' }}>Trigger</div>
          <div className="text-[10px]" style={{ color: '#3b82f6' }}>{triggerType}</div>
        </div>
      </div>
      {data.config?.schedule && (
        <div className="text-[9px] mt-1 font-mono" style={{ color: '#6b7280' }}>{data.config.schedule}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-2.5 !h-2.5" />
    </div>
  );
}
