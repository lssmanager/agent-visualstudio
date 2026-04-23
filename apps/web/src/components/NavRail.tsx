import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Building2, Cpu, Settings, SquarePen } from 'lucide-react';
import type { ComponentType } from 'react';

import { useStudioState } from '../lib/StudioStateContext';
import { useHierarchy } from '../lib/HierarchyContext';
import { buildStudioHref, getSurfaceLabel, isProductSurfacePath, surfaceFromPath } from '../lib/studioRouting';
import type { SurfaceId } from '../lib/types';

const NAV: Array<{ label: string; surface: SurfaceId; Icon: ComponentType<{ size?: number }> }> = [
  { label: 'Administration', surface: 'agency-builder', Icon: Building2 },
  { label: 'Studio', surface: 'workspace-studio', Icon: Cpu },
  { label: 'Editor', surface: 'entity-editor', Icon: SquarePen },
];

export function NavRail({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useStudioState();
  const { setSurface, selectedKey, selectedBuilderTab } = useHierarchy();
  const runtimeOk = state.runtime?.health?.ok ?? false;
  const currentSurface = surfaceFromPath(location.pathname);

  function go(surface: SurfaceId, path: string) {
    setSurface(surface);
    navigate(path);
    onNavigate?.();
  }

  return (
    <div
      style={{
        width: compact ? 64 : 88,
        background: 'var(--shell-rail-bg)',
        borderRight: '1px solid var(--shell-rail-border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '12px 8px',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() =>
          go(
            'agency-builder',
            buildStudioHref({
              surface: 'agency-builder',
              tab: selectedBuilderTab ?? 'overview',
              nodeKey: selectedKey,
            }),
          )
        }
        style={{
          width: compact ? 46 : 56,
          height: 56,
          borderRadius: 14,
          background: 'var(--color-primary)',
          color: '#ffffff',
          border: 'none',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: 6,
          flexShrink: 0,
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: '0.04em',
        }}
        title={getSurfaceLabel('agency-builder')}
        aria-label="Open Administration"
      >
        OC
      </button>

      {!compact && <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Environment</div>}
      <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%' }}>
        {NAV.map(({ label, surface, Icon }) => {
          const isActive = currentSurface === surface || isProductSurfacePath(location.pathname, surface);
          const href = buildStudioHref({
            surface,
            tab: surface === 'agency-builder' ? selectedBuilderTab : undefined,
            nodeKey: selectedKey,
          });

          return (
            <button
              key={surface}
              onClick={() => go(surface, href)}
              data-tip={label}
              aria-label={label}
              style={{
                width: compact ? 48 : 72,
                borderRadius: 12,
                border: isActive ? '1px solid rgba(77,124,255,0.34)' : '1px solid transparent',
                background: isActive ? 'rgba(77,124,255,0.2)' : 'transparent',
                color: isActive ? '#f2f7ff' : 'var(--shell-rail-text)',
                opacity: isActive ? 1 : 0.9,
                display: 'grid',
                gap: 3,
                alignItems: 'center',
                justifyItems: 'center',
                cursor: 'pointer',
                padding: '9px 6px 8px',
                transition: 'background var(--transition), border-color var(--transition), opacity var(--transition)',
              }}
            >
              <Icon size={17} />
              {!compact && <span style={{ fontSize: 10, fontWeight: 700 }}>{label}</span>}
            </button>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, paddingTop: 8, width: '100%' }}>
        <div
          title={runtimeOk ? 'Runtime online' : 'Runtime offline'}
          style={{
            width: 9,
            height: 9,
            borderRadius: 'var(--radius-full)',
            background: runtimeOk ? 'var(--color-success)' : 'var(--text-muted)',
            boxShadow: runtimeOk ? '0 0 0 4px rgba(51,196,129,0.14)' : 'none',
          }}
        />
        <button
          onClick={() => go('profiles', buildStudioHref({ surface: 'profiles', nodeKey: selectedKey }))}
          data-tip={getSurfaceLabel('profiles')}
          aria-label={getSurfaceLabel('profiles')}
          style={{
            width: compact ? 48 : 72,
            borderRadius: 12,
            border: currentSurface === 'profiles'
              ? '1px solid rgba(77,124,255,0.34)'
              : '1px solid transparent',
            background: currentSurface === 'profiles'
              ? 'rgba(77,124,255,0.2)'
              : 'transparent',
            color: currentSurface === 'profiles' ? '#f2f7ff' : 'var(--shell-rail-text)',
            display: 'grid',
            placeItems: 'center',
            gap: compact ? 0 : 3,
            cursor: 'pointer',
            padding: '9px 6px 8px',
          }}
        >
            <BookOpen size={17} />
            {!compact && <span style={{ fontSize: 10, fontWeight: 700 }}>{getSurfaceLabel('profiles')}</span>}
          </button>
        <button
          onClick={() => go('settings', buildStudioHref({ surface: 'settings', nodeKey: selectedKey }))}
          data-tip={getSurfaceLabel('settings')}
          aria-label={getSurfaceLabel('settings')}
          style={{
            width: compact ? 48 : 72,
            borderRadius: 12,
            border: currentSurface === 'settings'
              ? '1px solid rgba(77,124,255,0.34)'
              : '1px solid transparent',
            background: currentSurface === 'settings'
              ? 'rgba(77,124,255,0.2)'
              : 'transparent',
            color: currentSurface === 'settings' ? '#f2f7ff' : 'var(--shell-rail-text)',
            display: 'grid',
            placeItems: 'center',
            gap: compact ? 0 : 3,
            cursor: 'pointer',
            padding: '9px 6px 8px',
          }}
        >
            <Settings size={17} />
            {!compact && <span style={{ fontSize: 10, fontWeight: 700 }}>{getSurfaceLabel('settings')}</span>}
          </button>
      </div>
    </div>
  );
}
