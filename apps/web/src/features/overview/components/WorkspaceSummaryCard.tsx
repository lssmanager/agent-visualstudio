import { WorkspaceSpec } from '../../../lib/types';
import { SectionCard } from '../../../components/ui/SectionCard';
import { Package, Tag, Cpu, Calendar } from 'lucide-react';

interface WorkspaceSummaryCardProps {
  workspace: WorkspaceSpec;
}

export function WorkspaceSummaryCard({ workspace }: WorkspaceSummaryCardProps) {
  const rows: { label: string; value: string; mono?: boolean; icon?: JSX.Element }[] = [
    ...(workspace.description
      ? [{ label: 'Description', value: workspace.description, icon: <Package size={14} /> }]
      : []),
    ...(workspace.defaultModel
      ? [{ label: 'Default Model', value: workspace.defaultModel, mono: true, icon: <Cpu size={14} /> }]
      : []),
    { label: 'Slug', value: workspace.slug, mono: true, icon: <Tag size={14} /> },
    {
      label: 'Created',
      value: new Date(workspace.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      }),
      icon: <Calendar size={14} />,
    },
  ];

  return (
    <SectionCard
      title="Workspace Details"
      icon={<Package size={16} />}
      description={workspace.name}
    >
      <dl className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0">
              {row.icon}
              {row.label}
            </dt>
            <dd
              className={`text-xs text-slate-800 text-right max-w-[60%] truncate ${
                row.mono ? 'font-mono bg-slate-100 rounded px-1.5 py-0.5' : 'font-medium'
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {workspace.tags && workspace.tags.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500 mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {workspace.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
