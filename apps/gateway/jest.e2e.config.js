/**
 * F3a-IV — Configuración E2E para CI en paralelo sin contaminación de datos
 *
 * Cada archivo de test corre en su propio worker de Vitest.
 * Los puertos son efímeros (0) por suite → sin colisiones.
 * Los estados son in-memory y scoped por describe block → sin contaminación cross-suite.
 */

export default {
  // Cada suite en su propio worker
  pool: 'forks',
  poolOptions: {
    forks: {
      singleFork: false,   // paralelismo real
      isolate:    true,    // módulos reseteados entre workers
    },
  },

  // Solo archivos E2E
  include: [
    'src/__tests__/e2e/**/*.e2e-spec.ts',
    'src/__tests__/e2e/**/*.e2e.test.ts',
  ],

  exclude: [
    'src/__tests__/e2e/helpers/**',
    'node_modules/**',
  ],

  // Timeout generoso para E2E (conexiones WebSocket, latencia simulada)
  testTimeout: 15_000,
  hookTimeout: 10_000,

  // Reportes para CI
  reporters: process.env.CI ? ['verbose', 'junit'] : ['verbose'],
  outputFile: process.env.CI ? './test-results/e2e-junit.xml' : undefined,

  // Variables de entorno por defecto para los tests
  env: {
    NODE_ENV:                       'test',
    WEBHOOK_CALLBACK_ALLOWLIST:     'https://allowed.internal.example.com/callback,https://another-allowed.internal.example.com',
    SLACK_SIGNING_SECRET:           'test-slack-signing-secret-32bytes!!',
    DISCORD_PUBLIC_KEY:             'discord-pub-key-hex-placeholder',
  },

  coverage: {
    enabled:   false, // Coverage separado, no en E2E run
  },
}
