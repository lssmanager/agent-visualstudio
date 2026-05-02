/**
 * Tests for WebhookAdapter._isCallbackAllowed() — AUDIT-10 (#175)
 *
 * Verifica que la protección SSRF via WEBHOOK_CALLBACK_ALLOWLIST funciona:
 *   - fail-secure cuando la env no está definida
 *   - permite URLs cuyo origin está en la allowlist
 *   - rechaza URLs de origins no listados
 *   - rechaza URLs malformadas
 *   - comparación por origin (no por path completo)
 */

import { WebhookAdapter } from '../webhook.adapter'

// Acceso al método privado via casting para tests
type WebhookAdapterTestable = WebhookAdapter & {
  _isCallbackAllowed(url: string): boolean
}

function makeAdapter(): WebhookAdapterTestable {
  const a = new WebhookAdapter() as WebhookAdapterTestable
  // No llamamos initialize() — _isCallbackAllowed() no necesita channelConfigId
  return a
}

const ORIGINAL_ENV = process.env

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

afterEach(() => {
  process.env = ORIGINAL_ENV
})

describe('WebhookAdapter._isCallbackAllowed() — AUDIT-10 (#175)', () => {

  it('fail-secure: rechaza todo cuando WEBHOOK_CALLBACK_ALLOWLIST no está definida', () => {
    delete process.env.WEBHOOK_CALLBACK_ALLOWLIST
    const adapter = makeAdapter()
    expect(adapter._isCallbackAllowed('https://n8n.mycompany.com/webhook')).toBe(false)
  })

  it('fail-secure: rechaza todo cuando WEBHOOK_CALLBACK_ALLOWLIST es string vacío', () => {
    process.env.WEBHOOK_CALLBACK_ALLOWLIST = ''
    const adapter = makeAdapter()
    expect(adapter._isCallbackAllowed('https://n8n.mycompany.com/webhook')).toBe(false)
  })

  it('fail-secure: rechaza todo cuando WEBHOOK_CALLBACK_ALLOWLIST es solo espacios', () => {
    process.env.WEBHOOK_CALLBACK_ALLOWLIST = '   '
    const adapter = makeAdapter()
    expect(adapter._isCallbackAllowed('https://n8n.mycompany.com/webhook')).toBe(false)
  })

  it('permite URL cuyo origin está exactamente en la allowlist', () => {
    process.env.WEBHOOK_CALLBACK_ALLOWLIST = 'https://n8n.mycompany.com,https://hooks.zapier.com'
    const adapter = makeAdapter()
    expect(adapter._isCallbackAllowed('https://n8n.mycompany.com/webhook/abc')).toBe(true)
  })

  it('permite URL con path arbitrario si el origin coincide', () => {
    process.env.WEBHOOK_CALLBACK_ALLOWLIST = 'https://hooks.zapier.com'
    const adapter = makeAdapter()
    expect(adapter._isCallbackAllowed('https://hooks.zapier.com/hooks/catch/123/abc')).toBe(true)
  })

  it('rechaza URL de origin distinto aunque el path sea similar', () => {
    process.env.WEBHOOK_CALLBACK_ALLOWLIST = 'https://n8n.mycompany.com'
    const adapter = makeAdapter()
    expect(adapter._isCallbackAllowed('https://evil.com/n8n.mycompany.com/steal')).toBe(false)
  })

  it('rechaza URL de subdominio no listado (evil.n8n.mycompany.com)', () => {
    process.env.WEBHOOK_CALLBACK_ALLOWLIST = 'https://n8n.mycompany.com'
    const adapter = makeAdapter()
    expect(adapter._isCallbackAllowed('https://evil.n8n.mycompany.com/webhook')).toBe(false)
  })

  it('rechaza URL malformada (no es una URL válida)', () => {
    process.env.WEBHOOK_CALLBACK_ALLOWLIST = 'https://n8n.mycompany.com'
    const adapter = makeAdapter()
    expect(adapter._isCallbackAllowed('not-a-url')).toBe(false)
  })

  it('compara por origin — puerto diferente es origin diferente', () => {
    process.env.WEBHOOK_CALLBACK_ALLOWLIST = 'https://n8n.mycompany.com:8080'
    const adapter = makeAdapter()
    // mismo host pero sin puerto → origin diferente
    expect(adapter._isCallbackAllowed('https://n8n.mycompany.com/webhook')).toBe(false)
    // mismo host con puerto correcto → origin igual
    expect(adapter._isCallbackAllowed('https://n8n.mycompany.com:8080/webhook')).toBe(true)
  })

  it('allowlist con espacios extra alrededor de los entries es tolerada', () => {
    process.env.WEBHOOK_CALLBACK_ALLOWLIST = ' https://hooks.zapier.com , https://n8n.mycompany.com '
    const adapter = makeAdapter()
    expect(adapter._isCallbackAllowed('https://hooks.zapier.com/any/path')).toBe(true)
    expect(adapter._isCallbackAllowed('https://n8n.mycompany.com/any/path')).toBe(true)
  })

})
