import { defineConfig } from 'vitest/config';

// Per-package Vitest config for @pryzm/geometry-boundary-line —
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7900).
//
// Environment: `node`. This package is PURE — it reaches neither THREE nor the DOM at
// module-eval time, and that is not an accident: it is the guard that the propagation
// PLANNER stays a pure function of (line, attachments), so the verdict a test asserts
// is the verdict production computes. A planner that needed a browser could only ever
// be tested through a fake, and [[fake-more-capable-than-real]] is exactly what that
// produces.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
