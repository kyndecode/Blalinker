/** @type {import('jest').Config} */
const config = {
  preset:          'ts-jest',
  testEnvironment: 'node',
  rootDir:         '.',
  testMatch:       ['**/tests/**/*.test.ts'],
  moduleNameMapper: { '@/(.*)': '<rootDir>/src/$1' },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  globalSetup:     '<rootDir>/tests/globalSetup.ts',
  globalTeardown:  '<rootDir>/tests/globalTeardown.ts',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/config/**',
    '!src/server.ts',
  ],
  coverageThresholds: {
    global: { branches: 70, functions: 80, lines: 80, statements: 80 },
  },
  testTimeout: 15_000,
};

module.exports = config;
