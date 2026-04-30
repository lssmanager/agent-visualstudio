module.exports = {
  projects: [
    {
      displayName: 'run-engine',
      testEnvironment: 'node',
      rootDir: 'packages/run-engine',
      testMatch: [
        '<rootDir>/src/__tests__/**/*.test.ts',
        '<rootDir>/__tests__/**/*.spec.ts',
      ],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            module: 'commonjs',
            target: 'ES2020',
          },
        }],
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
    },
    {
      displayName: 'hierarchy',
      testEnvironment: 'node',
      rootDir: 'packages/hierarchy',
      // Only run Jest-compatible tests (the vitest-based hierarchy-orchestrator.test.ts
      // uses vi.fn/vi.mock and must be excluded to avoid runtime errors with Jest)
      testMatch: [
        '<rootDir>/src/__tests__/**/*-sequential.test.ts',
      ],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            module: 'commonjs',
            target: 'ES2020',
          },
        }],
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
    },
    {
      displayName: 'profile-engine',
      testEnvironment: 'node',
      rootDir: 'packages/profile-engine',
      testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            module: 'commonjs',
            target: 'ES2020',
          },
        }],
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/index.ts',
      ],
    },
    {
      displayName: 'workspace-engine',
      testEnvironment: 'node',
      rootDir: 'packages/workspace-engine',
      testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            module: 'commonjs',
            target: 'ES2020',
          },
        }],
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/index.ts',
      ],
    },
    {
      displayName: 'api',
      testEnvironment: 'node',
      rootDir: 'apps/api',
      testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            module: 'commonjs',
            target: 'ES2020',
          },
        }],
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/index.ts',
      ],
    },
    // ── run-engine: mock-based E2E tests (no DB required) ───────────────────
    // Real-LLM and real-DB integration tests live in src/__tests__/e2e/ and are
    // run explicitly via `jest --config src/__tests__/e2e/jest.e2e.config.ts`.
    {
      displayName: 'run-engine',
      testEnvironment: 'node',
      rootDir: 'packages/run-engine',
      testMatch: ['<rootDir>/src/_tests_/e2e/run-gpt4o.e2e.test.ts'],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', {
          tsconfig: {
            esModuleInterop: true,
            allowSyntheticDefaultImports: true,
            module: 'commonjs',
            target: 'ES2020',
          },
        }],
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/index.ts',
        '!src/_tests_/**',
        '!src/__tests__/**',
      ],
    },
  ],
};
