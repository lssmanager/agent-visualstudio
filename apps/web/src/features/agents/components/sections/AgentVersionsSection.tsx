import type { DeployPreview } from '../../../../lib/types';

type Props = {
  files: DeployPreview['artifacts'];
};

export function AgentVersionsSection({ files }: Props) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Versions</h3>
      <pre className="text-xs overflow-auto rounded-md border p-2">{JSON.stringify(files, null, 2)}</pre>
    </section>
  );
}

