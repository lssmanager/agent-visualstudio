import { Save, CheckCircle, Undo2, Redo2 } from 'lucide-react';
import type { SaveState } from '../../flows/hooks/useFlowSave';

interface CanvasToolbarProps {
  onSave: () => void;
  onValidate: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** @deprecated usar saveState en su lugar */
  saving?: boolean;
  validating?: boolean;
  /** Estado enriquecido del guardado automático */
  saveState?: SaveState;
  savedAt?: Date | null;
}

export function CanvasToolbar({
  onSave,
  onValidate,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  saving,
  validating,
  saveState,
  savedAt,
}: CanvasToolbarProps) {
  // Compatibilidad: si se pasa saveState, usarlo; si no, caer en el bool legacy.
  const isSaving = saveState === 'saving' || saving;

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border"
      style={{ borderColor: 'var(--border-primary)', background: 'var(--bg-secondary)' }}
    >
      <button
        onClick={onSave}
        disabled={isSaving}
        className="flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50"
        style={{ background: 'var(--color-primary)' }}
      >
        <Save size={13} />
        {isSaving ? 'Saving...' : 'Save'}
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

      {/* ── Save state indicator (auto-save) ────────────────────────── */}
      {saveState && saveState !== 'idle' && (
        <div
          className="ml-auto flex items-center gap-1.5 text-[10px]"
          style={{ color: saveState === 'error' ? '#dc2626' : '#6b7280' }}
        >
          {saveState === 'saving' && (
            <>
              <span
                className="inline-block w-2.5 h-2.5 rounded-full border-2 animate-spin"
                style={{
                  borderColor: '#6b7280',
                  borderTopColor: 'transparent',
                }}
              />
              <span>Guardando…</span>
            </>
          )}

          {saveState === 'saved' && (
            <>
              <span style={{ color: '#16a34a' }}>✓</span>
              <span style={{ color: '#16a34a' }}>Guardado</span>
              {savedAt && (
                <span style={{ color: '#9ca3af' }}>
                  {savedAt.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </>
          )}

          {saveState === 'error' && (
            <span title="Error al guardar — Ctrl+S para reintentar">
              ⚠ Error al guardar
            </span>
          )}
        </div>
      )}
    </div>
  );
}
