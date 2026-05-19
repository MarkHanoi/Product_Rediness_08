import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Pure-Node loader; override the workspace-root tailwind/postcss config
  // (the editor app keeps it at the root) so vitest does not try to load
  // tailwind for these unit tests.
  css: { postcss: { plugins: [] } },
  test: {
    globals: false,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
