/**
 * vitest.config.ts — configuración de tests unitarios del gateway
 *
 * Solo ejecuta tests en src/tests/unit/ para evitar que suites legacy
 * con globals de Jest (p.ej. runs/__tests__/status-stream.gateway.spec.ts)
 * rompan el run de CI.
 *
 * Los tests e2e siguen en vitest.config.e2e.ts.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/unit/**/*.spec.ts'],
    globals: false,
    environment: 'node',
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      include: ['src/middleware/**/*.ts'],
      exclude: ['src/tests/**'],
    },
  },
});
