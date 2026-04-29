/**
 * features/channels/useChannels.ts
 * Hook de estado para el feature de canales.
 *
 * Expone:
 *   channels     — lista completa cargada desde el gateway
 *   loading      — true durante fetch inicial o reload
 *   error        — mensaje de error o null
 *   selectedId   — ID del canal seleccionado en la lista
 *   setSelectedId
 *   reload()     — refetch manual
 *   createChannel(payload)
 *   activateChannel(id)
 *   deactivateChannel(id)
 *   deleteChannel(id)
 *   addBinding(channelId, payload)
 *   removeBinding(channelId, bindingId)
 */

import { useState, useEffect, useCallback } from 'react';
import * as gwApi from '../../lib/gateway-api';
import type { ChannelConfig, CreateChannelPayload, AddBindingPayload } from './types';

export function useChannels(filters?: { agentId?: string; type?: string; isActive?: boolean }) {
  const [channels,    setChannels]    = useState<ChannelConfig[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);

  // Stringify filters para comparar estabilidad en dep array
  const filtersKey = JSON.stringify(filters ?? {});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await gwApi.listChannels(filters);
      setChannels(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar canales');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  useEffect(() => { void load(); }, [load]);

  // ── Acciones ──

  const createChannel = useCallback(async (payload: CreateChannelPayload): Promise<ChannelConfig> => {
    const res = await gwApi.createChannel(payload);
    const newChannel = res.channel;
    setChannels(prev => [newChannel, ...prev]);
    setSelectedId(newChannel.id);
    return newChannel;
  }, []);

  const activateChannel = useCallback(async (id: string): Promise<void> => {
    await gwApi.activateChannel(id);
    setChannels(prev =>
      prev.map(c => (c.id === id ? { ...c, isActive: true } : c)),
    );
  }, []);

  const deactivateChannel = useCallback(async (id: string): Promise<void> => {
    await gwApi.deactivateChannel(id);
    setChannels(prev =>
      prev.map(c => (c.id === id ? { ...c, isActive: false } : c)),
    );
  }, []);

  const deleteChannel = useCallback(async (id: string): Promise<void> => {
    await gwApi.deleteChannel(id);
    setChannels(prev => prev.filter(c => c.id !== id));
    setSelectedId(prev => (prev === id ? null : prev));
  }, []);

  const addBinding = useCallback(
    async (channelId: string, payload: AddBindingPayload): Promise<void> => {
      const res = await gwApi.addBinding(channelId, payload);
      const newBinding = res.data;
      setChannels(prev =>
        prev.map(c =>
          c.id === channelId
            ? { ...c, bindings: [...(c.bindings ?? []), newBinding] }
            : c,
        ),
      );
    },
    [],
  );

  const removeBinding = useCallback(
    async (channelId: string, bindingId: string): Promise<void> => {
      await gwApi.removeBinding(channelId, bindingId);
      setChannels(prev =>
        prev.map(c =>
          c.id === channelId
            ? { ...c, bindings: (c.bindings ?? []).filter(b => b.id !== bindingId) }
            : c,
        ),
      );
    },
    [],
  );

  const selected = channels.find(c => c.id === selectedId) ?? null;

  return {
    channels,
    loading,
    error,
    selectedId,
    setSelectedId,
    selected,
    reload: load,
    createChannel,
    activateChannel,
    deactivateChannel,
    deleteChannel,
    addBinding,
    removeBinding,
  };
}
