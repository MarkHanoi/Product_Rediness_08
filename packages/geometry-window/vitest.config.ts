import { defineConfig } from 'vitest/config';

// Per-package Vitest config for @pryzm/geometry-window — added with
// §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254), mirroring @pryzm/geometry-door's config
// (added for L-241). The package had NO test runner at all, so its plan-symbol
// geometry — the L-127 dimensional invariant and the void-edge jamb invariant —
// was never asserted in CI.
//
// Environment: happy-dom, like @pryzm/geometry-door / @pryzm/geometry-wall — the
// window module graph transitively reaches THREE / @thatopen at module-eval time,
// which touch DOM globals, so a DOM-providing environment lets the resolver load.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.ts'],
  },
});
