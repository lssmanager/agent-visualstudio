import { useEffect, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import type { AgentTemplate } from './useAgencyTemplates';

interface AgentTemplatePreviewProps {
  agent: AgentTemplate;
  onClose: () => void;
  /**
   * Se llama cuando el usuario hace click en "Usar este agente".
   * El padre usará este dato para preparar el drag o insertar directamente.
   */
  onUse: (agent: AgentTemplate) => void;
  /** Cargador del detalle (systemPrompt) del agente */
  loadDetail: (slug: string) => Promise<AgentTemplate | null>;
}

export function AgentTemplatePreview({ agent, onClose, onUse, loadDetail }: AgentTemplatePreviewProps) {
  const [detail, setDetail] = useState<AgentTemplate | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [copied, setCopied] = useState(false);

  // Carga el detalle (systemPrompt) al abrir
  useEffect(() => {
    let cancelled = false;
    setLoadingDetail(true);
    loadDetail(agent.slug).then((d) => {
      if (!cancelled) {
        setDetail(d);
        setLoadingDetail(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [agent.slug, loadDetail]);

  const systemPrompt = detail?.systemPrompt ?? agent.systemPrompt ?? '';

  const handleCopy = async () => {
    if (!systemPrompt) return;
    await navigator.clipboard.writeText(systemPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Cerrar con Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'oklch(0 0 0 / 0.4)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Preview: ${agent.name}`}
        className="fixed right-0 top-0 h-full z-50 flex flex-col shadow-2xl"
        style={{
          width: 'min(520px, 90vw)',
          background: 'var(--bg-primary)',
          borderLeft: '1px solid var(--border-primary)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl">{agent.emoji ?? '🤖'}</span>
            <div className="min-w-0">
              <h2
                className="text-sm font-semibold truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {agent.name}
              </h2>
              <span
                className="text-[11px]"
                style={{ color: 'var(--text-muted)' }}
              >
                {agent.department}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded transition-colors flex-shrink-0"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Cerrar preview"
          >
            <X size={16} />
          </button>
        </div>

        {/* Descripción */}
        <div
          className="px-5 py-3 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {agent.description}
          </p>
          {agent.vibe && (
            <p
              className="mt-1.5 text-[11px] italic"
              style={{ color: 'var(--text-faint)' }}
            >
              "{agent.vibe}"
            </p>
          )}
          {agent.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {agent.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded px-1.5 py-0.5 text-[10px]"
                  style={{ background: 'var(--shell-chip-bg)', color: 'var(--text-muted)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* System Prompt */}
        <div className="flex-1 flex flex-col min-h-0 px-5 py-3 gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
              System Prompt
            </span>
            <button
              onClick={handleCopy}
              disabled={!systemPrompt}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors disabled:opacity-40"
              style={{ color: 'var(--text-muted)', background: 'var(--shell-chip-bg)' }}
              aria-label="Copiar system prompt"
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          {loadingDetail ? (
            <div className="flex-1 flex items-center justify-center">
              <span
                className="inline-block w-5 h-5 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--color-primary)' }}
              />
            </div>
          ) : (
            <textarea
              readOnly
              value={systemPrompt || 'System prompt no disponible para este agente.'}
              className="flex-1 resize-none rounded-md p-3 text-[11px] font-mono leading-relaxed focus:outline-none"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-primary)',
                minHeight: 0,
              }}
              aria-label="System prompt del agente (solo lectura)"
            />
          )}
        </div>

        {/* Footer — CTA */}
        <div
          className="px-5 py-4 flex-shrink-0 border-t flex gap-2"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <button
            onClick={() => {
              onUse(detail ?? agent);
              onClose();
            }}
            className="flex-1 rounded-lg py-2.5 text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--color-primary)' }}
          >
            ✦ Usar este agente
          </button>
          <button
            onClick={onClose}
            className="px-4 rounded-lg py-2.5 text-sm font-medium transition-colors"
            style={{
              background: 'var(--shell-chip-bg)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-primary)',
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}
