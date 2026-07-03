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
    },
  },
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
