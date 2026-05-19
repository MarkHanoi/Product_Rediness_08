// playwright.config.ts — Wave A18-T1
// CONTRACT (C10 §4): E2E suite MUST be green on every CI run (NFT 19).

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 4 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['github'],
  ],

  use: {
    baseURL:
      process.env['PLAYWRIGHT_BASE_URL'] ??
      (process.env['REPLIT_DEV_DOMAIN']
        ? `https://${process.env['REPLIT_DEV_DOMAIN']}`
        : 'http://localhost:5000'),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  webServer: {
    command: 'pnpm run dev',
    url:
      process.env['PLAYWRIGHT_BASE_URL'] ??
      (process.env['REPLIT_DEV_DOMAIN']
        ? `https://${process.env['REPLIT_DEV_DOMAIN']}`
        : 'http://localhost:5000'),
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
