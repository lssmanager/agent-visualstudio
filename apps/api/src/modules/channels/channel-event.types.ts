export type ChannelEventType =
  | 'channel.provisioned'
  | 'channel.status_changed'
  | 'channel.binding_added'
  | 'channel.binding_removed'
  | 'channel.session_started'
  | 'channel.session_closed'
  | 'channel.error'

export interface ChannelEvent<T = unknown> {
  event:     ChannelEventType
  channelId: string
  timestamp: string
  payload:   T
}

export interface StatusChangedPayload {
  previousStatus: string
  currentStatus:  string
  isActive:       boolean
  errorMessage?:  string | null
}

export interface BindingAddedPayload {
  bindingId:  string
  agentId:    string
  scopeLevel: string
  isDefault:  boolean
}

export interface BindingRemovedPayload {
  bindingId: string
  agentId:   string
}

export interface SessionStartedPayload {
  sessionId:      string
  externalUserId: string
  agentId:        string
}

export interface SessionClosedPayload {
  sessionId:      string
  externalUserId: string
  reason:         'completed' | 'timeout' | 'error' | 'manual'
}

export interface ChannelErrorPayload {
  operation:      string
  errorMessage:   string
  previousStatus: string
}

export function makeChannelEvent<T>(
  event:     ChannelEventType,
  channelId: string,
  payload:   T,
): ChannelEvent<T> {
  return { event, channelId, timestamp: new Date().toISOString(), payload }
}
