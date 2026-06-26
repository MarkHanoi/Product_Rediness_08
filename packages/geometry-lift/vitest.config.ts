// Vitest config for @pryzm/geometry-lift unit tests.
// The tested modules (LiftToolPlacement) are pure data — no DOM / THREE → node env.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        root: __dirname,
        include: ['src/**/__tests__/**/*.spec.ts', 'src/**/*.spec.ts'],
        testTimeout: 10_000,
    },
});
