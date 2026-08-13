import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  // §FIX-PLAN-WALLTOOL-ARM-ON-ACTIVATE (L-66) — mirror the root vite.config @app/*
  // path aliases so tests that import engine views (e.g. PlanViewToolOverlay, which
  // transitively pulls plantools handlers using @app/ui/*) resolve identically to
  // the production build instead of failing collection with an unresolved import.
  resolve: {
    alias: {
      '@app/ui':        resolve(__dirname, './src/ui'),
      '@app/engine':    resolve(__dirname, './src/engine'),
      '@app/rendering': resolve(__dirname, './src/rendering'),

      // §L-540-CI-GATE — @thatopen/ui is a browser-only custom-element (Lit)
      // library that evaluates `class extends HTMLElement` and touches `document`
      // AT MODULE SCOPE. `packages/geometry-slab/src/SlabTool.ts:3` imports it
      // statically, so three bus/store smoke suites (bootstrap.data,
      // bootstrap.everything, hello-12-elements) died at COLLECTION under this
      // node environment. Rationale for the stub — and for the two alternatives
      // that were rejected (switch to happy-dom; hand-shim DOM globals) — is in
      // the stub file's header.
      '@thatopen/ui':   resolve(__dirname, './__mocks__/thatopen-ui.node-stub.ts'),
    },
  },
  test: {
    // Deliberate: several suites assert node-shaped behaviour explicitly, e.g.
    // bootstrap.data.test.ts:85 `expect(globalThis.window).toBeUndefined()`.
    // Do NOT switch this to happy-dom — it would invert those assertions.
    environment: 'node',
    // §L-850 (2026-08-13, the L-849 sweep): the first pattern matches only the app-ROOT
    // `__tests__/` tree, so `src/rendering/rendererBackendPreference.test.ts` — the
    // §DIAG-FIX-WEBGPU-BACKEND-OSCILLATION regression suite, which sits beside its subject —
    // had NEVER run. Measured dark, then measured GREEN in isolation (1 file / 8 tests)
    // under these same aliases BEFORE this line was widened, so switching it on asserts
    // nothing new. `src/**/*.test.ts` matches exactly that one file today (every other
    // in-src suite here uses the `.spec.ts` suffix and is claimed by the ROOT
    // `vitest.config.ts`) and is deliberately broad so the next one lands claimed.
    include: ['__tests__/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
