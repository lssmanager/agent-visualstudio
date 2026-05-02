/**
 * F3a-IV — WebChat E2E Fixtures
 */

import crypto from 'node:crypto'

export const WEBCHAT_CHANNEL_CONFIG_ID = 'webchat-cfg-e2e-001'
export const WEBCHAT_AGENT_ID          = 'agent-e2e-webchat-001'

export interface WsMessage {
  type:       'message' | 'ack' | 'error' | 'reconnect'
  sessionId:  string
  messageId?: string
  text?:      string
  reply?:     string
  error?:     string
}

export function makeSessionId(suffix?: string): string {
  return `session-${crypto.randomUUID()}${suffix ? `-${suffix}` : ''}`
}

export function makeMessageId(suffix?: string): string {
  return `msg-${crypto.randomUUID()}${suffix ? `-${suffix}` : ''}`
}
