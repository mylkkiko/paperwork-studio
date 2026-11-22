import { defineConfig, devices } from '@playwright/test';

/** Screenshots of the main screens against the running Docker stack (docker compose up). */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'screenshots.spec.ts',
  timeout: 180_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3100',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    locale: 'hy-AM',
    timezoneId: 'Asia/Yerevan',
  },
});
