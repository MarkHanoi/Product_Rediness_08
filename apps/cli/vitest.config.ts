import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Node-side CLI exec — no CSS pipeline.  Override PostCSS so vitest
  // doesn't pick up the editor app's root `postcss.config.js` (which
  // depends on tailwindcss and is irrelevant to this package).
  css: {
    postcss: { plugins: [] },
  },
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
  },
});
