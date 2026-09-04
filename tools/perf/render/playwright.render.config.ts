// tools/perf/render/playwright.render.config.ts — LANE PERF round 4 (2026-09-04)
//
// Axis R runner. Same admissibility stance as tools/perf/outer: real Chromium
// against a PRODUCTION target, and deliberately NO `webServer` block — the repo
// root playwright.config.ts boots `pnpm run dev`, and dev-mode timings are
// INADMISSIBLE ([[localhost-dev-unusable-test-on-prod]]).
//
// A separate config (rather than widening the outer config's testMatch) so the
// BASE-OUTER baseline suite and this one can be run independently: axis R needs
// ONE heavy open and ~90s of sampling, axis C/D need RUNS×(cold+warm) opens.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/render-profile.spec.ts',
  timeout: 900_000,
  retries: 0,
  workers: 1, // serial — a parallel run would contend for GPU and CPU and poison every frame number
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
