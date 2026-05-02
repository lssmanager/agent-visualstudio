/**
 * ChannelStatusCard.tsx — [F3a-37]
 *
 * Tarjeta de estado en tiempo real de un canal.
 * Usa useChannelStatus() (SSE con fallback a polling).
 *
 * Muestra:
 *   - Indicador visual (verde/rojo/amarillo/gris)
 *   - Latencia, mensajes/min
 *   - Último error colapsable
 *   - SSE badge con estado
 *   - Para WhatsApp authMode='qr': botón que abre WhatsAppQrModal
 */

import React, { useState } from 'react';
import type { ChannelConfig } from '../types';
import { useChannelStatus }  from '../hooks/useChannelStatus';
import { WhatsAppQrModal }   from './WhatsAppQrModal';

interface ChannelStatusCardProps {
  channel:          ChannelConfig;
  onTest:           (id: string) => Promise<{ ok: boolean; latency: number; message: string }>;
  onRequestNewQr?:  (id: string) => Promise<void>;
}

type StatusIndicatorKind = 'connected' | 'degraded' | 'disconnected' | 'unknown';

function getIndicatorKind(
  sseState: string,
  connected: boolean | undefined,
  latencyMs: number | null | undefined,
): StatusIndicatorKind {
  if (sseState === 'connecting' || connected === undefined) return 'unknown';
  if (!connected) return 'disconnected';
  if (latencyMs !== null && latencyMs !== undefined && latencyMs > 1000) return 'degraded';
  return 'connected';
}

const INDICATOR_LABELS: Record<StatusIndicatorKind, string> = {
  connected:    'Conectado',
  degraded:     'Degradado',
  disconnected: 'Sin conexión',
  unknown:      'Verificando…',
};

const INDICATOR_ARIA: Record<StatusIndicatorKind, string> = {
  connected:    'El canal está conectado y operativo',
  degraded:     'El canal está conectado pero con alta latencia',
  disconnected: 'El canal no tiene conexión activa con el proveedor',
  unknown:      'Verificando el estado del canal',
};

function StatusDot({ kind }: { kind: StatusIndicatorKind }) {
  return <span className={`status-dot status-dot--${kind}`} aria-hidden="true" />;
}

function formatLatency(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '—';
  const diffSecs = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSecs < 60)   return `hace ${diffSecs}s`;
  if (diffSecs < 3600) return `hace ${Math.floor(diffSecs / 60)}min`;
  return `hace ${Math.floor(diffSecs / 3600)}h`;
}

export function ChannelStatusCard({
  channel,
  onTest,
  onRequestNewQr,
}: ChannelStatusCardProps) {
  const [showError,   setShowError]   = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const liveStatus = useChannelStatus(channel.id, {
    pollFallback: true,
    onPoll:       onTest,
  });

  const { sseState, sseError, channelStatus, reconnectIn, attemptCount } = liveStatus;

  const indicator = getIndicatorKind(
    sseState,
    channelStatus?.connected,
    channelStatus?.latencyMs,
  );

  const isWhatsAppQr =
    channel.type === 'whatsapp' &&
    channel.config?.['authMode'] === 'qr';

  const qrBtnVisible =
    isWhatsAppQr && (
      !channelStatus?.sessionState ||
      channelStatus.sessionState.status !== 'connected'
    );

  async function handleRequestNewQr() {
    if (onRequestNewQr) await onRequestNewQr(channel.id);
    setShowQrModal(true);
  }

  return (
    <>
      <div
        className="channel-status-card"
        aria-label={`Estado del canal: ${INDICATOR_ARIA[indicator]}`}
      >
        {/* Estado principal */}
        <div className="channel-status-card__row">
          <StatusDot kind={indicator} />
          <span className={`channel-status-card__label channel-status-card__label--${indicator}`}>
            {INDICATOR_LABELS[indicator]}
          </span>

          {sseState === 'reconnecting' && reconnectIn !== null && (
            <span className="channel-status-card__reconnect">
              Reconectando en {reconnectIn}s (intento {attemptCount})
            </span>
          )}

          {sseState === 'error' && sseError && (
            <span className="channel-status-card__sse-error">{sseError}</span>
          )}

          {channelStatus && (
            <span className="channel-status-card__updated">
              {formatRelativeTime(channelStatus.updatedAt)}
            </span>
          )}
        </div>

        {/* Métricas */}
        {channelStatus && (
          <div className="channel-status-card__metrics">
            <div className="channel-status-card__metric">
              <span className="channel-status-card__metric-label">Latencia</span>
              <span className={[
                'channel-status-card__metric-value',
                channelStatus.latencyMs !== null && channelStatus.latencyMs > 1000
                  ? 'channel-status-card__metric-value--warn'
                  : '',
              ].filter(Boolean).join(' ')}>
                {formatLatency(channelStatus.latencyMs)}
              </span>
            </div>
            <div className="channel-status-card__metric">
              <span className="channel-status-card__metric-label">Msgs/min</span>
              <span className="channel-status-card__metric-value channel-status-card__metric-value--num">
                {channelStatus.messagesPerMin}
              </span>
            </div>
          </div>
        )}

        {/* WhatsApp QR button */}
        {qrBtnVisible && (
          <div className="channel-status-card__qr-row">
            <button
              className="channel-status-card__qr-btn"
              onClick={() => setShowQrModal(true)}
              type="button"
            >
              📱{' '}
              {channelStatus?.sessionState?.status === 'disconnected'
                ? 'Reconectar WhatsApp'
                : 'Vincular WhatsApp'}
            </button>
            <p className="channel-status-card__qr-hint">
              Escanea el QR con tu teléfono para activar la sesión.
            </p>
          </div>
        )}

        {/* WhatsApp sesión activa */}
        {isWhatsAppQr && channelStatus?.sessionState?.status === 'connected' && (
          <div className="channel-status-card__wa-connected">
            <span className="channel-status-card__wa-phone">
              📱 {channelStatus.sessionState.phone ?? 'Sesión activa'}
            </span>
            <button
              className="channel-status-card__qr-btn channel-status-card__qr-btn--ghost"
              onClick={() => setShowQrModal(true)}
              type="button"
            >
              Ver sesión
            </button>
          </div>
        )}

        {/* Último error */}
        {channelStatus?.lastError && (
          <div className="channel-status-card__error-section">
            <button
              className="channel-status-card__error-toggle"
              onClick={() => setShowError(prev => !prev)}
              aria-expanded={showError}
              type="button"
            >
              {showError ? '▾' : '▸'} Último error
              <span className="channel-status-card__error-time">
                {formatRelativeTime(channelStatus.lastErrorAt)}
              </span>
            </button>
            {showError && (
              <p className="channel-status-card__error-text" role="alert">
                {channelStatus.lastError}
              </p>
            )}
          </div>
        )}

        {/* SSE badge */}
        <div className="channel-status-card__sse-badge-row">
          <span className={`channel-status-card__sse-badge channel-status-card__sse-badge--${sseState}`}>
            SSE: {sseState === 'connected' ? 'en vivo' : sseState}
          </span>
        </div>
      </div>

      {/* QR Modal */}
      {showQrModal && isWhatsAppQr && channelStatus?.sessionState && (
        <WhatsAppQrModal
          sessionState={channelStatus.sessionState}
          channelName={channel.name}
          onClose={() => setShowQrModal(false)}
          onRequestNewQr={handleRequestNewQr}
        />
      )}
    </>
  );
}
