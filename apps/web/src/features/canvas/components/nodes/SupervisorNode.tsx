import { Handle, Position, type NodeProps } from 'reactflow';

interface SupervisorData {
  config?: {
    label?: string;
    agentName?: string;
    delegationMode?: string;
    maxIterations?: number;
    subAgentIds?: string[];
  };
}

export function SupervisorNode({ data, selected }: NodeProps<SupervisorData>) {
  const { label, agentName, delegationMode, maxIterations, subAgentIds } = data.config ?? {};

  return (
    <div
      style={{
        minWidth: 170,
        borderRadius: 8,
        border: `2px solid ${selected ? '#7c3aed' : '#c4b5fd'}`,
        background: '#f5f3ff',
        padding: '10px 14px',
        fontSize: 11,
        boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
      }}
    >
      <Handle type="target" position={Position.Top} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>👑</span>
        <span style={{ fontWeight: 700, color: '#5b21b6' }}>Supervisor</span>
      </div>

      <div style={{ fontWeight: 600, color: '#1c1917', marginBottom: 2 }}>
        {label ?? agentName ?? 'Unnamed Supervisor'}
      </div>

      <div style={{ color: '#78716c' }}>
        mode: <strong>{delegationMode ?? 'llm_router'}</strong>
      </div>

      {maxIterations !== undefined && (
        <div style={{ color: '#78716c' }}>max iter: {maxIterations}</div>
      )}

      {subAgentIds && subAgentIds.length > 0 && (
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            gap: 3,
            flexWrap: 'wrap',
          }}
        >
          {subAgentIds.map((id) => (
            <span
              key={id}
              style={{
                background: '#ede9fe',
                color: '#5b21b6',
                borderRadius: 3,
                padding: '1px 5px',
                fontSize: 10,
              }}
            >
              {id.slice(0, 8)}
            </span>
          ))}
        </div>
      )}

      {/* Multiple source handles for delegation outputs */}
      <Handle type="source" position={Position.Bottom} id="delegate" />
    </div>
  );
}
