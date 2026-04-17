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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-16">
        <div className="grid w-full gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">

          {/* ── Left: hero copy ─────────────────────────── */}
          <section className="space-y-8">
            {/* Brand */}
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-900/50 flex-shrink-0">
                <span className="text-2xl leading-none">🦞</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">OpenClaw Studio</h1>
                <p className="text-sm text-blue-400 font-medium mt-0.5">Agent authoring & operations</p>
              </div>
            </div>

            {/* Headline */}
            <div className="space-y-4">
              <h2 className="text-4xl font-semibold tracking-tight leading-tight">
                Welcome. Let's create your first workspace.
              </h2>
              <p className="text-base text-slate-300 leading-relaxed max-w-md">
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
                  <div className="w-5 h-5 rounded-full bg-blue-600/30 border border-blue-500/40 flex-shrink-0 flex items-center justify-center mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white">{f.label}: </span>
                    <span className="text-sm text-slate-400">{f.desc}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* ── Right: form card ────────────────────────── */}
          <section>
            <div className="rounded-3xl bg-white shadow-2xl shadow-black/40 overflow-hidden">
              {/* Card header */}
              <div className="px-7 py-5 border-b border-slate-100 bg-slate-50">
                <h3 className="text-base font-semibold text-slate-900">Create Workspace</h3>
                <p className="text-xs text-slate-500 mt-0.5">Choose a profile and name your workspace</p>
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
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Profile
                  </label>
                  <div className="relative">
                    <select
                      {...register('profileId', { required: 'Select a profile' })}
                      disabled={fetching}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50 transition-all"
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
                      className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rotate-90 text-slate-400"
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
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Workspace Name
                  </label>
                  <input
                    {...register('name', {
                      required: 'Name is required',
                      minLength: { value: 2, message: 'At least 2 characters' },
                    })}
                    placeholder="e.g., My Operations Workspace"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                  {errors.name && (
                    <p className="text-xs text-red-600">{errors.name.message}</p>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting || fetching || !!fetchErr}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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

                <p className="text-center text-xs text-slate-400">
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
