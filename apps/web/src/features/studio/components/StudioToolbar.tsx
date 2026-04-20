import { Cpu, Eye, RefreshCw, Rocket } from 'lucide-react';

interface StudioToolbarProps {
  onRefresh: () => void;
  onPreview: () => void;
  onApply: () => void;
  isBusy?: boolean;
}

export function StudioToolbar({ onRefresh, onPreview, onApply, isBusy }: StudioToolbarProps) {
  const ghostBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--shell-chip-border)',
    background: 'var(--shell-chip-bg)',
    color: 'var(--text-primary)',
    fontSize: 12,
    fontWeight: 700,
    cursor: isBusy ? 'not-allowed' : 'pointer',
    opacity: isBusy ? 0.55 : 1,
    transition: 'background var(--transition), border-color var(--transition)',
  };

  const softBtn: React.CSSProperties = {
    ...ghostBtn,
    border: '1px solid color-mix(in srgb, var(--color-primary) 38%, var(--shell-chip-border))',
    background: 'var(--color-primary-soft)',
    color: 'var(--color-primary)',
  };

  const primaryBtn: React.CSSProperties = {
    ...ghostBtn,
    border: '1px solid color-mix(in srgb, var(--color-primary) 38%, transparent)',
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid var(--shell-panel-border)',
        background: 'var(--shell-panel-bg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-primary-soft)',
            border: '1px solid color-mix(in srgb, var(--color-primary) 35%, transparent)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--color-primary)',
          }}
        >
          <Cpu size={16} />
        </div>
        <div>
          <h1
            style={{
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            OpenClaw Studio
          </h1>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Authoring - Compile - Deploy</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onRefresh} disabled={isBusy} style={ghostBtn}>
          <RefreshCw size={14} className={isBusy ? 'animate-spin' : ''} />
          Refresh
        </button>
        <button onClick={onPreview} disabled={isBusy} style={softBtn}>
          <Eye size={14} />
          Preview Diff
        </button>
        <button
          onClick={onApply}
          disabled={isBusy}
          style={primaryBtn}
          onMouseEnter={(event) => {
            if (!isBusy) {
              (event.currentTarget as HTMLElement).style.background = 'var(--btn-primary-hover)';
            }
          }}
          onMouseLeave={(event) => {
            (event.currentTarget as HTMLElement).style.background = 'var(--btn-primary-bg)';
          }}
        >
          <Rocket size={14} />
          Deploy
        </button>
      </div>
    </div>
  );
}
