import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// CE-05 gesture→command reachability probe. Mirrors ../certification/vitest.config.ts
// so the REAL apps/editor modules (toolbars, initBusHandlers via the shared world)
// resolve their @app/* aliases exactly as they do in the working H1–H5 precedent.
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
    include: ['__tests__/**/*.probe.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    pool: 'forks',
  },
});
