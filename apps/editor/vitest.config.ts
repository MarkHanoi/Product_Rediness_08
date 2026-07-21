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
    include: ['__tests__/**/*.test.ts'],
  },
});
