import { Handle, Position, type NodeProps } from 'reactflow';

interface N8nWebhookData {
  config?: {
    label?: string;
    webhookPath?: string;
    method?: string;
    workflowId?: string;
  };
}

export function N8nWebhookNode({ data, selected }: NodeProps<N8nWebhookData>) {
  const { label, webhookPath, method, workflowId } = data.config ?? {};

  return (
    <div
      style={{
        minWidth: 160,
        borderRadius: 8,
        border: `2px solid ${selected ? '#ea580c' : '#fed7aa'}`,
        background: '#fff7ed',
        padding: '10px 14px',
        fontSize: 11,
        boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
      }}
    >
      <Handle type="target" position={Position.Top} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>🔗</span>
        <span style={{ fontWeight: 700, color: '#9a3412' }}>n8n Webhook</span>
      </div>

      {label && (
        <div style={{ fontWeight: 600, marginBottom: 2, color: '#1c1917' }}>{label}</div>
      )}

      <div style={{ color: '#78716c', fontFamily: 'monospace', fontSize: 10 }}>
        <span
          style={{
            display: 'inline-block',
            background: '#fde68a',
            color: '#92400e',
            borderRadius: 3,
            padding: '1px 5px',
            marginRight: 4,
            fontWeight: 700,
          }}
        >
          {method ?? 'POST'}
        </span>
        {webhookPath ?? '/hook'}
      </div>

      {workflowId && (
        <div style={{ marginTop: 4, color: '#a8a29e', fontSize: 10 }}>
          wf: {workflowId}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
