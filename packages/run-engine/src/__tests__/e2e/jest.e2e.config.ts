/**
 * jest.e2e.config.ts — Configuración Jest aislada para tests E2E de LLM.
 *
 * Uso:
 *   jest --config packages/run-engine/src/__tests__/e2e/jest.e2e.config.ts --runInBand
 *
 * O con el script del package.json:
 *   pnpm --filter run-engine test:e2e
 *
 * ⚠️  Este config carga .env.e2e antes de ejecutar los tests.
 *     Los tests se auto-skip si DATABASE_URL_TEST / ENCRYPTION_KEY /
 *     E2E_WORKSPACE_ID no están definidos — no rompe CI normal.
 *
 * NO incluir este config en el jest.config.ts raíz del paquete.
 * Los tests E2E deben correr explícitamente, no en cada PR.
 */

import type { Config } from 'jest';
import { resolve } from 'node:path';

const config: Config = {
  displayName: 'run-engine:e2e',
  preset:      'ts-jest',

  // Entorno Node estándar — sin Prisma test-env especial;
  // los tests crean su propio PrismaClient con DATABASE_URL_TEST.
  testEnvironment: 'node',

  // Solo los tests E2E de este directorio
  testMatch: [
    '<rootDir>/run-llm.e2e.spec.ts',
  ],

  // rootDir apunta a esta carpeta para que testMatch funcione
  rootDir: __dirname,

  // Cargar .env.e2e antes de cualquier test (si existe)
  setupFiles: [
    resolve(__dirname, './load-env.js'),
  ],

  // Timeout generoso — el LLM real puede tardar hasta 60s
  testTimeout: 70_000,

  // Serial: los E2E usan la misma BD de test; concurrencia causaría race conditions
  maxWorkers: 1,
  runInBand:  true,

  transform: {
    '^.+\.tsx?$': ['ts-jest', {
      tsconfig: resolve(__dirname, '../../../../tsconfig.json'),
    }],
  },

  moduleNameMapper: {
    '^@/(.*)$': resolve(__dirname, '../../$1'),
  },
};

export default config;
