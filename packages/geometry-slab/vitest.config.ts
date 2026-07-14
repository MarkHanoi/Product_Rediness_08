import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // happy-dom, not node — §FEAT-SLAB-LOD (L-286).
    //
    // It WAS node, on the reasoning that "the SlabRegionTracer module under test is pure
    // 2D geometry (no THREE, no DOM), and tests import only that module so the
    // THREE/@thatopen-pulling SlabTool is never evaluated." That reasoning is sound for a
    // pure-geometry test and USELESS for the builders: `SlabFragmentBuilder` is the LOD
    // consumer for the slab's section and elevation (ADR-121 §4.3 — the elevation is a
    // projection of the MESH), so its guard must construct the real builder, which reaches
    // THREE and @thatopen/ui at module-eval time and dies on `HTMLElement is not defined`.
    //
    // A guard that cannot load the thing it guards is not a guard. happy-dom provides the
    // DOM globals the module graph touches at import; it changes nothing for the existing
    // pure-geometry suites (matching @pryzm/geometry-wall and @pryzm/geometry-door, which
    // reached this same conclusion for the same reason).
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.ts'],
  },
});
