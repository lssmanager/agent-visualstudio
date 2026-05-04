import { useState } from 'react';
import type { DepartmentWorkspace, AgentTemplate } from './useAgencyTemplates';
import { AgentTemplateCard } from './AgentTemplateCard';

interface DepartmentListProps {
  departments: DepartmentWorkspace[];
  onAgentClick: (agent: AgentTemplate) => void;
}

export function DepartmentList({ departments, onAgentClick }: DepartmentListProps) {
  const [activeDeptId, setActiveDeptId] = useState<string>(departments[0]?.id ?? '');

  const activeDept = departments.find((d) => d.id === activeDeptId);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tabs de departments — scroll horizontal */}
      <div
        className="flex gap-1 overflow-x-auto pb-2 flex-shrink-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {departments.map((dept) => (
          <button
            key={dept.id}
            onClick={() => setActiveDeptId(dept.id)}
            className="flex-shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap"
            style={
              activeDeptId === dept.id
                ? { background: 'var(--color-primary)', color: '#fff' }
                : { background: 'var(--shell-chip-bg)', color: 'var(--text-muted)' }
            }
          >
            {dept.name}
            <span className="ml-1 text-[10px] opacity-60">
              {dept.agents.length}
            </span>
          </button>
        ))}
      </div>

      {/* Grid de cards */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeDept ? (
          <div className="grid grid-cols-1 gap-2 pb-4">
            {activeDept.agents.map((agent) => (
              <AgentTemplateCard
                key={agent.slug}
                agent={agent}
                onClick={onAgentClick}
              />
            ))}
          </div>
        ) : (
          <div
            className="flex items-center justify-center h-32 text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            No hay agentes en este department.
          </div>
        )}
      </div>
    </div>
  );
}
