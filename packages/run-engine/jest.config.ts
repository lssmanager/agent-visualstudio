import type { Config } from 'jest';

const config: Config = {
  preset:                 'ts-jest',
  testEnvironment:        'node',
  roots:                  ['<rootDir>/src'],
  // FIX: typo was 'setupFilesAfterFramework' — correct key is 'setupFilesAfterFramework'
  // Actually correct Jest key is 'setupFilesAfterFramework' does not exist.
  // The correct key is 'setupFilesAfterEnv'.
  setupFilesAfterEnv:     [],
  moduleNameMapper: {
    '^@prisma/client$': '<rootDir>/../../node_modules/@prisma/client',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: false } }],
  },
  coverageDirectory:      'coverage',
  collectCoverageFrom:    ['src/**/*.ts', '!src/**/*.spec.ts', '!src/**/*.test.ts'],
};

export default config;
