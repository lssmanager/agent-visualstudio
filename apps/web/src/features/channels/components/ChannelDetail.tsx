/**
 * ChannelDetail.tsx
 * Panel de detalle del canal seleccionado.
 * Tabs: General | Configuración | Bindings
 *
 * F3a-36: Integra ChannelSettings como pestaña "Configuración".
 */
import React, { useState } from 'react';
import type {
  ChannelConfig,
  AddBindingPayload,
  PatchChannelPayload,
  ChannelTestResult,
} from '../types';
import { ChannelTypeIcon } from './ChannelTypeIcon';
import { EmbedSnippet }    from './EmbedSnippet';
import { ChannelSettings } from './ChannelSettings';

type ActiveTab = 'overview' | 'settings' | 'bindings';

interface Props {
  channel:          ChannelConfig;
  onActivate:       (id: string) => Promise<void>;
  onDeactivate:     (id: string) => Promise<void>;
  onAddBinding:     (channelId: string, payload: AddBindingPayload) => Promise<void>;
  onRemoveBinding:  (channelId: string, bindingId: string) => Promise<void>;
  onPatchChannel:   (id: string, payload: PatchChannelPayload) => Promise<void>;
  onTestChannel:    (id: string) => Promise<ChannelTestResult>;
  gatewayUrl?:      string;
}

