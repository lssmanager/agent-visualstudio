import type { CSSProperties, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Rocket, RotateCcw } from 'lucide-react';

import type { CoreFilesPreviewResponse, VersionSnapshot } from '../../../lib/types';

type StepState = 'idle' | 'active' | 'complete' | 'warning';

export type AgencyBuilderStepId = 'pack' | 'agency' | 'departments' | 'workspaces' | 'review';

export interface AgencyBuilderStep {
  id: AgencyBuilderStepId;
  index: number;
  title: string;
  subtitle: string;
  note?: string;
  state: StepState;
}

interface AgencyBuilderStepRailProps {
  steps: AgencyBuilderStep[];
  activeStep: AgencyBuilderStepId;
  onSelectStep: (stepId: AgencyBuilderStepId) => void;
}

interface EntityMetric {
  label: string;
  value: string;
}

interface AgencyBuilderEntityCardProps {
  title: string;
  subtitle: string;
  description: string;
  icon?: ReactNode;
  badges?: string[];
  metrics?: EntityMetric[];
  tone?: 'default' | 'accent' | 'success' | 'warning';
}

interface AgencyBuilderDiffBoardProps {
  preview: CoreFilesPreviewResponse | null;
  versions: VersionSnapshot[];
  selectedSnapshotId: string;
  onSelectSnapshotId: (snapshotId: string) => void;
  onPreview: () => void;
  onApply: () => void;
  onRollback: () => void;
  busy?: boolean;
}

const STEP_TONE_STYLE: Record<StepState, CSSProperties> = {
  idle: {
    borderColor: 'var(--shell-chip-border)',
    background: 'var(--shell-chip-bg)',
    color: 'var(--text-muted)',
  },
  active: {
    borderColor: 'color-mix(in srgb, var(--color-primary) 35%, var(--shell-chip-border))',
    background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
    color: 'var(--text-primary)',
  },
  complete: {
    borderColor: 'var(--tone-success-border)',
    background: 'var(--tone-success-bg)',
    color: 'var(--tone-success-text)',
  },
  warning: {
    borderColor: 'var(--tone-warning-border)',
    background: 'var(--tone-warning-bg)',
    color: 'var(--tone-warning-text)',
  },
};

const ENTITY_TONE_STYLE: Record<NonNullable<AgencyBuilderEntityCardProps['tone']>, CSSProperties> = {
  default: {
    borderColor: 'var(--shell-panel-border)',
    background: 'var(--shell-panel-bg)',
  },
  accent: {
    borderColor: 'color-mix(in srgb, var(--color-primary) 38%, var(--shell-panel-border))',
    background: 'color-mix(in srgb, var(--color-primary) 10%, var(--shell-panel-bg))',
  },
  success: {
    borderColor: 'var(--tone-success-border)',
    background: 'var(--tone-success-bg)',
  },
  warning: {
    borderColor: 'var(--tone-warning-border)',
    background: 'var(--tone-warning-bg)',
  },
};

export function AgencyBuilderStepRail({ steps, activeStep, onSelectStep }: AgencyBuilderStepRailProps) {
  return (
    <section
      style={{
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--shell-panel-border)',
        background: 'var(--shell-panel-bg)',
        padding: 12,
        display: 'grid',
        gap: 8,
      }}
    >
      {steps.map((step) => {
        const isActive = step.id === activeStep;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelectStep(step.id)}
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid',
              textAlign: 'left',
              padding: 12,
              display: 'grid',
              gridTemplateColumns: '34px 1fr',
              gap: 10,
              alignItems: 'start',
              cursor: 'pointer',
              ...STEP_TONE_STYLE[step.state],
              boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                border: '1px solid var(--shell-chip-border)',
                background: 'var(--shell-chip-bg)',
                color: 'var(--color-primary)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              {step.index}
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{step.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>{step.subtitle}</div>
              {step.note && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{step.note}</div>}
            </div>
          </button>
        );
      })}
    </section>
  );
}

