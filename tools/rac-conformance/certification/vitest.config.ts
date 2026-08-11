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
