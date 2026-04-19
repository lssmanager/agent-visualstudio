import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { useStudioState } from '../lib/StudioStateContext';
import { getContext, DOT_COLORS, type SidebarItem } from '../lib/sidebar-context';

export function ContextPanel({ onNavigate }: { onNavigate?: () => void }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { state } = useStudioState();
  const [search, setSearch] = useState('');

  const workspace = state.workspace;
  const ctx       = getContext(location.pathname, state);
  const filtered  = search.trim()
    ? ctx.items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : ctx.items;

  function go(path: string) {
    navigate(path);
    onNavigate?.();
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-primary)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Section header with eyebrow */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid var(--border-primary)' }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            marginBottom: 8,
          }}
        >
          Context Panel
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--text-xl)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {ctx.label}
          </h2>
          {ctx.newPath && (
            <button
              onClick={() => go(ctx.newPath!)}
              title={`New ${ctx.label}`}
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'var(--color-primary)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'background var(--transition)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-primary-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--color-primary)'; }}
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        {workspace && (
          <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
            {workspace.name}
            {workspace.defaultModel ? ` · ${workspace.defaultModel}` : ''}
          </p>
        )}
      </div>

      {/* Search */}
      {ctx.items.length > 0 && (
        <div style={{ padding: '14px 18px 0' }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: 34,
                paddingRight: 12,
                paddingTop: 10,
                paddingBottom: 10,
                fontSize: 'var(--text-sm)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--input-text)',
                outline: 'none',
                transition: 'border-color var(--transition)',
              }}
              onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--input-focus)'; }}
              onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--input-border)'; }}
            />
          </div>
        </div>
      )}

      {/* Items as mini-cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'grid', gap: 10 }}>
        {filtered.length > 0 ? (
          filtered.map((item) => (
            <MiniCard key={item.id} item={item} onClick={() => go(ctx.newPath ?? '/')} />
          ))
        ) : search.trim() ? (
          <p style={{ fontSize: 'var(--text-sm)', textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
            No matches
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 8, paddingTop: 32 }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {ctx.emptyText}
            </p>
            {ctx.newPath && (
              <button
                onClick={() => go(ctx.newPath!)}
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: 'var(--color-primary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                + Create one
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniCard({ item, onClick }: { item: SidebarItem; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        background: hovered ? 'var(--card-hover)' : 'var(--card-bg)',
        border: `1px solid ${hovered ? 'rgba(34,89,242,0.3)' : 'var(--card-border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 14,
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        display: 'grid',
        gap: 6,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color var(--transition), box-shadow var(--transition), background var(--transition)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.name}
        </span>
        {item.dot && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 'var(--radius-full)',
              background: DOT_COLORS[item.dot],
              flexShrink: 0,
            }}
          />
        )}
      </div>
      {item.sub && (
        <span
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.sub}
        </span>
      )}
    </button>
  );
}
