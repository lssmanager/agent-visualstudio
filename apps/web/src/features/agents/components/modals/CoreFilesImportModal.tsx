type Props = {
  open: boolean;
  onClose: () => void;
  onParsed: (files: Record<string, string>) => void;
};

export function CoreFilesImportModal({ open, onClose, onParsed }: Props) {
  if (!open) return null;
  return (
    <div className="rounded-lg border p-4 space-y-3" role="dialog" aria-label="Import core files">
      <p className="text-sm font-semibold">Import Core Files</p>
      <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => onParsed({})}>Parse files</button>
      <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={onClose}>Close</button>
    </div>
  );
}

