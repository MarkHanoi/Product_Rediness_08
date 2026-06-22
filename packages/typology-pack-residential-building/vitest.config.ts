import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    globals: false,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
