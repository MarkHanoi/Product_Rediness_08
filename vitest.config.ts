// Root-level Vitest config — covers src/ui/**/__tests__/ panel + toolbar binding tests.
// Added in wave-6-b-d1 (Wave 6 Phase B real binding).
// Extended in wave-6-b-d2 + wave-6-c-d1 to include toolbar tests.
//
// These files are excluded from the root tsconfig.json so they do not
// interfere with the Vite build step.  Vitest resolves them independently
// using the same TypeScript compiler options via vite-plugin-tsconfig.
//
// Environment: happy-dom (provides DOM APIs for panel show/hide testing
// without a real browser; lighter than jsdom).

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'happy-dom',
    include: [
      'src/ui/__tests__/**/*.spec.ts',
      'src/ui/toolbar/__tests__/**/*.spec.ts',
    ],
    testTimeout: 10_000,
    // Wave A18-T27: coverage reporting via @vitest/coverage-v8 (c8/Istanbul).
    // Run: pnpm vitest run --coverage
    // Report: coverage/ directory + stdout summary.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: [
        'src/ui/**/*.ts',
        'packages/*/src/**/*.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.spec.ts',
        '**/*.d.ts',
        '**/node_modules/**',
        '**/dist/**',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
