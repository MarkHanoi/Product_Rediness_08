import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
  },
  // Override the editor app's root postcss.config.js (which pulls in
  // `tailwindcss`) — this app is pure Node and has no CSS pipeline.
  css: { postcss: { plugins: [] } },
});
