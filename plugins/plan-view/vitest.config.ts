import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // §L-850 (2026-08-13, the L-849 sweep): `src/__tests__/view-template-bridge.test.ts`
    // is a package-SRC suite, not a package-ROOT one, so it had NEVER run. Measured dark,
    // then measured GREEN in isolation (1 file / 5 tests) BEFORE this line was widened.
    // 15 files/112 tests → 16 files/117 tests.
    include: ['__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
