import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    globals: false,
    environment: 'node',
    // §L-850 (2026-08-13, the L-849 sweep): both patterns above are rooted at `src/**`, so
    // the two PACKAGE-ROOT `__tests__/` suites had NEVER run. Measured dark, then measured
    // in isolation BEFORE this line was widened: `roomFromGraphSpec.test.ts` is GREEN
    // (8 tests) and is switched on here — 19 files → 20 files.
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts', '__tests__/**/*.test.ts'],
    // ⚠ `__tests__/roomPredicates.test.ts` is the other, and it is **RED** (5 failures —
    // every case dies in `RoomStore.add` schema validation: the fixture rooms predate the
    // current `RoomDataAddSchema`, missing `boundary.height`, `boundary.baseOffset`,
    // `boundary.detectionMethod` and `metadata`, and use non-UUID ids). Those assertions
    // have never executed, so the ADR-0315 U2.2 typed predicates are UNVERIFIED — that is
    // a finding for the founder, not a chore to absorb. Enabling it would break the build,
    // so per the L-849 protocol it stays named on
    // `tools/ga-gate/dark-test-files-ledger.json`, visible and shrink-only. Fix the
    // fixtures, then strike the ledger row and delete this exclude in the SAME commit.
    exclude: ['**/node_modules/**', '**/dist/**', '__tests__/roomPredicates.test.ts'],
  },
});
