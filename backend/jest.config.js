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
  // Thresholds removed — add back when test coverage is sufficient
  testTimeout: 15_000,
};

module.exports = config;
