import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      // Excludes barrels, the OTel-tracer wrapper (no-op without provider),
      // and the MoveCubeCommand fixture handler (covered by integration test).
      exclude: ['src/index.ts', 'src/**/index.ts', 'src/otel.ts'],
      thresholds: {
        branches: 90,
        functions: 95,
        lines: 95,
        statements: 95,
      },
    },
  },
});
