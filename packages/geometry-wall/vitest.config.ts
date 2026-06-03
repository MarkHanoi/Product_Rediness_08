import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // happy-dom (not node): the wall-geometry module graph transitively imports
    // @thatopen/ui (via geometry-slab → SlabTool), which references HTMLElement at
    // module-eval time. A DOM-providing environment lets the resolver code load.
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.ts'],
  },
});
