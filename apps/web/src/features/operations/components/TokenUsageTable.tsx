interface AgentUsageRow {
  agentId: string;
  cost: number;
  tokens: { input: number; output: number };
  steps: number;
}

interface TokenUsageTableProps {
  rows: AgentUsageRow[];
}

export function TokenUsageTable({ rows }: TokenUsageTableProps) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No agent usage data.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
            <th className="text-left py-2 px-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Agent</th>
            <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Steps</th>
            <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Input Tokens</th>
            <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Output Tokens</th>
            <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Total Tokens</th>
            <th className="text-right py-2 px-2 font-semibold" style={{ color: 'var(--text-muted)' }}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.agentId}
              className="border-b transition-colors"
              style={{ borderColor: 'var(--border-primary)' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
            >
              <td className="py-2 px-2 font-mono" style={{ color: 'var(--text-primary)' }}>
                {row.agentId}
              </td>
              <td className="py-2 px-2 text-right" style={{ color: 'var(--text-primary)' }}>
                {row.steps}
              </td>
              <td className="py-2 px-2 text-right font-mono" style={{ color: 'var(--text-muted)' }}>
                {row.tokens.input.toLocaleString()}
              </td>
              <td className="py-2 px-2 text-right font-mono" style={{ color: 'var(--text-muted)' }}>
                {row.tokens.output.toLocaleString()}
              </td>
              <td className="py-2 px-2 text-right font-mono" style={{ color: 'var(--text-primary)' }}>
                {(row.tokens.input + row.tokens.output).toLocaleString()}
              </td>
              <td className="py-2 px-2 text-right font-medium" style={{ color: 'var(--text-primary)' }}>
                ${row.cost.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
