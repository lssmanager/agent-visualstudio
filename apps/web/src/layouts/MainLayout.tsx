import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { NavRail } from '../components/NavRail';
import { ContextPanel } from '../components/ContextPanel';
import { Header } from '../components/Header';

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : true
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export function MainLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 1101px)');
  const isMobile  = !useMediaQuery('(min-width: 769px)');

  const showContext = isDesktop;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : showContext ? '64px 260px 1fr' : '64px 1fr',
        gridTemplateRows: '72px 1fr',
        height: '100vh',
        background: 'var(--bg-secondary)',
      }}
    >
      {/* NavRail — col 1, spans all rows */}
      {!isMobile && (
        <div style={{ gridColumn: '1', gridRow: '1 / -1', zIndex: 10 }}>
          <NavRail />
        </div>
      )}

      {/* ContextPanel — col 2, spans all rows (desktop only) */}
      {showContext && (
        <div style={{ gridColumn: '2', gridRow: '1 / -1', overflow: 'hidden' }}>
          <ContextPanel />
        </div>
      )}

      {/* Header — last column, row 1 */}
      <header
        style={{
          gridColumn: isMobile ? '1' : showContext ? '3' : '2',
          gridRow: '1',
          position: 'sticky',
          top: 0,
          zIndex: 30,
          height: 72,
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          background: 'rgba(255,255,255,0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-primary)',
        }}
      >
        <Header
          onToggleSidebar={() => setMobileOpen((o) => !o)}
          showHamburger={isMobile}
        />
      </header>

      {/* Main content — last column, row 2 */}
      <main
        style={{
          gridColumn: isMobile ? '1' : showContext ? '3' : '2',
          gridRow: '2',
          overflow: 'auto',
          padding: '20px 24px 28px',
          background: 'var(--bg-secondary)',
          minWidth: 0,
        }}
      >
        <Outlet />
      </main>

      {/* Mobile rail overlay */}
      {isMobile && mobileOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 39,
            }}
            onClick={() => setMobileOpen(false)}
          />
          <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 40 }}>
            <NavRail onNavigate={() => setMobileOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
