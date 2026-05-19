import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Panel mount/render/unmount need a DOM. happy-dom is the lighter
  // sibling of jsdom; sufficient for the lifecycle-contract test set.
  test: {
    globals: false,
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 10_000,
  },
});
