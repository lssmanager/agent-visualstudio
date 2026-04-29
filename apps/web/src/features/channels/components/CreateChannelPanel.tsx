/**
 * CreateChannelPanel.tsx
 * Panel lateral de creación de canal.
 * Campos dinámicos de secrets por tipo de canal.
 */
import React, { useState } from 'react';
import type { ChannelType, CreateChannelPayload } from '../types';
import { ChannelTypeIcon } from './ChannelTypeIcon';

interface Props {
  onClose:    () => void;
  onCreate:   (payload: CreateChannelPayload) => Promise<void>;
}

const CHANNEL_TYPES: { value: ChannelType; label: string }[] = [
  { value: 'webchat',  label: 'WebChat' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'slack',    label: 'Slack' },
  { value: 'discord',  label: 'Discord' },
  { value: 'webhook',  label: 'Webhook genérico' },
];

// Campos de secrets por tipo
const SECRET_FIELDS: Record<ChannelType, { key: string; label: string; placeholder: string }[]> = {
  webchat:  [],
  webhook:  [],
  telegram: [
    { key: 'botToken',  label: 'Bot Token',  placeholder: '123456:ABC...' },
  ],
  whatsapp: [
    { key: 'token',     label: 'API Token',  placeholder: 'Bearer ...' },
    { key: 'phoneId',   label: 'Phone ID',   placeholder: '1234567890' },
  ],
  slack: [
    { key: 'botToken',       label: 'Bot Token',       placeholder: 'xoxb-...' },
    { key: 'signingSecret',  label: 'Signing Secret',  placeholder: 'abc123...' },
  ],
  discord: [
    { key: 'botToken', label: 'Bot Token', placeholder: 'MTk...' },
  ],
};

export function CreateChannelPanel({ onClose, onCreate }: Props) {
  const [type,     setType]     = useState<ChannelType>('webchat');
  const [name,     setName]     = useState('');
  const [agentId,  setAgentId]  = useState('');
  const [secrets,  setSecrets]  = useState<Record<string, string>>({});
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  function updateSecret(key: string, value: string) {
    setSecrets(prev => ({ ...prev, [key]: value }));
  }

  function handleTypeChange(t: ChannelType) {
    setType(t);
    setSecrets({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !agentId.trim()) {
      setError('Nombre y Agent ID son obligatorios.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload: CreateChannelPayload = {
        type,
        name:     name.trim(),
        agentId:  agentId.trim(),
        secrets:  Object.keys(secrets).length > 0 ? secrets : undefined,
      };
      await onCreate(payload);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear canal');
    } finally {
      setBusy(false);
    }
  }

  const secretFields = SECRET_FIELDS[type];

  return (
    <div className="create-panel" role="dialog" aria-modal="true" aria-label="Nuevo canal">
      <div className="create-panel__header">
        <h2 className="create-panel__title">Nuevo canal</h2>
        <button
          className="create-panel__close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>

      <form onSubmit={e => void handleSubmit(e)} className="create-panel__form">

        {/* Tipo */}
        <fieldset className="create-panel__fieldset">
          <legend className="create-panel__legend">Tipo de canal</legend>
          <div className="create-panel__type-grid">
            {CHANNEL_TYPES.map(ct => (
              <button
                key={ct.value}
                type="button"
                className={[
                  'create-panel__type-btn',
                  type === ct.value ? 'create-panel__type-btn--selected' : '',
                ].join(' ')}
                onClick={() => handleTypeChange(ct.value)}
                aria-pressed={type === ct.value}
              >
                <ChannelTypeIcon type={ct.value} size={20} />
                <span>{ct.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Nombre */}
        <label className="create-panel__field">
          <span className="create-panel__label">Nombre del canal <span aria-hidden>*</span></span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Chat pública LSS"
            className="create-panel__input"
            required
            autoFocus
          />
        </label>

        {/* Agent ID */}
        <label className="create-panel__field">
          <span className="create-panel__label">Agent ID <span aria-hidden>*</span></span>
          <input
            type="text"
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            placeholder="UUID del agente destino"
            className="create-panel__input"
            required
          />
        </label>

        {/* Secrets dinámicos por tipo */}
        {secretFields.length > 0 && (
          <fieldset className="create-panel__fieldset">
            <legend className="create-panel__legend">Credenciales</legend>
            {secretFields.map(f => (
              <label key={f.key} className="create-panel__field">
                <span className="create-panel__label">{f.label}</span>
                <input
                  type="password"
                  value={secrets[f.key] ?? ''}
                  onChange={e => updateSecret(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="create-panel__input"
                  autoComplete="off"
                />
              </label>
            ))}
          </fieldset>
        )}

        {error && <p className="create-panel__error" role="alert">{error}</p>}

        <div className="create-panel__footer">
          <button
            type="button"
            className="create-panel__btn-cancel"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="create-panel__btn-create"
            disabled={busy}
          >
            {busy ? 'Creando…' : 'Crear canal'}
          </button>
        </div>
      </form>
    </div>
  );
}
