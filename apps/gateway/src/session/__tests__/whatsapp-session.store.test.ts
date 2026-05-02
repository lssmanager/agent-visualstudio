/**
 * Tests for WhatsAppSessionStore.getOrCreate() — AUDIT-12 (#177)
 *
 * Verifica que el lock Map<string, Promise<SessionEntry>> previene
 * race conditions TOCTOU: dos llamadas concurrentes para el mismo
 * configId deben resultar en UNA sola entrada creada.
 */

import { WhatsAppSessionStore } from '../../whatsapp-session.store'

describe('WhatsAppSessionStore.getOrCreate() — AUDIT-12 (#177)', () => {

  it('crea la entrada la primera vez y la devuelve', async () => {
    const store = new WhatsAppSessionStore()
    const entry = await store.getOrCreate('config-1')
    expect(entry).toBeDefined()
    expect(entry.status).toBe('disconnected')
    expect(entry.qrBuffer).toBeNull()
  })

  it('devuelve la misma instancia en llamadas sucesivas', async () => {
    const store = new WhatsAppSessionStore()
    const a = await store.getOrCreate('config-1')
    const b = await store.getOrCreate('config-1')
    expect(a).toBe(b)
  })

  it('TOCTOU: dos llamadas concurrentes para el mismo configId crean UNA sola entrada', async () => {
    const store = new WhatsAppSessionStore()

    // Lanzar dos getOrCreate() en paralelo sin await intermedio
    const [entryA, entryB] = await Promise.all([
      store.getOrCreate('config-concurrent'),
      store.getOrCreate('config-concurrent'),
    ])

    // Deben ser la misma referencia de objeto
    expect(entryA).toBe(entryB)

    // Solo una entrada en el store
    expect(store.activeSessions()).toHaveLength(1)
    expect(store.activeSessions()[0]).toBe('config-concurrent')
  })

  it('TOCTOU: diez llamadas concurrentes producen UNA sola entrada', async () => {
    const store = new WhatsAppSessionStore()
    const configId = 'config-stress'

    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.getOrCreate(configId))
    )

    // Todas deben ser la misma referencia
    const first = results[0]!
    for (const entry of results) {
      expect(entry).toBe(first)
    }

    expect(store.activeSessions()).toHaveLength(1)
  })

  it('_creationLocks se limpia tras completar la creación (pendingCreations === 0)', async () => {
    const store = new WhatsAppSessionStore()
    await store.getOrCreate('config-lock-cleanup')
    // El lock debe haberse eliminado tras completar
    expect(store.pendingCreations).toBe(0)
  })

  it('IDs diferentes crean entradas independientes', async () => {
    const store = new WhatsAppSessionStore()
    const [a, b, c] = await Promise.all([
      store.getOrCreate('cfg-A'),
      store.getOrCreate('cfg-B'),
      store.getOrCreate('cfg-C'),
    ])
    expect(a).not.toBe(b)
    expect(b).not.toBe(c)
    expect(store.activeSessions()).toHaveLength(3)
  })

  it('has() devuelve true después de getOrCreate()', async () => {
    const store = new WhatsAppSessionStore()
    expect(store.has('cfg-X')).toBe(false)
    await store.getOrCreate('cfg-X')
    expect(store.has('cfg-X')).toBe(true)
  })

  it('remove() elimina la sesión y los locks residuales', async () => {
    const store = new WhatsAppSessionStore()
    await store.getOrCreate('cfg-remove')
    store.remove('cfg-remove')
    expect(store.has('cfg-remove')).toBe(false)
    expect(store.pendingCreations).toBe(0)
  })

})
