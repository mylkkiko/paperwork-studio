/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  // Env (test database, secrets) must be set before any app module is imported.
  setupFiles: ['<rootDir>/test/setup/env.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup/after-env.ts'],
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  testTimeout: 60_000,
  // All files share one test database: never run them in parallel.
  maxWorkers: 1,
  transform: { '^.+\\.ts$': ['ts-jest', { diagnostics: { warnOnly: false } }] },
  collectCoverageFrom: ['src/services/**/*.ts'],
  coverageReporters: ['text', 'text-summary', 'html'],
  coverageThreshold: { 'src/services/': { lines: 80 } },
};
