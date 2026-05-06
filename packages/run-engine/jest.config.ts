import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.spec.ts', '**/*.spec.ts'],
  moduleNameMapper: {
    '^@agent-vs/(.*)$': '<rootDir>/../$1/src/index',
  },
  setupFilesAfterFramework: undefined,  // intentionally removed — was a typo for setupFilesAfterFramework
  setupFiles: [],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/__tests__/**',
  ],
};

export default config;
