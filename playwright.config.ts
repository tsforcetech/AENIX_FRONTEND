import { defineConfig, devices } from '@playwright/test';

const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};

/**
 * Two builds are tested:
 *  - production (pnpm build, :4173): no data source, deny-by-default, no sample data.
 *  - prototype  (pnpm build:prototype, :4174): clickable workflow on sample data.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { trace: 'off', launchOptions },
  webServer: [
    {
      command: 'pnpm build && pnpm preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'pnpm build:prototype && pnpm preview:prototype --port 4174 --strictPort',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: 'production',
      testMatch: /production\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' },
    },
    {
      name: 'prototype-desktop',
      testMatch: /prototype.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        baseURL: 'http://localhost:4174',
      },
    },
    {
      name: 'prototype-mobile',
      testMatch: /prototype\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: 'http://localhost:4174' },
    },
  ],
});
