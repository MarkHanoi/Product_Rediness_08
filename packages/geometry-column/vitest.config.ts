import { defineConfig } from 'vitest/config';

// Per-package Vitest config for @pryzm/geometry-column — added with
// §FEAT-COLUMN-PLAN-LOD (L-286). The package had NO test runner at all, so its plan
// symbol was never asserted in CI — which is how a CIRCULAR column went on being drawn
// as a RECTANGLE (see ColumnSectionGeometry).
//
// Environment: happy-dom, mirroring @pryzm/geometry-wall and @pryzm/geometry-door — the
// column module graph transitively reaches THREE / @thatopen at module-eval time, which
// touch DOM globals, so a DOM-providing environment lets the builder load.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.ts'],
  },
});
