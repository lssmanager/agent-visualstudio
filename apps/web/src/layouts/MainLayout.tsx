import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Sidebar } from 'lucide-react';

import { NavRail } from '../components/NavRail';
import { ContextPanel } from '../components/ContextPanel';
import { Header } from '../components/Header';
import { KeyboardShortcutsHelp } from '../components/ui/KeyboardShortcutsHelp';
import { useHierarchy } from '../lib/HierarchyContext';
import { usePreferences } from '../lib/usePreferences';
import { ShellLayoutProvider } from './ShellLayoutContext';
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
const INSPECTOR_WIDTH_KEY = 'shell-inspector-width';
const INSPECTOR_COLLAPSED_KEY = 'shell-inspector-collapsed';
const FOCUS_MODE_KEY = 'shell-focus-mode';
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { setSurface, setBuilderTab, selectByKey, tree, selectedKey, selectedBuilderTab, selectedLevel } = useHierarchy();
  const { layoutMode, sidebarCollapsed, setSidebarCollapsed } = usePreferences();

  const isDesktop = useMediaQuery('(min-width: 1120px)');
  const isMobile = !useMediaQuery('(min-width: 769px)');
  const activeSurface = surfaceFromPath(location.pathname);
  const isAdministration = isAdministrationPath(location.pathname);
  const isStudioEnvironment = isStudioPath(location.pathname) && location.pathname.startsWith('/workspace-studio');
  const canOpenStudio = SCOPE_VIEW_REGISTRY[selectedLevel].canEnterStudio;
  const showContext = isDesktop && !isStudioEnvironment;
  const showInspectorCapability = isDesktop;
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
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    try {
      const stored = parseInt(localStorage.getItem(INSPECTOR_WIDTH_KEY) ?? '340', 10);
      return Math.max(280, Math.min(520, isNaN(stored) ? 340 : stored));
    } catch {
      return 340;
    }
  });
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(INSPECTOR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(FOCUS_MODE_KEY) === 'true';
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
  useEffect(() => {
    try { localStorage.setItem(INSPECTOR_WIDTH_KEY, String(inspectorWidth)); } catch { /* ignore */ }
  }, [inspectorWidth]);
  useEffect(() => {
    try { localStorage.setItem(INSPECTOR_COLLAPSED_KEY, String(inspectorCollapsed)); } catch { /* ignore */ }
  }, [inspectorCollapsed]);
  useEffect(() => {
    try { localStorage.setItem(FOCUS_MODE_KEY, String(focusMode)); } catch { /* ignore */ }
  }, [focusMode]);

  // ── Keyboard shortcut Alt+[ to toggle hierarchy ────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when focus is inside an input / textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.altKey && e.key === '[') {
        e.preventDefault();
        setPanelCollapsed((v) => !v);
      }
      if (e.altKey && e.key === ']') {
        e.preventDefault();
        setInspectorCollapsed((v) => !v);
      }
      // Navigation shortcuts
      if (e.altKey && e.key === '1') {
        e.preventDefault();
        navigate(buildStudioHref({ surface: 'agency-builder', tab: selectedBuilderTab, nodeKey: selectedKey }));
      }
      if (e.altKey && e.key === '2') {
        e.preventDefault();
        navigate(buildStudioHref({ surface: 'workspace-studio', nodeKey: selectedKey }));
      }
      if (e.altKey && e.key === '3') {
        e.preventDefault();
        navigate(buildStudioHref({ surface: 'entity-editor', nodeKey: selectedKey }));
      }
      // Shortcuts help
      if (e.key === '?' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, selectedBuilderTab, selectedKey]);

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
  const railWidth = sidebarCollapsed ? 64 : 88;
  const effectivePanelWidth = (panelCollapsed || focusMode) ? 0 : panelWidth;
  const contextVisible = showContext && effectivePanelWidth > 0;
  const gridTemplateColumns = isMobile
    ? '1fr'
    : [
        `${railWidth}px`,
        ...(contextVisible ? [`${effectivePanelWidth}px`, '6px'] : []),
        'minmax(0,1fr)',
      ].join(' ');

  // Content column index in the CSS grid
  const contentCol = isMobile ? '1' : contextVisible ? '4' : '2';
  const headerCol = contentCol;

  const isCompact = layoutMode === 'compact';
  const mainPadding = isStudioEnvironment ? '0' : isStudioSurface
    ? (isCompact ? '10px 10px 14px' : '14px 14px 18px')
    : (isCompact ? '14px 16px 20px' : '20px 22px 28px');

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
    <ShellLayoutProvider
      value={{
        hierarchyCollapsed: panelCollapsed || focusMode,
        setHierarchyCollapsed: setPanelCollapsed,
        inspectorCollapsed: inspectorCollapsed || focusMode,
        setInspectorCollapsed,
        inspectorWidth,
        setInspectorWidth,
        focusMode,
        setFocusMode,
      }}
    >
      <div
      style={{
        display: 'grid',
        gridTemplateColumns,
        gridTemplateRows: '52px 1fr',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-secondary)',
      }}
    >
      {/* NavRail — column 1 */}
      {!isMobile && (
        <div style={{ gridColumn: '1', gridRow: '1 / -1', zIndex: 30, minHeight: 0, overflow: 'hidden' }}>
          <NavRail compact={sidebarCollapsed} />
        </div>
      )}

      {/* Hierarchy / Context panel — column 2 */}
      {contextVisible && (
        <div
          style={{
            gridColumn: '2',
            gridRow: '1 / -1',
            overflow: 'hidden',
            width: effectivePanelWidth,
            minHeight: 0,
          }}
        >
          <ContextPanel />
        </div>
      )}

      {/* Drag handle — column 3 */}
      {contextVisible && (
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
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', padding: 3, background: 'var(--bg-secondary)' }}>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand global rail' : 'Compact global rail'}
            aria-label={sidebarCollapsed ? 'Expand global rail' : 'Compact global rail'}
            style={layoutIconButton(sidebarCollapsed)}
          >
            <Sidebar size={14} />
          </button>
          {showContext && (
            <button
              type="button"
              onClick={() => setPanelCollapsed((v) => !v)}
              title={panelCollapsed ? 'Expand hierarchy (Alt+[)' : 'Collapse hierarchy (Alt+[)'}
              aria-label={panelCollapsed ? 'Expand hierarchy panel' : 'Collapse hierarchy panel'}
              style={layoutIconButton(!panelCollapsed && !focusMode)}
            >
              {panelCollapsed || focusMode ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setFocusMode(!focusMode)}
            title={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
            aria-label={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
            style={layoutIconButton(focusMode)}
          >
            {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          {showInspectorCapability && (
            <button
              type="button"
              onClick={() => setInspectorCollapsed((v) => !v)}
              title={inspectorCollapsed ? 'Expand inspector (Alt+])' : 'Collapse inspector (Alt+])'}
              aria-label={inspectorCollapsed ? 'Expand inspector panel' : 'Collapse inspector panel'}
              style={layoutIconButton(!inspectorCollapsed && !focusMode)}
            >
              {inspectorCollapsed || focusMode ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
            </button>
          )}
        </div>

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
        <Header onToggleSidebar={() => setMobileOpen((open) => !open)} showHamburger={isMobile} onOpenShortcuts={() => setShortcutsOpen((v) => !v)} />
      </header>

      {/* Main content area */}
      <main
        style={{
          gridColumn: contentCol,
          gridRow: '2',
          overflow: isStudioSurface ? 'hidden' : 'auto',
          padding: mainPadding,
          background: 'var(--shell-content-bg)',
          minWidth: 0,
          minHeight: 0,
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

      {/* Keyboard shortcuts help overlay */}
      <KeyboardShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
    </ShellLayoutProvider>
  );
}

function layoutIconButton(active: boolean): CSSProperties {
  return {
    width: 26,
    height: 26,
    border: '1px solid var(--border-primary)',
    borderRadius: 'var(--radius-sm)',
    background: active ? 'var(--color-primary-soft)' : 'var(--bg-primary)',
    color: active ? 'var(--color-primary)' : 'var(--text-muted)',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    transition: 'background 0.15s, color 0.15s',
  };
}

