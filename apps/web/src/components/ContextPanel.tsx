import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';

import { useStudioState } from '../lib/StudioStateContext';
import { DOT_COLORS, getContext, type SidebarItem } from '../lib/sidebar-context';

export function ContextPanel({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useStudioState();

  const [search, setSearch] = useState('');
  const workspace = state.workspace;
  const context = getContext(location.pathname, state);

  const filtered = search.trim()
    ? context.items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    : context.items;

  function go(path: string) {
    navigate(path);
    onNavigate?.();
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--shell-panel-bg)',
        borderRight: '1px solid var(--shell-panel-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backdropFilter: 'blur(14px)',
      }}
    >
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--shell-panel-border)' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--text-muted)',
            marginBottom: 7,
          }}
        >
          Context
        </div>

        <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0, display: 'grid', gap: 6 }}>
            <h2
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 24,
                lineHeight: 1.05,
                fontWeight: 800,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              {context.label}
            </h2>
            {workspace && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                {workspace.name}
                {workspace.defaultModel ? ` - ${workspace.defaultModel}` : ''}
              </p>
            )}
          </div>

          {context.newPath && (
            <button
              onClick={() => go(context.newPath!)}
              title={`New ${context.label}`}
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: '1px solid rgba(77,124,255,0.35)',
                background: 'var(--btn-primary-bg)',
                color: '#ffffff',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                flexShrink: 0,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <Plus size={15} />
            </button>
          )}
        </div>
      </div>

      {context.items.length > 0 && (
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 11,
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
              onChange={(event) => setSearch(event.target.value)}
              style={{
                width: '100%',
                padding: '10px 11px 10px 33px',
                fontSize: 13,
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--shell-chip-border)',
                background: 'var(--shell-chip-bg)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'grid', gap: 10 }}>
        {filtered.length > 0 ? (
          filtered.map((item) => (
            <MiniCard key={item.id} item={item} onClick={() => go(item.path ?? context.newPath ?? '/')} />
          ))
        ) : search.trim() ? (
          <p style={{ fontSize: 12, textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>No matches</p>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: 8,
              paddingTop: 30,
            }}
          >
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>{context.emptyText}</p>
            {context.newPath && (
              <button
                onClick={() => go(context.newPath!)}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--color-primary)',
                  background: 'transparent',
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
        background: hovered ? 'var(--card-hover)' : 'var(--shell-chip-bg)',
        border: `1px solid ${hovered ? 'color-mix(in srgb, var(--color-primary) 35%, var(--shell-chip-border))' : 'var(--shell-chip-border)'}`,
        borderRadius: 'var(--radius-md)',
        padding: 12,
        boxShadow: hovered ? 'var(--shadow-sm)' : 'none',
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
            fontSize: 13,
            fontWeight: 700,
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
            fontSize: 11,
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
