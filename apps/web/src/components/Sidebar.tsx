import { useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Package,
  Users,
  BookOpen,
  AlertCircle,
  MessageSquare,
  Landmark,
} from 'lucide-react';

interface SidebarProps {
  onNavigate?: () => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: 'Studio', path: '/', icon: <Home size={20} /> },
  { label: 'Workspaces', path: '/workspaces', icon: <Package size={20} /> },
  { label: 'Agents', path: '/agents', icon: <Users size={20} /> },
  { label: 'Profiles', path: '/profiles', icon: <BookOpen size={20} /> },
  { label: 'Diagnostics', path: '/diagnostics', icon: <AlertCircle size={20} /> },
  { label: 'Sessions', path: '/sessions', icon: <MessageSquare size={20} /> },
  { label: 'Routing', path: '/routing', icon: <Landmark size={20} /> },
];

export function Sidebar({ onNavigate }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigate = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo / Branding */}
      <div className="px-6 py-6 border-b border-slate-800">
        <h1 className="text-lg font-bold text-white">OpenClaw Studio</h1>
        <p className="text-xs text-slate-400 mt-1">v1.0</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="text-sm font-medium text-left flex-1">{item.label}</span>
              {isActive && <span className="text-blue-300">→</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-6 border-t border-slate-800 text-xs text-slate-400">
        <p>Backend online</p>
        <p className="mt-2 text-slate-500">🟢 API responding</p>
      </div>
    </div>
  );
}