export function ChannelDetail({
  channel,
  onActivate,
  onDeactivate,
  onAddBinding,
  onRemoveBinding,
  onPatchChannel,
  onTestChannel,
  gatewayUrl = '',
}: Props) {
  const [busy,       setBusy]       = useState(false);
  const [actionErr,  setActionErr]  = useState<string | null>(null);
  const [activeTab,  setActiveTab]  = useState<ActiveTab>('overview');

  // Reset tab cuando cambia el canal
  React.useEffect(() => {
    setActiveTab('overview');
    setActionErr(null);
  }, [channel.id]);

  // Form agregar binding
  const [newAgentId,    setNewAgentId]    = useState('');
  const [newScopeLevel, setNewScopeLevel] = useState('agent');
  const [bindErr,       setBindErr]       = useState<string | null>(null);
  const [bindBusy,      setBindBusy]      = useState(false);

  async function toggleActive() {
    setBusy(true);
    setActionErr(null);
    try {
      if (channel.isActive) await onDeactivate(channel.id);
      else                   await onActivate(channel.id);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddBinding(e: React.FormEvent) {
    e.preventDefault();
    if (!newAgentId.trim()) return;
    setBindBusy(true);
    setBindErr(null);
    try {
      await onAddBinding(channel.id, {
        agentId:    newAgentId.trim(),
        scopeLevel: newScopeLevel,
        scopeId:    newAgentId.trim(),
      });
      setNewAgentId('');
    } catch (e) {
      setBindErr(e instanceof Error ? e.message : 'Error al agregar binding');
    } finally {
      setBindBusy(false);
    }
  }

  return (
    <div className="channel-detail">
      {/* Header */}
      <div className="channel-detail__header">
        <span className="channel-detail__icon">
          <ChannelTypeIcon type={channel.type} size={22} />
        </span>
        <div className="channel-detail__title-group">
          <h2 className="channel-detail__title">{channel.name}</h2>
          <span className={`channel-badge channel-badge--${channel.isActive ? 'active' : 'inactive'}`}>
            {channel.isActive ? 'Activo' : 'Inactivo'}
          </span>
        </div>
        <button
          className={`channel-detail__toggle-btn ${
            channel.isActive ? 'channel-detail__toggle-btn--off' : 'channel-detail__toggle-btn--on'
          }`}
          onClick={() => void toggleActive()}
          disabled={busy}
        >
          {busy ? '…' : channel.isActive ? 'Desactivar' : 'Activar'}
        </button>
      </div>

      {actionErr && <p className="channel-detail__error">{actionErr}</p>}

      {/* Tab navigation — F3a-36 */}
      <nav className="channel-detail__tabs" role="tablist" aria-label="Secciones del canal">
        {(['overview', 'settings', 'bindings'] as ActiveTab[]).map(tab => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`channel-detail__tab ${
              activeTab === tab ? 'channel-detail__tab--active' : ''
            }`}
          >
            {tab === 'overview'  ? 'General'       : ''}
            {tab === 'settings'  ? 'Configuración' : ''}
            {tab === 'bindings'  ? 'Bindings'      : ''}
          </button>
        ))}
      </nav>

      {/* ── Panel: General ─────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="channel-detail__panel" role="tabpanel">
          {/* Meta */}
          <div className="channel-detail__meta">
            <div className="channel-detail__meta-row">
              <span className="channel-detail__meta-label">Tipo</span>
              <span className="channel-detail__meta-value">{channel.type}</span>
            </div>
            <div className="channel-detail__meta-row">
              <span className="channel-detail__meta-label">ID</span>
              <code className="channel-detail__meta-code">{channel.id}</code>
            </div>
            <div className="channel-detail__meta-row">
              <span className="channel-detail__meta-label">Secrets</span>
              <span className="channel-detail__meta-value">
                {channel.hasSecrets ? 'Configurados •••' : 'Ninguno'}
              </span>
            </div>
            <div className="channel-detail__meta-row">
              <span className="channel-detail__meta-label">Creado</span>
              <span className="channel-detail__meta-value">
                {new Date(channel.createdAt).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Embed snippet para webchat activo */}
          {channel.type === 'webchat' && channel.isActive && (
            <EmbedSnippet
              channelId={channel.id}
              gatewayUrl={gatewayUrl}
              title={channel.name}
            />
          )}
        </div>
      )}

      {/* ── Panel: Configuración ── F3a-36 ─────────────────── */}
      {activeTab === 'settings' && (
        <div className="channel-detail__panel" role="tabpanel">
          <ChannelSettings
            channel={channel}
            gatewayUrl={gatewayUrl}
            onSave={onPatchChannel}
            onTest={onTestChannel}
          />
        </div>
      )}

      {/* ── Panel: Bindings ────────────────────────────────── */}
      {activeTab === 'bindings' && (
        <div className="channel-detail__panel" role="tabpanel">
          <section className="channel-detail__section">
            <h3 className="channel-detail__section-title">Bindings</h3>

            {(channel.bindings ?? []).length === 0 ? (
              <p className="channel-detail__empty">Sin bindings configurados.</p>
            ) : (
              <ul className="channel-detail__binding-list">
                {(channel.bindings ?? []).map(b => (
                  <li key={b.id} className="channel-detail__binding-item">
                    <div className="channel-detail__binding-info">
                      <span className="channel-detail__binding-agent">
                        {b.agent?.name ?? b.agentId}
                      </span>
                      <span className="channel-detail__binding-scope">{b.scopeLevel}</span>
                      {b.isDefault && (
                        <span className="channel-detail__binding-default">default</span>
                      )}
                    </div>
                    <button
                      className="channel-detail__binding-remove"
                      onClick={() => void onRemoveBinding(channel.id, b.id)}
                      aria-label="Eliminar binding"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Agregar binding */}
            <form
              onSubmit={e => void handleAddBinding(e)}
              className="channel-detail__bind-form"
            >
              <h4 className="channel-detail__bind-form-title">Agregar binding</h4>
              <div className="channel-detail__bind-row">
                <input
                  type="text"
                  placeholder="Agent ID"
                  value={newAgentId}
                  onChange={e => setNewAgentId(e.target.value)}
                  className="channel-detail__bind-input"
                  aria-label="Agent ID"
                />
                <select
                  value={newScopeLevel}
                  onChange={e => setNewScopeLevel(e.target.value)}
                  className="channel-detail__bind-select"
                  aria-label="Scope level"
                >
                  <option value="agent">agent</option>
                  <option value="workspace">workspace</option>
                  <option value="org">org</option>
                </select>
                <button
                  type="submit"
                  className="channel-detail__bind-submit"
                  disabled={bindBusy || !newAgentId.trim()}
                >
                  {bindBusy ? '…' : 'Agregar'}
                </button>
              </div>
              {bindErr && <p className="channel-detail__error">{bindErr}</p>}
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
