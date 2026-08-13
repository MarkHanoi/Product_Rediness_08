// Vitest config for @pryzm/geometry-lift unit tests.
// The tested modules (LiftToolPlacement) are pure data — no DOM / THREE → node env.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        root: __dirname,
        // §L-849 (2026-08-13): the first two patterns match only `src/**` and only
        // `*.spec.ts`, so `__tests__/liftStores.test.ts` — a package-root suite using
        // the `.test.ts` suffix — had NEVER run. Measured dark, then measured green
        // (11/11) before being switched on, so enabling it asserts nothing new.
        include: ['src/**/__tests__/**/*.spec.ts', 'src/**/*.spec.ts', '__tests__/**/*.test.ts'],
        testTimeout: 10_000,
    },
});
