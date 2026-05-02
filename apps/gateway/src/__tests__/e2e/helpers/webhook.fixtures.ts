/**
 * F3a-IV — Webhook E2E Fixtures
 */

export const WEBHOOK_CHANNEL_CONFIG_ID = 'webhook-cfg-e2e-001'
export const WEBHOOK_AGENT_ID          = 'agent-e2e-webhook-001'

export const WEBHOOK_ALLOWED_URLS = [
  'https://allowed.internal.example.com/callback',
  'https://another-allowed.internal.example.com',
]

export const WEBHOOK_BLOCKED_URLS = [
  'https://evil.external.attacker.com/exfil',
  'http://192.168.1.1/admin',
  'http://localhost:3000/internal',
  'http://10.0.0.1/secret',
  'http://169.254.169.254/latest/meta-data/', // AWS IMDS
]

export function buildWebhookPayload(
  overrides: Partial<{
    sessionId:   string
    text:        string
    callbackUrl: string
  }> = {},
) {
  return {
    sessionId:   'session-webhook-e2e-001',
    text:        'Hola webhook E2E',
    callbackUrl: WEBHOOK_ALLOWED_URLS[0],
    ...overrides,
  }
}
