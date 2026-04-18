import { type ReactNode } from 'react';
import { FolderOpen, Users, GitBranch, Wrench } from 'lucide-react';

interface StudioSidebarProps {
  workspaceName?: string;
  agentsCount: number;
  flowsCount: number;
  skillsCount: number;
}

interface StatRowProps {
  icon: ReactNode;
  label: string;
  count: number;
}

function StatRow({ icon, label, count }: StatRowProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 text-slate-600">
        <span className="text-slate-400">{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-xs font-semibold text-slate-900 tabular-nums">{count}</span>
    </div>
  );
}

export function StudioSidebar({ workspaceName, agentsCount, flowsCount, skillsCount }: StudioSidebarProps) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Workspace header */}
      <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2.5">
        <FolderOpen size={15} className="text-blue-600 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900 truncate">
            {workspaceName ?? 'No workspace'}
          </p>
          <p className="text-xs text-slate-500">Active workspace</p>
        </div>
      </div>

      {/* Stats */}
      <div className="px-3 divide-y divide-slate-50">
        <StatRow icon={<Users size={13} />} label="Agents" count={agentsCount} />
        <StatRow icon={<GitBranch size={13} />} label="Flows" count={flowsCount} />
        <StatRow icon={<Wrench size={13} />} label="Skills" count={skillsCount} />
      </div>
    </aside>
  );
}
