// tools/perf/outer/playwright.outer.config.ts — LANE BASE-OUTER (2026-09-02)
// Perf-baseline runner: real Chromium against a PRODUCTION target (local prod
// build or the live site). Deliberately NO webServer block — the repo root
// playwright.config.ts boots `pnpm run dev`, and dev-mode timings are
// INADMISSIBLE for baselines (Vite dev middleware starves the Node event loop).
// Run:
//   npx playwright test --config tools/perf/outer/playwright.outer.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/outer-baseline.spec.ts',
  timeout: 600_000,
  retries: 0,
  workers: 1, // serial — parallel runs would contend for CPU and poison timings
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'off', // we capture our own CDP JS-CPU profile for the cold run
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
