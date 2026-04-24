import type { EditorSkillsToolsDto } from '../../../../lib/types';

type Props = {
  data: EditorSkillsToolsDto | null;
  onPatch: (payload: { skills?: { select?: string[]; deselect?: string[]; require?: string[]; disable?: string[] }; tools?: { select?: string[]; deselect?: string[]; require?: string[]; disable?: string[] } }) => Promise<void>;
};

export function AgentSkillsToolsSection({ data, onPatch }: Props) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Skills / Tools</h3>
      <p className="text-xs opacity-80">Catalog and inheritance assignment only. No ad-hoc installs here.</p>
      <button
        type="button"
        className="rounded-md border px-3 py-1 text-xs"
        onClick={() => void onPatch({})}
      >
        Refresh effective assignment
      </button>
      <pre className="text-xs overflow-auto rounded-md border p-2">{JSON.stringify(data?.effective ?? { skills: [], tools: [] }, null, 2)}</pre>
    </section>
  );
}

