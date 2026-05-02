/**
 * F3a-IV — Slack E2E Fixtures
 */

import crypto from 'node:crypto'

export const SLACK_CHANNEL_CONFIG_ID   = 'slack-cfg-e2e-001'
export const SLACK_SIGNING_SECRET      = 'test-slack-signing-secret-32bytes!!'
export const SLACK_BOT_TOKEN           = 'xoxb-test-bot-token'
export const SLACK_AGENT_ID            = 'agent-e2e-slack-001'
export const SLACK_TEAM_ID             = 'T-slack-e2e-001'

export function buildSlackMessageEvent(
  text: string,
  userId = 'U-slack-001',
  channelId = 'C-slack-001',
) {
  return {
    type:     'event_callback',
    team_id:  SLACK_TEAM_ID,
    event_id: `evt-${crypto.randomUUID()}`,
    event_time: Math.floor(Date.now() / 1000),
    event: {
      type:    'message',
      text,
      user:    userId,
      channel: channelId,
      ts:      `${Date.now()}.000001`,
    },
  }
}

export function computeSlackSignature(
  secret:    string,
  timestamp: string,
  rawBody:   string,
): string {
  const sigBase = `v0:${timestamp}:${rawBody}`
  const hmac    = crypto.createHmac('sha256', secret)
  hmac.update(sigBase)
  return `v0=${hmac.digest('hex')}`
}

export function slackSignedHeaders(
  rawBody: string,
  secret = SLACK_SIGNING_SECRET,
): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000))
  return {
    'content-type':                'application/json',
    'x-slack-request-timestamp':   timestamp,
    'x-slack-signature':           computeSlackSignature(secret, timestamp, rawBody),
  }
}
