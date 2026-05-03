import { useState } from 'react';
import {
  X, ArrowRight, ArrowLeft, Loader2, CheckCircle,
  Bot, Key, Radio, Zap,
} from 'lucide-react';
import { useForm } from 'react-hook-form';

import type { ChannelKind, AgentSpec } from '../../../lib/types';
import { provisionChannel } from '../../../lib/channels-api';
import { upsertLlmProvider } from '../../../lib/channels-api';

const STEPS = [
  { id: 1, label: 'Agency',   icon: Bot },
  { id: 2, label: 'LLM Keys', icon: Key },
  { id: 3, label: 'Channels', icon: Radio },
  { id: 4, label: 'Agent',    icon: Zap },
] as const;

// Onboarding exposes only the 4 token-based channels + webchat.
// Slack/Teams/Webhook are available in Settings → Channels (full form).
const CHANNEL_KINDS: { kind: ChannelKind; label: string; placeholder: string }[] = [
  { kind: 'telegram',  label: 'Telegram',  placeholder: 'Bot token (from @BotFather)' },
  { kind: 'whatsapp',  label: 'WhatsApp',  placeholder: 'Meta access token' },
  { kind: 'discord',   label: 'Discord',   placeholder: 'Bot token' },
  { kind: 'webchat',   label: 'Web Chat',  placeholder: '(no token required)' },
];

const LLM_PROVIDERS = [
  { key: 'openai',     label: 'OpenAI',      placeholder: 'sk-…' },
  { key: 'anthropic',  label: 'Anthropic',   placeholder: 'sk-ant-…' },
  { key: 'openrouter', label: 'OpenRouter',  placeholder: 'sk-or-…' },
  { key: 'deepseek',   label: 'DeepSeek',    placeholder: 'key…' },
  { key: 'qwen',       label: 'Qwen / Alibaba', placeholder: 'key…' },
];

interface Props {
  open: boolean;
  workspaceId: string;
  agents: AgentSpec[];
  onComplete: () => Promise<void>;
  onClose?: () => void;
}

interface FormValues {
  agencyName: string;
  llmKeys: Record<string, string>;
  defaultProvider: string;
  channelKind: ChannelKind | '';
  channelToken: string;
  channelName: string;
  agentId: string;
}

