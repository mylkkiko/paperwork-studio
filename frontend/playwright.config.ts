import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the real stack in Docker (docker compose up). Tests create their own data (unique template titles),
 * so they don't depend on a fresh database; Mailpit is emptied once before the run.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: 'screenshots.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3100',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    locale: 'hy-AM',
    timezoneId: 'Asia/Yerevan',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
