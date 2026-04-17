import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { usePreferences } from '../lib/usePreferences';

export function MainLayout() {
  const { sidebarCollapsed, setSidebarCollapsed } = usePreferences();
  const [sidebarOpen, setSidebarOpen] = useState(!sidebarCollapsed);

  useEffect(() => {
    setSidebarCollapsed(!sidebarOpen);
  }, [sidebarOpen, setSidebarCollapsed]);

  const handleToggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar: always fixed, overlays content */}
      {sidebarOpen && (
        <aside className="w-64 bg-slate-900 text-white flex flex-col border-r border-slate-800 fixed h-screen left-0 top-0 z-40">
          <Sidebar onNavigate={() => { if (window.innerWidth < 768) setSidebarOpen(false); }} />
        </aside>
      )}

      {/* Main content: shifts right on desktop when sidebar is open */}
      <div
        className={`flex-1 flex flex-col transition-[margin] duration-200 ease-in-out ${
          sidebarOpen ? 'md:ml-64' : 'ml-0'
        }`}
      >
        <header className="bg-white border-b border-slate-200 h-16 flex items-center px-6 sticky top-0 z-30">
          <Header onToggleSidebar={handleToggleSidebar} />
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile overlay: tap to close */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
