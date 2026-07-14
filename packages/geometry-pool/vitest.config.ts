import { defineConfig } from 'vitest/config';

// Per-package Vitest config for @pryzm/geometry-pool — §FEAT-SWIMMING-POOL-ELEMENT (L-292).
//
// Environment: `node`. Unlike @pryzm/geometry-column / -wall / -door, this package is
// PURE — it reaches neither THREE nor the DOM at module-eval time (see the P2 note in
// src/index.ts). Keeping it in a node environment is not an accident: it is the guard
// that the assembly stays a pure function of the record, so the mesh/symbol layers can
// never smuggle a dimension back into it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
