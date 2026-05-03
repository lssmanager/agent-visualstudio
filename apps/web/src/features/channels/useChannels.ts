/**
 * useChannels.ts — [F5-05]
 *
 * Hook de gestión de canales.
 * Endpoints corregidos para coincidir con el plan F3a/F5:
 *   - PATCH  /api/channels/:id
 *   - POST   /api/channels/:id/test
 *   - GET    /gateway/whatsapp/:id/qr          ← SSE del QR (NO /api/channels/:id/whatsapp/qr)
 *   - POST   /gateway/whatsapp/:id/logout       ← logout de sesión Baileys
 */
import { useState, useEffect, useCallback } from 'react'
import * as gwApi from '../../lib/gateway-api'
import type {
  ChannelConfig,
  CreateChannelPayload,
  AddBindingPayload,
  PatchChannelPayload,
  ChannelTestResult,
  ChannelDetailResponse,
} from './types'

export function useChannels(filters?: { agentId?: string; type?: string; isActive?: boolean }) {
  const [channels, setChannels] = useState<ChannelConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtersKey = JSON.stringify(filters ?? {})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await gwApi.listChannels(filters)
      setChannels(res.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar canales')
    } finally {
      setLoading(false)
    }
  }, [filtersKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load() }, [load])

  const createChannel = useCallback(async (payload: CreateChannelPayload): Promise<ChannelConfig> => {
    const res = await gwApi.createChannel(payload)
    const newChannel = res.channel
    setChannels(prev => [newChannel, ...prev])
    setSelectedId(newChannel.id)
    return newChannel
  }, [])

  const activateChannel = useCallback(async (id: string): Promise<void> => {
    await gwApi.activateChannel(id)
    setChannels(prev => prev.map(c => (c.id === id ? { ...c, isActive: true } : c)))
  }, [])

  const deactivateChannel = useCallback(async (id: string): Promise<void> => {
    await gwApi.deactivateChannel(id)
    setChannels(prev => prev.map(c => (c.id === id ? { ...c, isActive: false } : c)))
  }, [])

  const deleteChannel = useCallback(async (id: string): Promise<void> => {
    await gwApi.deleteChannel(id)
    setChannels(prev => prev.filter(c => c.id !== id))
    setSelectedId(prev => (prev === id ? null : prev))
  }, [])

  const addBinding = useCallback(async (channelId: string, payload: AddBindingPayload): Promise<void> => {
    const res = await gwApi.addBinding(channelId, payload)
    const newBinding = res.data
    setChannels(prev =>
      prev.map(c => c.id === channelId ? { ...c, bindings: [...(c.bindings ?? []), newBinding] } : c),
    )
  }, [])

  const removeBinding = useCallback(async (channelId: string, bindingId: string): Promise<void> => {
    await gwApi.removeBinding(channelId, bindingId)
    setChannels(prev =>
      prev.map(c => c.id === channelId ? { ...c, bindings: (c.bindings ?? []).filter(b => b.id !== bindingId) } : c),
    )
  }, [])

  const patchChannel = useCallback(async (id: string, payload: PatchChannelPayload): Promise<void> => {
    const res = await fetch(`/api/channels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Error al actualizar canal' }))
      throw new Error((err as { message?: string }).message ?? 'Error al actualizar canal')
    }
    const updated: ChannelDetailResponse = await res.json()
    setChannels(prev => prev.map(ch => (ch.id === id ? updated.data : ch)))
    if (selectedId === id) {
      setSelectedId(null)
      requestAnimationFrame(() => setSelectedId(id))
    }
  }, [selectedId])

  const testChannel = useCallback(async (id: string): Promise<ChannelTestResult> => {
    const start = Date.now()
    try {
      const res = await fetch(`/api/channels/${id}/test`, { method: 'POST' })
      const latency = Date.now() - start
      const body = await res.json().catch(() => ({ ok: res.ok, message: '' })) as { ok?: boolean; message?: string }
      return {
        ok: body.ok ?? res.ok,
        latency,
        message: body.message ?? (res.ok ? 'OK' : `HTTP ${res.status}`),
      }
    } catch (err) {
      return {
        ok: false,
        latency: Date.now() - start,
        message: err instanceof Error ? err.message : 'Error de red',
      }
    }
  }, [])

  /**
   * Solicita un nuevo QR para una sesión Baileys.
   * Endpoint corregido: POST /gateway/whatsapp/:id/qr
   * (el SSE del QR se consume en WhatsAppQrModal via /gateway/whatsapp/:id/qr-stream)
   */
  const requestWhatsAppQr = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/gateway/whatsapp/${id}/qr`, { method: 'POST' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Error al generar QR' })) as { message?: string }
      throw new Error(err.message ?? 'Error al generar QR')
    }
  }, [])

  /**
   * Cierra la sesión Baileys del canal WhatsApp.
   * Endpoint: POST /gateway/whatsapp/:id/logout
   */
  const logoutWhatsApp = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/gateway/whatsapp/${id}/logout`, { method: 'POST' })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Error al cerrar sesión' })) as { message?: string }
      throw new Error(err.message ?? 'Error al cerrar sesión')
    }
    setChannels(prev => prev.map(c => c.id === id ? { ...c, isActive: false } : c))
  }, [])

  const selected = channels.find(c => c.id === selectedId) ?? null

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
    patchChannel,
    testChannel,
    requestWhatsAppQr,
    logoutWhatsApp,
  }
}
