import { type ReactNode } from 'react';

interface Column {
  key: string;
  label: string;
  width?: string;
}

interface DataGridCardProps {
  title?: string;
  columns: Column[];
  rows: Array<Record<string, ReactNode>>;
  emptyMessage?: string;
}

export function DataGridCard({ title, columns, rows, emptyMessage = 'No data available' }: DataGridCardProps) {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: 'var(--card-border)',
        background: 'var(--card-bg)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {title && (
        <div
          className="px-5 py-4 border-b"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <h3
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
          >
            {title}
          </h3>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: '100%' }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{
                    color: 'var(--text-muted)',
                    borderBottom: '1px solid var(--border-primary)',
                    width: col.width,
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: idx < rows.length - 1
                      ? '1px solid var(--border-primary)'
                      : undefined,
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="px-4 py-3 text-sm"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {row[col.key] ?? '\u2014'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
