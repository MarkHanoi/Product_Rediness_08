import { defineConfig } from 'vitest/config';

// Per-package Vitest config for @pryzm/core-app-model (L-167
// §FIX-CI-COREAPPMODEL-TEST-WIRING).
//
// Why this file exists: the package's `*.test.ts` suites were DARK in CI.
// `pnpm --filter @pryzm/core-app-model test` runs `vitest run`, which — with
// no local config — resolved the ROOT vitest.config.ts whose `include` is
// scoped to `src/ui/**/*.spec.ts`. None of core-app-model's `*.test.ts` files
// matched, so the runner reported "no test files" and the suites never ran in
// CI (a real coverage gap; a pre-existing silently-failing assertion in
// LevelScoped3DMassingLod went unnoticed under this gap).
//
// Environment: happy-dom (not node). Mirrors packages/geometry-furniture — some
// rendering/preview modules transitively reach DOM/THREE at module-eval time,
// so a DOM-providing environment lets the resolver load. The 7 view suites
// self-declare `@vitest-environment happy-dom`; the 2 preview suites use
// `document.*` directly; both are satisfied by this default. Any suite needing
// a different env can still override via an in-file `@vitest-environment`
// pragma.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    testTimeout: 10_000,
  },
});
