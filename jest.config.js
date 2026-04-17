module.exports = {
  projects: [
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
  ],
};
