/**
 * packages/run-engine/jest.config.ts
 * F0-10 — Configures Jest to use the Prisma test environment for
 * all tests under src/repositories/__tests__/
 */

import type { Config } from 'jest';

const config: Config = {
  displayName: 'run-engine',
  preset:      'ts-jest',

  // Custom environment that creates an isolated Postgres schema per worker
  testEnvironment: '<rootDir>/src/repositories/__tests__/setup/prisma-test-env.ts',

  // Only repository integration tests use the custom environment.
  // Unit tests in other directories can still run without a DB.
  testMatch: [
    '<rootDir>/src/repositories/__tests__/**/*.test.ts',
  ],

  // Global setup / teardown
  globalSetup:    '<rootDir>/src/repositories/__tests__/setup/global-setup.ts',
  globalTeardown: '<rootDir>/src/repositories/__tests__/setup/global-teardown.ts',

  // Extend timeout for DB operations
  testTimeout: 30_000,

  // Run tests serially inside a worker to prevent TRUNCATE race conditions.
  // Each worker still gets its own DB schema (parallelism at the worker level).
  maxConcurrency: 1,

  setupFilesAfterFramework: [],

  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
    }],
  },

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Env file loaded before global-setup
  // Set DATABASE_URL_TEST in .env.test
  // e.g. DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/avs_test
};

export default config;
