import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // happy-dom (not node): some furniture modules transitively reach DOM/THREE
    // at module-eval time. A DOM-providing environment lets the resolver load.
    environment: 'happy-dom',
    // §L-850 (2026-08-13, the L-849 sweep): `src/furnitureShadowBudget.test.ts` sits beside
    // its subject rather than in `__tests__/`, so it had NEVER run. Measured dark, then
    // measured GREEN in isolation (1 file / 6 tests) BEFORE this line was widened.
    // 12 files/63 tests → 13 files/69 tests.
    include: ['__tests__/**/*.test.ts', 'src/**/*.test.ts'],
  },
});
