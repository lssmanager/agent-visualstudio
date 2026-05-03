/**
 * CreateChannelPanel.tsx — [F5-05]
 * Panel lateral de creación de canal.
 * Incluye los 7 tipos de canal: webchat, telegram, whatsapp, slack,
 * discord, teams, webhook.
 * Campos dinámicos de secrets por tipo de canal.
 */
import React, { useState } from 'react';
import type { ChannelType, CreateChannelPayload } from '../types';
import { ChannelTypeIcon } from './ChannelTypeIcon';

interface Props {
  onClose:  () => void;
  onCreate: (payload: CreateChannelPayload) => Promise<void>;
}

const CHANNEL_TYPES: { value: ChannelType; label: string; description: string }[] = [
  { value: 'webchat',  label: 'Web Chat',   description: 'Chat embebido en tu web' },
  { value: 'telegram', label: 'Telegram',   description: 'Bot de Telegram via grammY' },
  { value: 'whatsapp', label: 'WhatsApp',   description: 'WhatsApp via Baileys (QR)' },
  { value: 'slack',    label: 'Slack',      description: 'Bot Slack via Bolt SDK' },
  { value: 'discord',  label: 'Discord',    description: 'Bot Discord via discord.js' },
  { value: 'teams',    label: 'MS Teams',   description: 'Bot Microsoft Teams' },
  { value: 'webhook',  label: 'Webhook',    description: 'HTTP POST genérico' },
];

// Campos de secrets por tipo — se envían en la creación y nunca se devuelven
const SECRET_FIELDS: Record<ChannelType, { key: string; label: string; placeholder: string; required?: boolean }[]> = {
  webchat:  [],
  webhook:  [],
  telegram: [
    { key: 'botToken',      label: 'Bot Token',             placeholder: '123456:ABC...',      required: true },
  ],
  whatsapp: [
    // WhatsApp Baileys usa QR — no requiere secrets en la creación
    // (la sesión se establece escaneando el QR tras crear el canal)
  ],
  slack: [
    { key: 'botToken',      label: 'Bot Token (xoxb-...)',  placeholder: 'xoxb-...',           required: true },
    { key: 'signingSecret', label: 'Signing Secret',        placeholder: 'abc123def456...',    required: true },
    { key: 'appToken',      label: 'App Token (xapp-...)',  placeholder: 'xapp-... (opcional)' },
  ],
  discord: [
    { key: 'botToken',      label: 'Bot Token',             placeholder: 'MTk...',             required: true },
    { key: 'publicKey',     label: 'Public Key (Ed25519)',  placeholder: 'hex string...',      required: true },
    { key: 'clientSecret',  label: 'Client Secret',         placeholder: '(opcional)' },
  ],
  teams: [
    { key: 'clientSecret',  label: 'Client Secret (Azure)', placeholder: 'azure secret...',    required: true },
    { key: 'appPassword',   label: 'App Password (Bot FW)', placeholder: 'bot password...',    required: true },
  ],
};

// Descripción de autenticación por tipo (mostrada bajo el título del fieldset)
const AUTH_HINT: Partial<Record<ChannelType, string>> = {
  whatsapp: '📱 WhatsApp Baileys usa autenticación por QR. Tras crear el canal, escanea el código QR para vincular tu número. No se requieren tokens ni secrets.',
  webchat:  '🔗 El canal Webchat se activa con un snippet de código embebido — no requiere credenciales.',
  webhook:  '🔗 El webhook genérico se activa con la URL que se genera al crear el canal.',
};

export function CreateChannelPanel({ onClose, onCreate }: Props) {
  const [type,    setType]    = useState<ChannelType>('webchat');
  const [name,    setName]    = useState('');
  const [agentId, setAgentId] = useState('');
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  function updateSecret(key: string, value: string) {
    setSecrets(prev => ({ ...prev, [key]: value }));
  }

  function handleTypeChange(t: ChannelType) {
    setType(t);
    setSecrets({});
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !agentId.trim()) {
      setError('Nombre y Agent ID son obligatorios.');
      return;
    }

    // Validar secrets requeridos
    const required = SECRET_FIELDS[type].filter(f => f.required);
    for (const f of required) {
      if (!secrets[f.key]?.trim()) {
        setError(`El campo "${f.label}" es obligatorio para este tipo de canal.`);
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      const payload: CreateChannelPayload = {
        type,
        name:    name.trim(),
        agentId: agentId.trim(),
        secrets: Object.keys(secrets).filter(k => secrets[k]?.trim()).length > 0
          ? Object.fromEntries(Object.entries(secrets).filter(([, v]) => v?.trim()))
          : undefined,
        // WhatsApp Baileys: indicar authMode=qr en config para que el backend
        // sepa que debe inicializar Baileys y no el Cloud API
        config: type === 'whatsapp' ? { authMode: 'qr' } : undefined,
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
  const authHint     = AUTH_HINT[type];

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
                title={ct.description}
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

        {/* Hint de autenticación por tipo (QR, embed, etc.) */}
        {authHint && (
          <p className="create-panel__auth-hint">{authHint}</p>
        )}

        {/* Secrets dinámicos por tipo */}
        {secretFields.length > 0 && (
          <fieldset className="create-panel__fieldset">
            <legend className="create-panel__legend">Credenciales</legend>
            {secretFields.map(f => (
              <label key={f.key} className="create-panel__field">
                <span className="create-panel__label">
                  {f.label}
                  {f.required && <span aria-hidden> *</span>}
                </span>
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
