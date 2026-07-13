// Vitest config for @pryzm/command-registry's __tests__ suite.
//
// WHY IT EXISTS (§GATE-G10): this package had __tests__ but no runner config —
// the files were only ever executed through ad-hoc `vitest.worktree.*.mjs`
// configs at the repo root. The G10 undo suite needs a stable, in-package way to
// run them:
//
//   npx vitest run --config packages/command-registry/vitest.config.ts
//
// happy-dom, because the legacy CommandManager path is a browser-side subsystem
// (it reads `window.__wallRebuildControl` / `window.roomTopologyObserver` for the
// §56 observer pause, and CommandManagerImpl's constructor reads window globals).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    globals: false,
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
