// tests/e2e/static/playwright.config.ts — STATIC-PAGE visual smokes.
//
// The root `playwright.config.ts` boots the dev server (`pnpm run dev`) and drives the live
// editor; nothing in that suite can reach the onboarding confirm step (auth + a project + a
// geocode + a drawn parcel boundary). The specs here render a SELF-CONTAINED page built from
// the real DOM and the real injected sheets — no server, no network — and measure pixels in
// Chromium. They are named `*.static.ts` so the root config's `*.spec.ts` sweep ignores them.
//
//   npx playwright test --config tests/e2e/static/playwright.config.ts

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The root package is `"type": "module"`, so there is no `__dirname` here.
const HERE = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  testDir: HERE,
  testMatch: /.*\.static\.ts$/,
  timeout: 600_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: '../../../test-results/static',
  use: {
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
