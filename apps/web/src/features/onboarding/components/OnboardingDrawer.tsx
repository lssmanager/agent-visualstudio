import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, ArrowRight, Loader2 } from 'lucide-react';

import { createWorkspace, getStudioState } from '../../../lib/api';
import { ProfileSpec } from '../../../lib/types';
import { ProfileSummaryCard } from './ProfileSummaryCard';

interface OnboardingDrawerProps {
  open: boolean;
  onComplete: () => Promise<void>;
}

interface FormValues {
  name: string;
  profileId: string;
}

export function OnboardingDrawer({ open, onComplete }: OnboardingDrawerProps) {
  const [profiles, setProfiles]     = useState<ProfileSpec[]>([]);
  const [fetching, setFetching]     = useState(true);
  const [fetchErr, setFetchErr]     = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr]   = useState<string | null>(null);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: { name: '', profileId: '' },
  });

  const selectedProfileId = watch('profileId');
  const selectedProfile   = profiles.find((p) => p.id === selectedProfileId) ?? null;

  useEffect(() => {
    if (!open) return;
    setFetching(true);
    setFetchErr(null);
    getStudioState()
      .then((s) => { setProfiles(s.profiles); setFetching(false); })
      .catch((err) => {
        setFetchErr(err instanceof Error ? err.message : 'Failed to load profiles');
        setFetching(false);
      });
  }, [open]);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setSubmitErr(null);
    try {
      await createWorkspace({ name: values.name.trim(), profileId: values.profileId });
      reset();
      await onComplete();
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : 'Failed to create workspace');
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" />

      {/* Drawer */}
      <aside className="fixed top-0 right-0 h-full w-[420px] max-w-full bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
            <span className="text-lg leading-none">🦞</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-heading font-semibold text-[var(--text-primary)] leading-tight">
              Create your first workspace
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Choose a profile to bootstrap agents and skills
            </p>
          </div>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 overflow-y-auto px-6 py-6 space-y-5"
        >
          {(fetchErr || submitErr) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {fetchErr ?? submitErr}
            </div>
          )}

          {/* Profile selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">
              Profile
            </label>
            <div className="relative">
              <select
                {...register('profileId', { required: 'Select a profile' })}
                disabled={fetching}
                className="w-full appearance-none rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 pr-10 text-sm text-[var(--input-text)] focus:border-[var(--input-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)] disabled:opacity-50 transition-all"
              >
                <option value="">
                  {fetching ? 'Loading profiles…' : 'Select a profile…'}
                </option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ArrowRight
                size={14}
                className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rotate-90 text-[var(--text-muted)]"
              />
            </div>
            {errors.profileId && (
              <p className="text-xs text-red-600">{errors.profileId.message}</p>
            )}
          </div>

          {/* Profile summary */}
          {selectedProfile && <ProfileSummaryCard profile={selectedProfile} />}

          {/* Workspace name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">
              Workspace Name
            </label>
            <input
              {...register('name', {
                required: 'Name is required',
                minLength: { value: 2, message: 'At least 2 characters' },
              })}
              placeholder="e.g., My Operations Workspace"
              className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--input-text)] placeholder:text-[var(--input-placeholder)] focus:border-[var(--input-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)] transition-all"
            />
            {errors.name && (
              <p className="text-xs text-red-600">{errors.name.message}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || fetching || !!fetchErr}
            className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--color-primary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-primary-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-primary)')}
          >
            {submitting ? (
              <><Loader2 size={16} className="animate-spin" /> Creating workspace…</>
            ) : (
              <><span>Create Workspace</span><ArrowRight size={16} /></>
            )}
          </button>

          <p className="text-center text-xs text-[var(--text-muted)]">
            Profile skills, routines, and model settings will be applied automatically.
          </p>

          {/* Feature bullets */}
          <ul className="space-y-2 pt-2">
            {[
              { label: 'Agents',  desc: 'Pre-configured AI agents with roles and skills' },
              { label: 'Flows',   desc: 'Automation flows triggered by events or routines' },
              { label: 'Skills',  desc: 'Tools and integrations the agents can use' },
            ].map((f) => (
              <li key={f.label} className="flex items-start gap-2.5">
                <div className="w-4 h-4 rounded-full bg-[var(--color-primary-soft)] border border-[var(--color-primary)] flex-shrink-0 flex items-center justify-center mt-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-[var(--text-primary)]">{f.label}: </span>
                  <span className="text-xs text-[var(--text-muted)]">{f.desc}</span>
                </div>
              </li>
            ))}
          </ul>
        </form>
      </aside>
    </>
  );
}