export function OnboardingWizard({ open, workspaceId, agents, onComplete, onClose }: Props) {
  const [step, setStep]       = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [done, setDone]       = useState(false);

  const { register, handleSubmit, watch, reset, formState: { errors } } =
    useForm<FormValues>({
      defaultValues: {
        agencyName: '', llmKeys: {}, defaultProvider: 'openai',
        channelKind: '', channelToken: '', channelName: '', agentId: '',
      },
    });

  const channelKind = watch('channelKind');

  function handleClose() {
    reset(); setStep(1); setErr(null); setDone(false); onClose?.();
  }

  function next() { setErr(null); setStep((s) => Math.min(4, s + 1) as 1|2|3|4); }
  function back() { setErr(null); setStep((s) => Math.max(1, s - 1) as 1|2|3|4); }

  async function finish(values: FormValues) {
    setBusy(true); setErr(null);
    try {
      // 1. Save non-empty LLM keys
      for (const p of LLM_PROVIDERS) {
        const k = values.llmKeys[p.key]?.trim();
        if (k) {
          await upsertLlmProvider(workspaceId, {
            provider: p.key, label: p.label, apiKey: k,
            isDefault: p.key === values.defaultProvider,
          });
        }
      }

      // 2. Provision channel if selected — branch by kind to satisfy
      //    ProvisionPayload discriminated union (CR comment on PR #230).
      //    OnboardingWizard only exposes telegram/whatsapp/discord/webchat,
      //    so the slack/teams branches are unreachable here but the type
      //    system is satisfied without a cast.
      if (values.channelKind) {
        const kind     = values.channelKind;
        const name     = values.channelName || kind;
        const token    = values.channelToken.trim();

        const ch = await (() => {
          if (kind === 'telegram' || kind === 'whatsapp' || kind === 'discord') {
            return provisionChannel(workspaceId, { kind, name, token });
          }
          // webchat / webhook — no credentials
          return provisionChannel(workspaceId, { kind: kind as 'webchat' | 'webhook', name });
        })();

        // 3. Bind to selected agent
        if (values.agentId && ch.id) {
          const { bindChannel } = await import('../../../lib/channels-api');
          await bindChannel(workspaceId, ch.id, values.agentId);
        }
      }

      setDone(true);
      await onComplete();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.28)',
          backdropFilter:'blur(2px)', WebkitBackdropFilter:'blur(2px)', zIndex:1100 }}
        onClick={handleClose}
      />
      <aside style={{
        position:'fixed', top:16, right:16, bottom:16, width:480,
        maxWidth:'calc(100vw - 32px)',
        background:'rgba(255,255,255,0.98)',
        border:'1px solid rgba(255,255,255,0.7)',
        borderRadius:22,
        boxShadow:'0 28px 80px rgba(15,23,42,0.18)',
        zIndex:1101, display:'flex', flexDirection:'column', overflow:'hidden',
      }}>
        {/* Header */}
        <div style={{ padding:'20px 20px 14px', borderBottom:'1px solid var(--border-primary)',
          background:'#fbfdff', flexShrink:0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--color-primary)] flex items-center justify-center">
                <span className="text-lg">🦞</span>
              </div>
              <div>
                <h2 className="text-sm font-heading font-semibold text-[var(--text-primary)] leading-tight">
                  Quick Setup
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {STEPS[step - 1].label}
                </p>
              </div>
            </div>
            <button onClick={handleClose} className="p-1 hover:bg-[var(--bg-tertiary)] rounded-lg" aria-label="Close">
              <X size={18} className="text-[var(--text-muted)]" />
            </button>
          </div>

          {/* Step pills */}
          <div className="flex gap-1.5">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const active = s.id === step;
              const past   = s.id < step;
              return (
                <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all"
                    style={{
                      background: past || active ? 'var(--color-primary)' : 'var(--border-primary)',
                      color: past || active ? '#fff' : 'var(--text-muted)',
                    }}
                  >
                    {past ? <CheckCircle size={14} /> : <Icon size={14} />}
                  </div>
                  <span className="text-[10px]" style={{ color: active ? 'var(--color-primary)' : 'var(--text-muted)' }}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit(finish)}
          style={{ flex:1, overflowY:'auto', padding:'18px 20px', display:'grid', gap:16 }}
        >
          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
          )}

          {done && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-6 flex flex-col items-center gap-3">
              <CheckCircle size={36} className="text-green-500" />
              <p className="text-sm font-semibold text-green-700">All set! Your workspace is ready.</p>
            </div>
          )}

          {/* ── Step 1: Agency name ── */}
          {step === 1 && !done && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-muted)]">
                Give your agency a name. This becomes the workspace display name.
              </p>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-1.5">
                  Agency Name
                </label>
                <input
                  {...register('agencyName', { required: 'Required' })}
                  placeholder="e.g., Acme Operations"
                  className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm
                    text-[var(--input-text)] placeholder:text-[var(--input-placeholder)]
                    focus:border-[var(--input-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                />
                {errors.agencyName && <p className="text-xs text-red-600 mt-1">{errors.agencyName.message}</p>}
              </div>
            </div>
          )}

          {/* ── Step 2: LLM Keys ── */}
          {step === 2 && !done && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-muted)]">
                Add at least one LLM API key. Keys are encrypted before being stored — they never touch disk as plain text.
              </p>
              {LLM_PROVIDERS.map((p) => (
                <div key={p.key}>
                  <label className="flex items-center justify-between text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-1.5">
                    {p.label}
                    <label className="flex items-center gap-1.5 normal-case font-normal text-[var(--text-muted)] cursor-pointer">
                      <input type="radio" value={p.key} {...register('defaultProvider')} className="accent-[var(--color-primary)]" />
                      Default
                    </label>
                  </label>
                  <input
                    {...register(`llmKeys.${p.key}`)}
                    type="password"
                    placeholder={p.placeholder}
                    autoComplete="off"
                    className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-2.5 text-sm
                      text-[var(--input-text)] placeholder:text-[var(--input-placeholder)]
                      focus:border-[var(--input-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Step 3: Channels ── */}
          {step === 3 && !done && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-muted)]">
                Connect a messaging channel. You can add more from Settings → Channels later.
              </p>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-1.5">
                  Channel Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CHANNEL_KINDS.map((c) => (
                    <label
                      key={c.kind}
                      className="flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all text-sm"
                      style={{
                        borderColor: channelKind === c.kind ? 'var(--color-primary)' : 'var(--border-primary)',
                        background: channelKind === c.kind ? 'var(--color-primary-soft)' : 'var(--input-bg)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <input type="radio" value={c.kind} {...register('channelKind')} className="sr-only" />
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>

              {channelKind && channelKind !== 'webchat' && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-1.5">
                    Token / Credential
                  </label>
                  <input
                    {...register('channelToken')}
                    type="password"
                    placeholder={CHANNEL_KINDS.find((c) => c.kind === channelKind)?.placeholder ?? ''}
                    autoComplete="off"
                    className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm
                      text-[var(--input-text)] placeholder:text-[var(--input-placeholder)]
                      focus:border-[var(--input-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                  />
                </div>
              )}

              {channelKind && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide mb-1.5">
                    Display Name
                  </label>
                  <input
                    {...register('channelName')}
                    placeholder={`My ${channelKind} channel`}
                    className="w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm
                      text-[var(--input-text)] placeholder:text-[var(--input-placeholder)]
                      focus:border-[var(--input-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)]"
                  />
                </div>
              )}

              {!channelKind && (
                <p className="text-xs text-[var(--text-muted)] italic text-center py-2">
                  Skip this step — you can configure channels later.
                </p>
              )}
            </div>
          )}

          {/* ── Step 4: Bind Agent ── */}
          {step === 4 && !done && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--text-muted)]">
                Choose which agent will handle messages on this channel. You can change this at any time.
              </p>
              {agents.length === 0 ? (
                <div className="py-6 text-center text-sm text-[var(--text-muted)]">
                  No agents found — create one first from the Agents page.
                </div>
              ) : (
                <div className="space-y-2">
                  {agents.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all"
                      style={{
                        borderColor: watch('agentId') === a.id ? 'var(--color-primary)' : 'var(--border-primary)',
                        background: watch('agentId') === a.id ? 'var(--color-primary-soft)' : 'var(--input-bg)',
                      }}
                    >
                      <input type="radio" value={a.id} {...register('agentId')} className="sr-only" />
                      <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
                        <Bot size={14} className="text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{a.name}</div>
                        <div className="text-xs text-[var(--text-muted)]">{a.role}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <div style={{ padding:'16px 20px', borderTop:'1px solid var(--border-primary)',
          background:'#fbfdff', flexShrink:0 }}>
          <div className="flex items-center gap-3">
            {step > 1 && !done && (
              <button
                type="button" onClick={back} disabled={busy}
                className="flex items-center gap-2 flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-all disabled:opacity-50"
                style={{ color:'var(--text-primary)', border:'1px solid var(--border-primary)', background:'var(--bg-primary)' }}
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {step < 4 && !done && (
              <button
                type="button" onClick={next} disabled={busy}
                className="flex items-center justify-center gap-2 flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background:'var(--color-primary)' }}
              >
                Next <ArrowRight size={14} />
              </button>
            )}
            {step === 4 && !done && (
              <button
                type="submit" onClick={handleSubmit(finish)} disabled={busy}
                className="flex items-center justify-center gap-2 flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background:'var(--color-primary)' }}
              >
                {busy ? <><Loader2 size={14} className="animate-spin" /> Finishing…</> : <><CheckCircle size={14} /> Finish Setup</>}
              </button>
            )}
            {done && (
              <button
                type="button" onClick={handleClose}
                className="flex items-center justify-center gap-2 flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white"
                style={{ background:'var(--color-primary)' }}
              >
                <CheckCircle size={14} /> Done
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
