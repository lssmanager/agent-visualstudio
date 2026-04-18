import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';

export function MainLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg-secondary)' }}>

      {/* ── Sidebar (desktop: always fixed 284px) ─────── */}
      <aside
        className={`fixed left-0 top-0 h-screen z-40 transition-transform duration-200 ease-in-out
          w-[284px]
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <Sidebar
          onNavigate={() => { if (window.innerWidth < 768) setMobileOpen(false); }}
        />
      </aside>

      {/* ── Main content ──────────────────────────────── */}
      <div className="flex-1 flex flex-col md:ml-[284px] min-w-0">
        {/* Header */}
        <header
          className="h-16 flex items-center px-6 sticky top-0 z-30 border-b"
          style={{
            background:   'var(--bg-elevated)',
            borderColor:  'var(--border-primary)',
            boxShadow:    'var(--shadow-sm)',
          }}
        >
          <Header onToggleSidebar={() => setMobileOpen((o) => !o)} />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6" style={{ background: 'var(--bg-secondary)' }}>
          <Outlet />
        </main>
      </div>

      {/* ── Mobile overlay ────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </div>
  );
}
