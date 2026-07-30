import { defineConfig } from 'vitest/config';

// Local Vitest config (V1-LAUNCH L-247 orphaned-suite fix). Without this file
// `vitest run` walks up to the ROOT vitest.config.ts, whose `include` only
// covers src/ui + apps/editor specs — so this package's `__tests__` never ran
// (vitest reported "No test files found"). This local config stops the upward
// walk and scopes the run to this package's own suite. Mirror of the
// crash-reporter fix.
export default defineConfig({
  test: {
    include: ['__tests__/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
    environment: 'node',
  },
});
