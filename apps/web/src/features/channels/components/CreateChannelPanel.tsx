/**
 * CreateChannelPanel.tsx — [F5-05]
 *
 * Panel lateral de creación de canal.
 * Incluye los 7 ChannelType: webchat, telegram, whatsapp, slack, discord, teams, webhook.
 * Campos dinámicos de secrets por tipo de canal.
 */
import React, { useState } from 'react';
import type { ChannelType, CreateChannelPayload } from '../types';
import { ChannelTypeIcon } from './ChannelTypeIcon';

interface Props {
  onClose:    () => void;
  onCreate:   (payload: CreateChannelPayload) => Promise<void>;
}

const CHANNEL_TYPES: { value: ChannelType; label: string; hint: string }[] = [
  { value: 'webchat',  label: 'Web Chat',   hint: 'Widget embebido en tu sitio web' },
  { value: 'telegram', label: 'Telegram',   hint: 'Bot via Telegram API' },
  { value: 'whatsapp', label: 'WhatsApp',   hint: 'WhatsApp Business Cloud API o Baileys QR' },
  { value: 'slack',    label: 'Slack',      hint: 'App de Slack con Bolt SDK' },
  { value: 'discord',  label: 'Discord',    hint: 'Bot de Discord con discord.js' },
  { value: 'teams',    label: 'MS Teams',   hint: 'Bot de Microsoft Teams via Bot Framework' },
  { value: 'webhook',  label: 'Webhook',    hint: 'HTTP POST genérico para integraciones custom' },
];

// Campos de secrets por tipo
const SECRET_FIELDS: Record<ChannelType, { key: string; label: string; placeholder: string; hint?: string; required?: boolean }[]> = {
  webchat:  [],
  webhook:  [],
  telegram: [
    { key: 'botToken',  label: 'Bot Token',  placeholder: '123456:ABC...', hint: 'Obtenlo de @BotFather con el comando /token.', required: true },
  ],
  whatsapp: [
    { key: 'token',   label: 'API Token (Meta Cloud API)',  placeholder: 'EAAxxxxxxx...', hint: 'Dejar vacío si usas Baileys QR (no requiere token).' },
    { key: 'phoneId', label: 'Phone Number ID (Meta)',      placeholder: '1234567890',    hint: 'ID del número en Meta Developers. Dejar vacío si usas Baileys.' },
  ],
  slack: [
    { key: 'botToken',      label: 'Bot Token',      placeholder: 'xoxb-...',     hint: 'OAuth & Permissions → Bot User OAuth Token.', required: true },
    { key: 'signingSecret', label: 'Signing Secret', placeholder: 'abc123...',    hint: 'Basic Information → App Credentials → Signing Secret.', required: true },
    { key: 'appToken',      label: 'App-Level Token (Socket Mode, opcional)', placeholder: 'xapp-...', hint: 'Basic Information → App-Level Tokens. Solo si usas Socket Mode.' },
  ],
  discord: [
    { key: 'botToken',     label: 'Bot Token',     placeholder: 'MTk...',   hint: 'Developer Portal → Bot → Reset Token.', required: true },
    { key: 'publicKey',    label: 'Public Key',    placeholder: 'hex...',   hint: 'Developer Portal → General Information → Public Key. Requerido para verificar interacciones.', required: true },
    { key: 'clientSecret', label: 'Client Secret (opcional)', placeholder: '...', hint: 'Developer Portal → OAuth2. Solo para OAuth2 flows.' },
  ],
  teams: [
    { key: 'clientSecret', label: 'Client Secret (Azure)', placeholder: '...',  hint: 'App Registrations → Certificates & Secrets → New client secret.', required: true },
    { key: 'appPassword',  label: 'App Password (Bot Framework)', placeholder: '...', hint: 'Azure Bot Service → Configuration → Microsoft App Password.', required: true },
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
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !agentId.trim()) {
      setError('Nombre y Agent ID son obligatorios.');
      return;
    }

    // Validar campos requeridos de secrets
    const requiredMissing = SECRET_FIELDS[type]
      .filter(f => f.required)
      .filter(f => !(secrets[f.key] ?? '').trim())
      .map(f => f.label);
    if (requiredMissing.length > 0) {
      setError(`Campos obligatorios faltantes: ${requiredMissing.join(', ')}`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const nonEmptySecrets = Object.fromEntries(
        Object.entries(secrets).filter(([, v]) => v.trim() !== '')
      );
      const payload: CreateChannelPayload = {
        type,
        name:    name.trim(),
        agentId: agentId.trim(),
        secrets: Object.keys(nonEmptySecrets).length > 0 ? nonEmptySecrets : undefined,
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
                title={ct.hint}
              >
                <ChannelTypeIcon type={ct.value} size={20} />
                <span>{ct.label}</span>
              </button>
            ))}
          </div>
          {/* Hint del tipo seleccionado */}
          <p className="create-panel__type-hint">
            {CHANNEL_TYPES.find(ct => ct.value === type)?.hint}
          </p>
        </fieldset>

        {/* Nombre */}
        <label className="create-panel__field">
          <span className="create-panel__label">Nombre del canal <span aria-hidden>*</span></span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ej: Soporte WhatsApp LATAM"
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
                {f.hint && <span className="create-panel__field-hint">{f.hint}</span>}
              </label>
            ))}
          </fieldset>
        )}

        {/* WhatsApp Baileys — aviso sin secrets */}
        {type === 'whatsapp' && (
          <div className="create-panel__info-note" role="note">
            <strong>¿Usas Baileys (QR)?</strong> Deja los campos de credenciales vacíos.
            Después de crear el canal, usa el botón «Vincular WhatsApp» para escanear el QR.
          </div>
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
            aria-busy={busy}
          >
            {busy ? 'Creando…' : 'Crear canal'}
          </button>
        </div>
      </form>
    </div>
  );
}
