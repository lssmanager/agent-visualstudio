/**
 * [F3a-10] vitest.config.e2e.ts
 *
 * Configuración Vitest para la suite E2E del gateway.
 * Separada de la config unitaria para controlar timeouts y scope.
 *
 * Uso:
 *   pnpm test:e2e            → corre solo esta config
 *   pnpm test:unit           → corre vitest.config.ts (unitarios)
 */

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name:        'gateway-e2e',
    include:     ['src/__tests__/e2e/**/*.e2e.test.ts'],
    testTimeout: 15_000,   // 15s por test — agentExecutorStub resuelve en <1ms
    hookTimeout: 10_000,   // 10s para beforeAll / afterAll
    globals:     true,
    environment: 'node',
    // Forzar ejecución secuencial para que sessionHistory sea predecible
    pool:         'forks',
    poolOptions:  { forks: { singleFork: true } },
  },
})
