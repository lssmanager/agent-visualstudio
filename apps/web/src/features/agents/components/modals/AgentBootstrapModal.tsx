type Props = {
  open: boolean;
  onSelectProfile: () => void;
  onStartBlank: () => void;
  onImportCoreFiles: () => void;
};

export function AgentBootstrapModal({ open, onSelectProfile, onStartBlank, onImportCoreFiles }: Props) {
  if (!open) return null;
  return (
    <div className="rounded-lg border p-4 space-y-3" role="dialog" aria-label="Agent bootstrap">
      <p className="text-sm font-semibold">This agent has not been initialized yet. Define who this agent is.</p>
      <div className="flex gap-2">
        <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={onSelectProfile}>Select profile template</button>
        <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={onStartBlank}>Start from blank agent</button>
        <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={onImportCoreFiles}>Import from Core Files</button>
      </div>
    </div>
  );
}

