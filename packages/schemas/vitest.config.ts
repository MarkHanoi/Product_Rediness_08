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
      // Excludes:
      //   • barrels (`index.ts`) — pure re-exports, no executable logic
      //   • `src/types/Id.ts` — type-only file (brands + helpers); v8 marks
      //     declaration lines as "uncovered", but they have no runtime cost
      exclude: ['src/index.ts', 'src/**/index.ts', 'src/types/**'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
