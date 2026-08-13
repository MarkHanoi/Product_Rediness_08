import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // §L-850 (2026-08-13, the L-849 sweep): the sole pattern above matched only the
    // PACKAGE-ROOT `__tests__/` tree, so four suites living beside their subjects under
    // `src/*/__tests__/` — dimensions/evaluator, dimensions/producer, hidden-line/classifier,
    // view-resolution/resolver — had NEVER run. Measured dark, then measured GREEN in
    // isolation (4 files / 84 tests) via a throwaway config BEFORE this line was widened,
    // so switching them on asserts nothing new: 37 files/635 tests → 41 files/719 tests.
    include: ['__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