export function AgencyBuilderEntityCard({
  title,
  subtitle,
  description,
  icon,
  badges = [],
  metrics = [],
  tone = 'default',
}: AgencyBuilderEntityCardProps) {
  return (
    <article
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid',
        padding: 14,
        display: 'grid',
        gap: 12,
        ...ENTITY_TONE_STYLE[tone],
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</div>
        </div>
        {icon && (
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              border: '1px solid var(--shell-chip-border)',
              background: 'var(--shell-chip-bg)',
              color: 'var(--color-primary)',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' }}>{description}</p>

      {badges.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {badges.map((badge) => (
            <span
              key={badge}
              style={{
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--shell-chip-border)',
                background: 'var(--shell-chip-bg)',
                color: 'var(--text-muted)',
                padding: '5px 10px',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {badge}
            </span>
          ))}
        </div>
      )}

      {metrics.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {metrics.map((metric) => (
            <div
              key={metric.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                borderTop: '1px solid var(--shell-chip-border)',
                paddingTop: 8,
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {metric.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{metric.value}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function AgencyBuilderDiffBoard({
  preview,
  versions,
  selectedSnapshotId,
  onSelectSnapshotId,
  onPreview,
  onApply,
  onRollback,
  busy = false,
}: AgencyBuilderDiffBoardProps) {
  return (
    <section
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--shell-panel-border)',
        background: 'var(--shell-panel-bg)',
        padding: 14,
        display: 'grid',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Diff Preview Board</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Preview, apply, and rollback in one control surface.</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={onPreview} style={actionButtonStyle('ghost')} disabled={busy}>
            <RefreshCw size={14} />
            Preview
          </button>
          <button type="button" onClick={onApply} style={actionButtonStyle('primary')} disabled={busy}>
            <Rocket size={14} />
            Apply
          </button>
          <button type="button" onClick={onRollback} style={actionButtonStyle('warn')} disabled={busy || !selectedSnapshotId}>
            <RotateCcw size={14} />
            Rollback
          </button>
        </div>
      </div>

      {preview ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {preview.lifecycle.map((stage) => (
              <span
                key={stage}
                style={{
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--shell-chip-border)',
                  background: 'var(--shell-chip-bg)',
                  color: 'var(--text-muted)',
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {stage}
              </span>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.7fr', gap: 12 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              {preview.diff.length === 0 ? (
                <div style={emptyStyle}>No pending changes in core files.</div>
              ) : (
                preview.diff.map((entry) => (
                  <div key={`${entry.path}-${entry.status}`} style={diffRowStyle(entry.status)}>
                    <div style={{ display: 'grid', gap: 3 }}>
                      <code style={{ fontSize: 12, color: 'var(--text-primary)' }}>{entry.path}</code>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {entry.status === 'unchanged' ? 'No update required' : 'Ready for lifecycle apply'}
                      </span>
                    </div>
                    <span style={diffBadgeStyle(entry.status)}>{entry.status}</span>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={sideCardStyle}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Rollback Snapshot</div>
                <select
                  value={selectedSnapshotId}
                  onChange={(event) => onSelectSnapshotId(event.target.value)}
                  style={{
                    marginTop: 8,
                    width: '100%',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--shell-chip-border)',
                    background: 'var(--shell-chip-bg)',
                    color: 'var(--text-primary)',
                    padding: '9px 10px',
                    fontSize: 12,
                  }}
                >
                  <option value="">Select snapshot</option>
                  {versions.map((snapshot) => (
                    <option key={snapshot.id} value={snapshot.id}>
                      {snapshot.label ?? snapshot.id}
                    </option>
                  ))}
                </select>
              </div>

              <div style={sideCardStyle}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Diagnostics</div>
                {preview.diagnostics.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--tone-success-text)', fontSize: 12 }}>
                    <CheckCircle2 size={13} />
                    No diagnostics
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {preview.diagnostics.map((diagnostic) => (
                      <div
                        key={diagnostic}
                        style={{
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--tone-warning-border)',
                          background: 'var(--tone-warning-bg)',
                          color: 'var(--tone-warning-text)',
                          padding: '7px 8px',
                          fontSize: 11,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <AlertTriangle size={12} />
                        {diagnostic}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div style={emptyStyle}>Run preview to load proposed core-file changes.</div>
      )}
    </section>
  );
}

function actionButtonStyle(variant: 'ghost' | 'primary' | 'warn'): CSSProperties {
  const base: CSSProperties = {
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--shell-chip-border)',
    background: 'var(--shell-chip-bg)',
    color: 'var(--text-primary)',
    padding: '8px 10px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  };

  if (variant === 'primary') {
    return {
      ...base,
      borderColor: 'var(--color-primary)',
      background: 'var(--btn-primary-bg)',
      color: 'var(--btn-primary-text)',
    };
  }

  if (variant === 'warn') {
    return {
      ...base,
      borderColor: 'var(--tone-warning-border)',
      background: 'var(--tone-warning-bg)',
      color: 'var(--tone-warning-text)',
    };
  }

  return base;
}

function diffRowStyle(status: CoreFilesPreviewResponse['diff'][number]['status']): CSSProperties {
  if (status === 'added') {
    return { ...diffRowBase, borderColor: 'var(--tone-success-border)', background: 'var(--tone-success-bg)' };
  }
  if (status === 'updated') {
    return { ...diffRowBase, borderColor: 'var(--tone-warning-border)', background: 'var(--tone-warning-bg)' };
  }
  if (status === 'deleted') {
    return { ...diffRowBase, borderColor: 'var(--tone-danger-border)', background: 'var(--tone-danger-bg)' };
  }
  return { ...diffRowBase, borderColor: 'var(--shell-chip-border)', background: 'var(--shell-chip-bg)' };
}

function diffBadgeStyle(status: CoreFilesPreviewResponse['diff'][number]['status']): CSSProperties {
  const colors =
    status === 'added'
      ? ['var(--tone-success-bg)', 'var(--tone-success-border)', 'var(--tone-success-text)']
      : status === 'updated'
        ? ['var(--tone-warning-bg)', 'var(--tone-warning-border)', 'var(--tone-warning-text)']
        : status === 'deleted'
          ? ['var(--tone-danger-bg)', 'var(--tone-danger-border)', 'var(--tone-danger-text)']
          : ['var(--shell-chip-bg)', 'var(--shell-chip-border)', 'var(--text-muted)'];

  return {
    borderRadius: 'var(--radius-full)',
    border: `1px solid ${colors[1]}`,
    background: colors[0],
    color: colors[2],
    padding: '4px 9px',
    fontSize: 10,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  };
}

const diffRowBase: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid',
  padding: '10px 11px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
};

const sideCardStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--shell-chip-border)',
  background: 'var(--shell-chip-bg)',
  padding: 10,
};

const emptyStyle: CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px dashed var(--shell-chip-border)',
  background: 'var(--shell-chip-bg)',
  color: 'var(--text-muted)',
  padding: '14px 12px',
  textAlign: 'center',
  fontSize: 12,
};
