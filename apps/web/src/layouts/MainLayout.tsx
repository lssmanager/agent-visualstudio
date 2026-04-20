import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { NavRail } from '../components/NavRail';
import { ContextPanel } from '../components/ContextPanel';
import { Header } from '../components/Header';

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
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isDesktop = useMediaQuery('(min-width: 1120px)');
  const isMobile = !useMediaQuery('(min-width: 769px)');
  const showContext = isDesktop;
  const isStudioSurface = ['/workspace-studio', '/agency-builder', '/agency-topology'].some((route) =>
    location.pathname.startsWith(route),
  );

  const contentColumn = isMobile ? '1' : showContext ? '3' : '2';
  const mainPadding = isStudioSurface ? '14px 14px 18px' : '20px 22px 28px';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : showContext ? '64px 280px 1fr' : '64px 1fr',
        gridTemplateRows: '72px 1fr',
        minHeight: '100vh',
        background: 'var(--bg-secondary)',
      }}
    >
      {!isMobile && (
        <div style={{ gridColumn: '1', gridRow: '1 / -1', zIndex: 30 }}>
          <NavRail />
        </div>
      )}

      {showContext && (
        <div style={{ gridColumn: '2', gridRow: '1 / -1', overflow: 'hidden' }}>
          <ContextPanel />
        </div>
      )}

      <header
        style={{
          gridColumn: contentColumn,
          gridRow: '1',
          position: 'sticky',
          top: 0,
          zIndex: 40,
          height: 72,
          display: 'flex',
          alignItems: 'center',
          padding: '0 18px',
          background: 'var(--shell-topbar-bg)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid var(--shell-panel-border)',
        }}
      >
        <Header onToggleSidebar={() => setMobileOpen((open) => !open)} showHamburger={isMobile} />
      </header>

      <main
        style={{
          gridColumn: contentColumn,
          gridRow: '2',
          overflow: 'auto',
          padding: mainPadding,
          background: 'var(--shell-content-bg)',
          minWidth: 0,
        }}
      >
        <Outlet />
      </main>

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
