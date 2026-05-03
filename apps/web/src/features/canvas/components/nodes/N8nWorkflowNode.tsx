import { Handle, Position, type NodeProps } from 'reactflow';

interface N8nWorkflowData {
  config?: {
    label?:         string;
    workflowId?:    string;
    workflowName?:  string;
    triggerMode?:   'webhook' | 'schedule' | 'manual';
    inputMapping?:  Record<string, string>;
    outputMapping?: Record<string, string>;
    waitForResult?: boolean;
  };
}

export function N8nWorkflowNode({ data, selected }: NodeProps<N8nWorkflowData>) {
  const {
    label,
    workflowId,
    workflowName,
    triggerMode,
    inputMapping,
    outputMapping,
    waitForResult,
  } = data.config ?? {};

  const inputCount  = Object.keys(inputMapping  ?? {}).length;
  const outputCount = Object.keys(outputMapping ?? {}).length;

  return (
    <div
      style={{
        minWidth: 170,
        borderRadius: 8,
        border: `2px solid ${selected ? '#d97706' : '#fcd34d'}`,
        background: '#fffbeb',
        padding: '10px 14px',
        fontSize: 11,
        boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
      }}
    >
      <Handle type="target" position={Position.Top} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>⚙️</span>
        <span style={{ fontWeight: 700, color: '#92400e' }}>n8n Workflow</span>
      </div>

      {/* Label / Workflow name */}
      <div style={{ fontWeight: 600, color: '#1c1917', marginBottom: 2 }}>
        {(label && label.trim()) || (workflowName && workflowName.trim()) || 'Untitled Workflow'}
      </div>

      {/* Workflow ID */}
      {workflowId && (
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 10,
            color: '#78716c',
            marginBottom: 4,
          }}
        >
          id: {workflowId}
        </div>
      )}

      {/* Trigger mode badge */}
      {triggerMode && (
        <div style={{ marginBottom: 4 }}>
          <span
            style={{
              display: 'inline-block',
              background: '#fef3c7',
              color: '#92400e',
              borderRadius: 3,
              padding: '1px 5px',
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {triggerMode}
          </span>
        </div>
      )}

      {/* Mapping summary */}
      {(inputCount > 0 || outputCount > 0) && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            fontSize: 10,
            color: '#a8a29e',
          }}
        >
          {inputCount  > 0 && <span>in: {inputCount}</span>}
          {outputCount > 0 && <span>out: {outputCount}</span>}
        </div>
      )}

      {/* waitForResult indicator */}
      {waitForResult && (
        <div style={{ marginTop: 4, fontSize: 10, color: '#d97706', fontWeight: 600 }}>
          ⏳ wait for result
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
