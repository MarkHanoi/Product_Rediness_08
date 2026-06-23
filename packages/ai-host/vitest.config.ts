import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Top-level suites + co-located unit tests (e.g. residentialBuilding/__tests__),
    // which were previously NOT discovered by `__tests__/**` (so they never ran in CI).
    include: ['__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    globals: false,
  },
});
