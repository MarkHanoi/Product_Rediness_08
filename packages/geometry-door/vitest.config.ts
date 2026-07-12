import { defineConfig } from 'vitest/config';

// Per-package Vitest config for @pryzm/geometry-door — added with
// §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241 P7). The package had NO test runner
// at all, so its plan-symbol geometry (the L-127 dimensional invariant, the
// §FIX-PLAN-DOOR-JAMB-SEAM void-edge invariant) was never asserted in CI.
//
// Environment: happy-dom, mirroring @pryzm/geometry-wall — the door module graph
// transitively reaches THREE / @thatopen at module-eval time, which touch DOM
// globals, so a DOM-providing environment lets the resolver load.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.ts'],
  },
});
