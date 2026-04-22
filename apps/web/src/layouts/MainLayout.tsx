import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { NavRail } from '../components/NavRail';
import { ContextPanel } from '../components/ContextPanel';
import { Header } from '../components/Header';
import { useHierarchy } from '../lib/HierarchyContext';
import { SCOPE_VIEW_REGISTRY } from '../lib/ScopeViewRegistry';
import {
  buildStudioHref,
  isAdministrationPath,
  isStudioPath,
  parseBuilderTab,
  parseNodeQuery,
  surfaceFromPath,
} from '../lib/studioRouting';

const PANEL_WIDTH_KEY = 'shell-hierarchy-width';
const PANEL_COLLAPSED_KEY = 'shell-hierarchy-collapsed';
const PANEL_MIN = 180;
const PANEL_MAX = 500;

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : true,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { setSurface, setBuilderTab, selectByKey, tree, selectedKey, selectedBuilderTab, selectedLevel } = useHierarchy();

  const isDesktop = useMediaQuery('(min-width: 1120px)');
  const isMobile = !useMediaQuery('(min-width: 769px)');
  const activeSurface = surfaceFromPath(location.pathname);
  const isAdministration = isAdministrationPath(location.pathname);
  const isStudioEnvironment = isStudioPath(location.pathname) && location.pathname.startsWith('/workspace-studio');
  const canOpenStudio = SCOPE_VIEW_REGISTRY[selectedLevel].canEnterStudio;
  const showContext = isDesktop && !isStudioEnvironment;
  const isStudioSurface = ['/workspace-studio', '/administration', '/agency-builder', '/entity-editor', '/runs', '/sessions', '/settings', '/profiles'].some((route) =>
    location.pathname.startsWith(route),
  );

  // ── Panel width & collapse state (persisted) ────────────────────────────
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const stored = parseInt(localStorage.getItem(PANEL_WIDTH_KEY) ?? '280', 10);
      return Math.max(PANEL_MIN, Math.min(PANEL_MAX, isNaN(stored) ? 280 : stored));
    } catch {
      return 280;
    }
  });

  const [panelCollapsed, setPanelCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PANEL_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth)); } catch { /* ignore */ }
  }, [panelWidth]);

  useEffect(() => {
    try { localStorage.setItem(PANEL_COLLAPSED_KEY, String(panelCollapsed)); } catch { /* ignore */ }
  }, [panelCollapsed]);

  // ── Keyboard shortcut Alt+[ to toggle hierarchy ────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === '[') {
        e.preventDefault();
        setPanelCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Drag-to-resize ─────────────────────────────────────────────────────
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = panelWidth;

    const onMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const newW = Math.max(PANEL_MIN, Math.min(PANEL_MAX, dragStartWidth.current + (ev.clientX - dragStartX.current)));
      setPanelWidth(newW);
    };
    const onUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Grid layout ───────────────────────────────────────────────────────
  const effectivePanelWidth = panelCollapsed ? 0 : panelWidth;
  const gridTemplateColumns = isMobile
    ? '1fr'
    : showContext
      ? `88px ${effectivePanelWidth}px 6px 1fr`
      : '88px 1fr';

  // Content column index in the CSS grid
  const contentCol = isMobile ? '1' : showContext ? '4' : '2';
  const headerCol = contentCol;

  const mainPadding = isStudioEnvironment ? '0' : isStudioSurface ? '14px 14px 18px' : '20px 22px 28px';

  useEffect(() => {
    setSurface(activeSurface);

    if (isAdministration) {
      const nodeKey = parseNodeQuery(location.search);
      if (nodeKey && tree.nodes[nodeKey]) {
        selectByKey(nodeKey);
      }
      const tab = parseBuilderTab(location.search);
      if (tab) setBuilderTab(tab);
    }
  }, [activeSurface, isAdministration, location.search, selectByKey, setBuilderTab, setSurface, tree.nodes]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns,
        gridTemplateRows: '52px 1fr',
        minHeight: '100vh',
        background: 'var(--bg-secondary)',
      }}
    >
      {/* NavRail — column 1 */}
      {!isMobile && (
        <div style={{ gridColumn: '1', gridRow: '1 / -1', zIndex: 30 }}>
          <NavRail />
        </div>
      )}

      {/* Hierarchy / Context panel — column 2 */}
      {showContext && (
        <div
          style={{
            gridColumn: '2',
            gridRow: '1 / -1',
            overflow: 'hidden',
            width: effectivePanelWidth,
            display: effectivePanelWidth === 0 ? 'none' : undefined,
          }}
        >
          <ContextPanel />
        </div>
      )}

      {/* Drag handle — column 3 */}
      {showContext && !panelCollapsed && (
        <div
          onMouseDown={startDrag}
          style={{
            gridColumn: '3',
            gridRow: '1 / -1',
            cursor: 'col-resize',
            zIndex: 20,
            position: 'relative',
            width: 6,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--shell-panel-border)',
              opacity: 0,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}
          />
        </div>
      )}

      {/* Top header bar */}
      <header
        style={{
          gridColumn: headerCol,
          gridRow: '1',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          height: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 14px',
          background: 'var(--shell-topbar-bg)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--shell-panel-border)',
        }}
      >
        {/* Panel collapse toggle — icon-first, tooltip on hover */}
        {showContext && (
          <button
            type="button"
            onClick={() => setPanelCollapsed((v) => !v)}
            title={panelCollapsed ? 'Expand hierarchy (Alt+[)' : 'Collapse hierarchy (Alt+[)'}
            aria-label={panelCollapsed ? 'Expand hierarchy panel' : 'Collapse hierarchy panel'}
            style={{
              width: 28,
              height: 28,
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-sm)',
              background: panelCollapsed ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
              color: panelCollapsed ? 'var(--color-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {panelCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        )}

        {/* Surface switcher (Administration / Studio) — only outside Studio */}
        {!isStudioEnvironment && (
          <div style={{ display: 'inline-flex', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() =>
                navigate(
                  buildStudioHref({
                    surface: 'agency-builder',
                    tab: selectedBuilderTab,
                    nodeKey: selectedKey,
                  }),
                )
              }
              style={{
                border: 'none',
                padding: '6px 11px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background: isAdministration ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
                color: isAdministration ? 'var(--color-primary)' : 'var(--text-muted)',
              }}
            >
              Administration
            </button>
            <button
              type="button"
              onClick={() =>
                navigate(
                  buildStudioHref({
                    surface: 'workspace-studio',
                    nodeKey: selectedKey,
                  }),
                )
              }
              disabled={!canOpenStudio}
              style={{
                border: 'none',
                borderLeft: '1px solid var(--border-primary)',
                padding: '6px 11px',
                fontSize: 12,
                fontWeight: 700,
                cursor: canOpenStudio ? 'pointer' : 'not-allowed',
                background: isStudioEnvironment ? 'var(--color-primary-soft)' : 'var(--bg-secondary)',
                color: isStudioEnvironment ? 'var(--color-primary)' : 'var(--text-muted)',
                opacity: canOpenStudio ? 1 : 0.65,
              }}
            >
              Studio
            </button>
          </div>
        )}

        <div style={{ flex: 1 }} />
        <Header onToggleSidebar={() => setMobileOpen((open) => !open)} showHamburger={isMobile} />
      </header>

      {/* Main content area */}
      <main
        style={{
          gridColumn: contentCol,
          gridRow: '2',
          overflow: isStudioEnvironment ? 'hidden' : 'auto',
          padding: mainPadding,
          background: 'var(--shell-content-bg)',
          minWidth: 0,
        }}
      >
        <Outlet />
      </main>

      {/* Mobile sidebar overlay */}
      {isMobile && mobileOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(2,8,23,0.55)', zIndex: 49 }}
            onClick={() => setMobileOpen(false)}
          />
          <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 50 }}>
            <NavRail onNavigate={() => setMobileOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
