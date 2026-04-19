import { Save, CheckCircle, Undo2, Redo2 } from 'lucide-react';

interface CanvasToolbarProps {
  onSave: () => void;
  onValidate: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  saving?: boolean;
  validating?: boolean;
}

export function CanvasToolbar({ onSave, onValidate, onUndo, onRedo, canUndo, canRedo, saving, validating }: CanvasToolbarProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border"
      style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
    >
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
        style={{ background: 'var(--color-primary)' }}
      >
        <Save size={13} />
        {saving ? 'Saving...' : 'Save'}
      </button>

      <button
        onClick={onValidate}
        disabled={validating}
        className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
        style={{ color: '#059669', background: '#d1fae5' }}
      >
        <CheckCircle size={13} />
        {validating ? 'Validating...' : 'Validate'}
      </button>

      <div className="w-px h-5 mx-1" style={{ background: 'var(--border-primary)' }} />

      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="p-1.5 rounded transition-colors disabled:opacity-30"
        style={{ color: 'var(--text-muted)' }}
        title="Undo"
      >
        <Undo2 size={14} />
      </button>

      <button
        onClick={onRedo}
        disabled={!canRedo}
        className="p-1.5 rounded transition-colors disabled:opacity-30"
        style={{ color: 'var(--text-muted)' }}
        title="Redo"
      >
        <Redo2 size={14} />
      </button>
    </div>
  );
}
