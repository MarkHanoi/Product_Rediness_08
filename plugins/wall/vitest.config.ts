import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // §L-850 (2026-08-13, the L-849 sweep): the sole pattern above matched only the
    // `.test.ts` SUFFIX, so three `.spec.ts` suites in the same directory had NEVER run.
    // Measured dark, then measured in isolation BEFORE this line was widened:
    // `tool-arc.spec.ts` + `tool-polyline.spec.ts` are GREEN (12 tests) and are switched
    // on here — 15 files/161 tests → 17 files/173 tests.
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.spec.ts'],
    // ⚠ `__tests__/playwright/integration.spec.ts` is the third, and it is **RED** (4
    // failures: its `buildEnv` harness constructs a store with options the current
    // constructor no longer accepts). Despite the directory name it is a VITEST suite —
    // its own header says the "Playwright" label means the integration-harness CATEGORY,
    // not the browser framework. Switching a RED dark suite on would break the build, so
    // per the L-849 protocol it is NOT enabled: it stays named on
    // `tools/ga-gate/dark-test-files-ledger.json` where it is visible and shrink-only,
    // rather than quietly deleted or silently skipped. Fix the harness, then strike it
    // from the ledger and delete this exclude in the SAME commit.
    exclude: ['**/node_modules/**', '**/dist/**', '__tests__/playwright/**'],
    environment: 'node',
  },
});
