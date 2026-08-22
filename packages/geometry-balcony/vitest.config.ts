import { defineConfig } from 'vitest/config';

// Per-package Vitest config for @pryzm/geometry-balcony — §FEAT-BALCONY-COMPOUND (L-5600).
//
// Environment: `node`, and that is a GUARD, not a convenience. This package is PURE —
// it reaches neither THREE nor the DOM at module-eval time — so a node environment is
// what keeps the assembly a pure function of the balcony RECORD and makes it impossible
// for the mesh or symbol layers to smuggle a dimension back into it (the same guard
// @pryzm/geometry-pool applies, for the same reason).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
