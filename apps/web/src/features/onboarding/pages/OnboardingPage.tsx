import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ArrowRight, Loader2 } from 'lucide-react';

import { createWorkspace, getStudioState } from '../../../lib/api';
import { ProfileSpec } from '../../../lib/types';
import { ProfileSummaryCard } from '../components/ProfileSummaryCard';

interface OnboardingPageProps {
  onComplete: () => Promise<void>;
}

interface FormValues {
  name: string;
  profileId: string;
}

export default function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const [profiles, setProfiles]   = useState<ProfileSpec[]>([]);
  const [fetching, setFetching]   = useState(true);
  const [fetchErr, setFetchErr]   = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormValues>({
    defaultValues: { name: '', profileId: '' },
  });

  const selectedProfileId = watch('profileId');
  const selectedProfile   = profiles.find((p) => p.id === selectedProfileId) ?? null;

  useEffect(() => {
    getStudioState()
      .then((s) => { setProfiles(s.profiles); setFetching(false); })
      .catch((err) => { setFetchErr(err instanceof Error ? err.message : 'Failed to load profiles'); setFetching(false); });
  }, []);

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    setSubmitErr(null);
    try {
      await createWorkspace({ name: values.name.trim(), profileId: values.profileId });
      await onComplete();
    } catch (err) {
      setSubmitErr(err instanceof Error ? err.message : 'Failed to create workspace');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen text-white"
      style={{
        backgroundImage: 'linear-gradient(to bottom right, var(--bg-primary), var(--color-primary-soft))',
      }}
    >
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-16">
        <div className="grid w-full gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">

          {/* ── Left: hero copy ─────────────────────────── */}
          <section className="space-y-8">
            {/* Brand */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center shadow-xl flex-shrink-0"
                style={{
                  boxShadow: '0 8px 16px rgba(34, 89, 242, 0.3)',
                }}
              >
                <span className="text-2xl leading-none">🦞</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-inverse)' }}>OpenClaw Studio</h1>
                <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--color-primary)' }}>Agent authoring & operations</p>
              </div>
            </div>

            {/* Headline */}
            <div className="space-y-4">
              <h2 className="text-4xl font-semibold tracking-tight leading-tight" style={{ color: 'var(--text-inverse)' }}>
                Welcome. Let's create your first workspace.
              </h2>
              <p className="text-base leading-relaxed max-w-md" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Bootstrap a fully configured workspace from a profile. Each profile comes pre-loaded with agents, skills, and routines tailored for a specific use case.
              </p>
            </div>

            {/* Feature bullets */}
            <ul className="space-y-3">
              {[
                { label: 'Agents', desc: 'Pre-configured AI agents with roles and skills' },
                { label: 'Flows',  desc: 'Automation flows triggered by events or routines' },
                { label: 'Skills', desc: 'Tools and integrations the agents can use' },
              ].map((f) => (
                <li key={f.label} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5" style={{
                    background: 'rgba(34, 89, 242, 0.2)',
                    border: '1px solid rgba(34, 89, 242, 0.4)',
                  }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white">{f.label}: </span>
                    <span className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>{f.desc}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* ── Right: form card ────────────────────────── */}
          <section>
            <div className="rounded-3xl bg-white shadow-2xl overflow-hidden" style={{
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}>
              {/* Card header */}
              <div className="px-7 py-5 border-b" style={{
                borderColor: 'var(--border-primary)',
                background: 'var(--bg-secondary)',
              }}>
                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Create Workspace</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Choose a profile and name your workspace</p>
              </div>

              {/* Card body */}
              <form onSubmit={handleSubmit(onSubmit)} className="px-7 py-6 space-y-5">
                {/* Error state */}
                {(fetchErr || submitErr) && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {fetchErr ?? submitErr}
                  </div>
                )}

                {/* Profile selector */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>
                    Profile
                  </label>
                  <div className="relative">
                    <select
                      {...register('profileId', { required: 'Select a profile' })}
                      disabled={fetching}
                      style={{
                        borderColor: 'var(--input-border)',
                        background: 'var(--input-bg)',
                        color: 'var(--input-text)',
                      }}
                      className="w-full appearance-none rounded-xl border px-4 py-3 pr-10 text-sm shadow-sm focus:outline-none focus:ring-2 disabled:opacity-50 transition-all"
                      onFocus={(e) => {
                        (e.target as HTMLSelectElement).style.borderColor = 'var(--input-focus)';
                        (e.target as HTMLSelectElement).style.boxShadow = '0 0 0 2px var(--color-primary-soft)';
                      }}
                      onBlur={(e) => {
                        (e.target as HTMLSelectElement).style.borderColor = 'var(--input-border)';
                        (e.target as HTMLSelectElement).style.boxShadow = 'none';
                      }}
                    >
                      <option value="">
                        {fetching ? 'Loading profiles...' : 'Select a profile…'}
                      </option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <ArrowRight
                      size={14}
                      className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rotate-90"
                      style={{ color: 'var(--text-muted)' }}
                    />
                  </div>
                  {errors.profileId && (
                    <p className="text-xs text-red-600">{errors.profileId.message}</p>
                  )}
                </div>

                {/* Profile summary */}
                {selectedProfile && (
                  <ProfileSummaryCard profile={selectedProfile} />
                )}

                {/* Workspace name */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>
                    Workspace Name
                  </label>
                  <input
                    {...register('name', {
                      required: 'Name is required',
                      minLength: { value: 2, message: 'At least 2 characters' },
                    })}
                    placeholder="e.g., My Operations Workspace"
                    style={{
                      borderColor: 'var(--input-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--input-text)',
                    }}
                    className="w-full rounded-xl border px-4 py-3 text-sm shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 transition-all"
                    onFocus={(e) => {
                      (e.target as HTMLInputElement).style.borderColor = 'var(--input-focus)';
                      (e.target as HTMLInputElement).style.boxShadow = '0 0 0 2px var(--color-primary-soft)';
                    }}
                    onBlur={(e) => {
                      (e.target as HTMLInputElement).style.borderColor = 'var(--input-border)';
                      (e.target as HTMLInputElement).style.boxShadow = 'none';
                    }}
                  />
                  {errors.name && (
                    <p className="text-xs text-red-600">{errors.name.message}</p>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting || fetching || !!fetchErr}
                  className="w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  style={{ background: 'var(--color-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-primary-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-primary)')}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Creating workspace…
                    </>
                  ) : (
                    <>
                      Create Workspace
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>

                <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  Profile skills, routines, and model settings will be applied automatically.
                </p>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
