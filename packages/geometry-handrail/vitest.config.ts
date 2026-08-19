// Vitest config for @pryzm/geometry-stair unit tests.
// Pure-data geometry helpers (no DOM / THREE in the tested module) → node env.
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
