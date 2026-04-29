/**
 * ChannelCard.tsx
 * Card de canal en la lista. Muestra tipo, nombre, badge activo/inactivo,
 * número de bindings y acciones rápidas.
 */
import React, { useState } from 'react';
import type { ChannelConfig } from '../types';
import { ChannelTypeIcon } from './ChannelTypeIcon';

interface Props {
  channel:       ChannelConfig;
  isSelected:    boolean;
  onSelect:      (id: string) => void;
  onActivate:    (id: string) => Promise<void>;
  onDeactivate:  (id: string) => Promise<void>;
  onDelete:      (id: string) => Promise<void>;
}

const TYPE_LABEL: Record<string, string> = {
  webchat:  'WebChat',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  slack:    'Slack',
  discord:  'Discord',
  webhook:  'Webhook',
};

export function ChannelCard({ channel, isSelected, onSelect, onActivate, onDeactivate, onDelete }: Props) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }

  const bindingsCount = channel.bindings?.length ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onClick={() => onSelect(channel.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(channel.id); }}
      className={[
        'channel-card',
        isSelected ? 'channel-card--selected' : '',
      ].join(' ')}
    >
      <div className="channel-card__header">
        <span className="channel-card__icon">
          <ChannelTypeIcon type={channel.type} size={18} />
        </span>
        <span className="channel-card__type-label">{TYPE_LABEL[channel.type] ?? channel.type}</span>
        <span className={`channel-card__badge channel-card__badge--${channel.isActive ? 'active' : 'inactive'}`}>
          {channel.isActive ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      <p className="channel-card__name">{channel.name}</p>

      <div className="channel-card__meta">
        <span>{bindingsCount} binding{bindingsCount !== 1 ? 's' : ''}</span>
        <span className="channel-card__meta-sep">·</span>
        <span>{new Date(channel.createdAt).toLocaleDateString()}</span>
      </div>

      {error && <p className="channel-card__error">{error}</p>}

      <div className="channel-card__actions" onClick={e => e.stopPropagation()}>
        {channel.isActive ? (
          <button
            className="channel-card__btn channel-card__btn--deactivate"
            disabled={busy}
            onClick={() => handle(() => onDeactivate(channel.id))}
          >
            {busy ? '…' : 'Desactivar'}
          </button>
        ) : (
          <button
            className="channel-card__btn channel-card__btn--activate"
            disabled={busy}
            onClick={() => handle(() => onActivate(channel.id))}
          >
            {busy ? '…' : 'Activar'}
          </button>
        )}
        <button
          className="channel-card__btn channel-card__btn--delete"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`¿Eliminar canal "${channel.name}"?`)) {
              void handle(() => onDelete(channel.id));
            }
          }}
          aria-label="Eliminar canal"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
