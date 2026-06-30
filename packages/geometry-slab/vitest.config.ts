import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node env is sufficient: the SlabRegionTracer module under test is pure 2D
    // geometry (no THREE, no DOM). Tests import only that module so the
    // THREE/@thatopen-pulling SlabTool is never evaluated.
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
