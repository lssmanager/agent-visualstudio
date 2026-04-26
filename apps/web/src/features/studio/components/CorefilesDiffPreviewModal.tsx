import type { DeployPreview } from '../../../lib/types';
import { StudioEmptyState, StudioMetricRow, StudioSectionCard } from '../../../components/ui';

interface CorefilesDiffPreviewModalProps {
  open: boolean;
  preview: DeployPreview | null;
  busy?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onApply: () => void;
}

export function CorefilesDiffPreviewModal({
  open,
  preview,
  busy = false,
  onClose,
  onRefresh,
  onApply,
}: CorefilesDiffPreviewModalProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 82,
        background: 'rgba(5, 8, 14, 0.62)',
        backdropFilter: 'blur(4px)',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 980,
          margin: '0 auto',
          maxHeight: '100%',
          overflow: 'auto',
          borderRadius: 'var(--radius-2xl)',
          border: '1px solid var(--card-border)',
          background: 'var(--card-bg)',
          padding: 16,
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'grid', gap: 2 }}>
            <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>Core Files Diff Preview</strong>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {'Preview → Diff → Apply lifecycle for workspace artifacts.'}
            </span>
          </div>
          <button type="button" onClick={onClose} style={secondaryButton()}>
            Close
          </button>
        </div>

        <StudioSectionCard
          title="Lifecycle Controls"
          description="Refresh diff and apply changes from a governed modal flow."
          actions={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={onRefresh} disabled={busy} style={secondaryButton()}>
                {busy ? 'Refreshing...' : 'Refresh Diff'}
              </button>
              <button type="button" onClick={onApply} disabled={busy || !preview || preview.diff.length === 0} style={primaryButton()}>
                {busy ? 'Applying...' : 'Apply Changes'}
              </button>
            </div>
          }
        >
          {!preview ? (
            <StudioEmptyState title="No preview loaded" description="Run Preview Diff from Workspace Studio first." />
          ) : preview.diff.length === 0 ? (
            <StudioEmptyState title="No changes detected" description="Core files are already aligned with current workspace state." />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {preview.diff.map((entry) => (
                <StudioMetricRow
                  key={`${entry.path}-${entry.status}`}
                  label={entry.path}
                  value={entry.status}
                  hint={entry.status === 'unchanged' ? 'No action' : 'Ready to apply'}
                />
              ))}
            </div>
          )}
        </StudioSectionCard>

        <StudioSectionCard title="Diagnostics" description="Compile and lifecycle warnings linked to this preview">
          {!preview || preview.diagnostics.length === 0 ? (
            <StudioEmptyState title="No diagnostics" description="No warnings reported for the current diff preview." />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {preview.diagnostics.map((item) => (
                <div
                  key={item}
                  style={{
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--tone-warning-border)',
                    background: 'var(--tone-warning-bg)',
                    color: 'var(--tone-warning-text)',
                    padding: '10px 12px',
                    fontSize: 12,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          )}
        </StudioSectionCard>
      </div>
    </div>
  );
}

function primaryButton() {
  return {
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  } as const;
}

function secondaryButton() {
  return {
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border-primary)',
    background: 'var(--card-bg)',
    color: 'var(--text-primary)',
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  } as const;
}
