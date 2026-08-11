import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Node-side bench harness — no CSS pipeline.  Override PostCSS so
  // vitest doesn't pick up the editor app's root `postcss.config.js`
  // (which depends on tailwindcss and is irrelevant here).
  css: {
    postcss: { plugins: [] },
  },
  test: {
    globals: false,
    environment: 'node',
    // Repairs the Node environment for browser globals that unrelated
    // transitive imports (pdfjs via @pryzm/file-format) read at module load.
    // See vitest.setup.ts — these are NOT measurement substitutes.
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'src/benches/**/*.bench.ts',
      '__tests__/**/*.test.ts',
    ],
    testTimeout: 60_000,
  },
});
