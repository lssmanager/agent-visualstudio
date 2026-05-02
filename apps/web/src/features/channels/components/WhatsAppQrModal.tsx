/**
 * WhatsAppQrModal.tsx — [F3a-37]
 *
 * Modal de vinculación WhatsApp por QR.
 * Solo se monta cuando channel.config.authMode === 'qr'.
 *
 * Ciclo de vida:
 *   waiting_qr  → spinner
 *   qr_ready    → imagen QR + countdown de expiración
 *   connected   → confirmación + cierre automático (2.5s)
 *   expired     → botón "Pedir nuevo QR"
 *   disconnected → botón "Reconectar"
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { WhatsAppSessionState } from '../types';

interface WhatsAppQrModalProps {
  sessionState:   WhatsAppSessionState;
  channelName:    string;
  onClose:        () => void;
  onRequestNewQr: () => Promise<void>;
}

const QR_EXPIRE_WARN_SECS = 30;

function useQrCountdown(expiresAt: string | null) {
  const [secsLeft, setSecsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setSecsLeft(null);
      return;
    }
    const calc = () => {
      const diff = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecsLeft(diff);
      return diff;
    };
    if (calc() === 0) return;
    const timer = setInterval(() => {
      if (calc() === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return secsLeft;
}

export function WhatsAppQrModal({
  sessionState,
  channelName,
  onClose,
  onRequestNewQr,
}: WhatsAppQrModalProps) {
  const [requesting, setRequesting] = useState(false);
  const [reqErr,     setReqErr]     = useState<string | null>(null);
  const secsLeft   = useQrCountdown(sessionState.qrExpiresAt);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Auto-close on connected
  useEffect(() => {
    if (sessionState.status === 'connected') {
      const t = setTimeout(onClose, 2500);
      return () => clearTimeout(t);
    }
  }, [sessionState.status, onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    const first = overlayRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    first?.focus();
  }, []);

  const handleRequestNew = useCallback(async () => {
    setRequesting(true);
    setReqErr(null);
    try {
      await onRequestNewQr();
    } catch (err) {
      setReqErr(err instanceof Error ? err.message : 'Error al pedir nuevo QR');
    } finally {
      setRequesting(false);
    }
  }, [onRequestNewQr]);

  const isExpiring = secsLeft !== null && secsLeft <= QR_EXPIRE_WARN_SECS && secsLeft > 0;
  const isExpired  = sessionState.status === 'expired' || secsLeft === 0;

  return (
    <div
      className="qr-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Vincular WhatsApp — ${channelName}`}
      ref={overlayRef}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="qr-modal">

        {/* Header */}
        <div className="qr-modal__header">
          <div className="qr-modal__header-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>
          <div>
            <h2 className="qr-modal__title">Vincular WhatsApp</h2>
            <p className="qr-modal__subtitle">{channelName}</p>
          </div>
          <button className="qr-modal__close" onClick={onClose} aria-label="Cerrar modal">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="qr-modal__body">

          {sessionState.status === 'waiting_qr' && (
            <div className="qr-modal__state qr-modal__state--generating">
              <div className="qr-modal__spinner" aria-hidden="true" />
              <p className="qr-modal__state-text">Generando código QR…</p>
              <p className="qr-modal__state-hint">
                El servidor está conectando con WhatsApp. Esto puede tardar unos segundos.
              </p>
            </div>
          )}

          {sessionState.status === 'qr_ready' && sessionState.qrDataUrl && (
            <div className="qr-modal__state qr-modal__state--ready">
              <div className={[
                'qr-modal__qr-wrapper',
                isExpiring ? 'qr-modal__qr-wrapper--expiring' : '',
                isExpired  ? 'qr-modal__qr-wrapper--expired'  : '',
              ].filter(Boolean).join(' ')}>
                <img
                  src={sessionState.qrDataUrl}
                  alt="Código QR de WhatsApp — escanea con tu teléfono"
                  className="qr-modal__qr-image"
                  width={240}
                  height={240}
                />
                {(isExpiring || isExpired) && (
                  <div className="qr-modal__qr-overlay" aria-hidden="true">
                    <span className="qr-modal__qr-overlay-text">
                      {isExpired ? 'QR expirado' : `Expira en ${secsLeft}s`}
                    </span>
                  </div>
                )}
              </div>

              {secsLeft !== null && !isExpired && (
                <div
                  className="qr-modal__countdown-bar"
                  role="progressbar"
                  aria-valuenow={secsLeft}
                  aria-valuemin={0}
                  aria-valuemax={60}
                  aria-label={`QR expira en ${secsLeft} segundos`}
                >
                  <div
                    className={[
                      'qr-modal__countdown-fill',
                      isExpiring ? 'qr-modal__countdown-fill--warning' : '',
                    ].filter(Boolean).join(' ')}
                    style={{ width: `${Math.min(100, (secsLeft / 60) * 100)}%` }}
                  />
                </div>
              )}

              {!isExpired && (
                <p className="qr-modal__instructions">
                  Abre WhatsApp en tu teléfono →{' '}
                  <strong>Dispositivos vinculados</strong> →{' '}
                  <strong>Vincular un dispositivo</strong> → Escanea este código.
                </p>
              )}
            </div>
          )}

          {(isExpired || sessionState.status === 'expired') && (
            <div className="qr-modal__state qr-modal__state--expired">
              <div className="qr-modal__state-icon" aria-hidden="true">⚠️</div>
              <p className="qr-modal__state-text">El código QR ha expirado</p>
              <p className="qr-modal__state-hint">
                Los QR de WhatsApp expiran en 60 segundos. Solicita uno nuevo para continuar.
              </p>
              <button
                className="qr-modal__btn-primary"
                onClick={() => void handleRequestNew()}
                disabled={requesting}
                aria-busy={requesting}
              >
                {requesting ? 'Generando…' : '↻ Pedir nuevo QR'}
              </button>
              {reqErr && <p className="qr-modal__error" role="alert">{reqErr}</p>}
            </div>
          )}

          {sessionState.status === 'connected' && (
            <div className="qr-modal__state qr-modal__state--connected">
              <div className="qr-modal__success-icon" aria-hidden="true">✓</div>
              <p className="qr-modal__state-text">¡WhatsApp vinculado correctamente!</p>
              {sessionState.phone && (
                <p className="qr-modal__state-hint">
                  Número: <strong>{sessionState.phone}</strong>
                </p>
              )}
              <p className="qr-modal__state-hint qr-modal__state-hint--faint">
                Cerrando en 2 segundos…
              </p>
            </div>
          )}

          {sessionState.status === 'disconnected' && (
            <div className="qr-modal__state qr-modal__state--disconnected">
              <div className="qr-modal__state-icon" aria-hidden="true">⚡</div>
              <p className="qr-modal__state-text">Sesión desconectada</p>
              <p className="qr-modal__state-hint">
                La sesión de WhatsApp se ha desconectado. Puedes reconectarla generando un nuevo QR.
              </p>
              <button
                className="qr-modal__btn-primary"
                onClick={() => void handleRequestNew()}
                disabled={requesting}
                aria-busy={requesting}
              >
                {requesting ? 'Conectando…' : '⚡ Reconectar'}
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="qr-modal__footer">
          <p className="qr-modal__footer-hint">
            El dispositivo vinculado aparecerá en WhatsApp → Dispositivos vinculados.
            Para desvincular, ve allí y elimina el dispositivo.
          </p>
          <button className="qr-modal__btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
