/**
 * ChannelsPage.tsx
 * Página principal de gestión de canales.
 *
 * Layout: sidebar lista (izquierda) + panel detalle/creación (derecha).
 * Importable en App.tsx como ruta /channels.
 */
import React, { useState } from 'react';
import { useChannels }        from './useChannels';
import { ChannelCard }        from './components/ChannelCard';
import { ChannelDetail }      from './components/ChannelDetail';
import { CreateChannelPanel } from './components/CreateChannelPanel';
import type { CreateChannelPayload } from './types';

const GATEWAY_URL =
  (import.meta as { env: Record<string, string> }).env.VITE_GATEWAY_URL ??
  (typeof window !== 'undefined' ? window.location.origin : '');

export default function ChannelsPage() {
  const {
    channels,
    loading,
    error,
    selectedId,
    setSelectedId,
    selected,
    createChannel,
    activateChannel,
    deactivateChannel,
    deleteChannel,
    addBinding,
    removeBinding,
  } = useChannels();

  const [showCreate, setShowCreate] = useState(false);
  const [createErr,  setCreateErr]  = useState<string | null>(null);

  async function handleCreate(payload: CreateChannelPayload) {
    setCreateErr(null);
    try {
      await createChannel(payload);
      setShowCreate(false);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Error al crear canal');
      throw e; // para que el panel muestre el error inline
    }
  }

  return (
    <div className="channels-page">
      {/* ── Sidebar lista ─────────────────────────────────────── */}
      <aside className="channels-page__sidebar">
        <div className="channels-page__sidebar-header">
          <h1 className="channels-page__title">Canales</h1>
          <button
            className="channels-page__new-btn"
            onClick={() => { setShowCreate(true); setSelectedId(null); }}
            aria-label="Nuevo canal"
          >
            + Nuevo
          </button>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="channels-page__skeleton">
            {[1, 2, 3].map(i => (
              <div key={i} className="channels-page__skeleton-card" />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="channels-page__error">
            <p>{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && channels.length === 0 && (
          <div className="channels-page__empty">
            <p>No hay canales configurados.</p>
            <button
              className="channels-page__empty-cta"
              onClick={() => setShowCreate(true)}
            >
              Crear primer canal
            </button>
          </div>
        )}

        {/* Lista */}
        {!loading && channels.length > 0 && (
          <ul className="channels-page__list" role="list">
            {channels.map(ch => (
              <li key={ch.id}>
                <ChannelCard
                  channel={ch}
                  isSelected={selectedId === ch.id}
                  onSelect={id => { setSelectedId(id); setShowCreate(false); }}
                  onActivate={activateChannel}
                  onDeactivate={deactivateChannel}
                  onDelete={deleteChannel}
                />
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* ── Panel principal ───────────────────────────────────── */}
      <main className="channels-page__main">
        {showCreate && (
          <CreateChannelPanel
            onClose={() => setShowCreate(false)}
            onCreate={handleCreate}
          />
        )}

        {!showCreate && selected && (
          <ChannelDetail
            channel={selected}
            onActivate={activateChannel}
            onDeactivate={deactivateChannel}
            onAddBinding={addBinding}
            onRemoveBinding={removeBinding}
            gatewayUrl={GATEWAY_URL}
          />
        )}

        {!showCreate && !selected && (
          <div className="channels-page__placeholder">
            <p>Selecciona un canal o crea uno nuevo.</p>
          </div>
        )}

        {createErr && (
          <p className="channels-page__create-err">{createErr}</p>
        )}
      </main>
    </div>
  );
}
