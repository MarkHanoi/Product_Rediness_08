import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// BIM 2.0 certification harnesses (directive §10 persistence, §11 undo/redo).
// Mirrors ../runtime-harness/vitest.config.ts so the REAL apps/editor modules
// (ProjectSerializer, ProjectLoader, initBusHandlers) resolve their @app/*
// aliases exactly as they do in the working V3/V4/V5 precedent.
export default defineConfig({
  resolve: {
    alias: {
      '@app/ui': resolve(__dirname, '../../../apps/editor/src/ui'),
      '@app/engine': resolve(__dirname, '../../../apps/editor/src/engine'),
      '@app/rendering': resolve(__dirname, '../../../apps/editor/src/rendering'),
      // CE-03 — fake-indexeddb is a devDependency of @pryzm/persistence-client
      // (not hoisted to the workspace root), so the IndexedDB round-trip arm in
      // persistence.cert.ts resolves the SAME copy that package's own 15/15
      // executed suite uses. It is a SHIM, not a browser — the arm says so on
      // every run.
      'fake-indexeddb/auto': resolve(
        __dirname,
        '../../../packages/persistence-client/node_modules/fake-indexeddb/auto/index.mjs',
      ),
    },
  },
  test: {
    globals: false,
    environment: 'happy-dom',
    include: ['__tests__/**/*.cert.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    pool: 'forks',
  },
});
