import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node env: the ridge-axis suite imports only the THREE-free pure module
    // (roofRidgeAxis.ts) — no DOM, no renderer-three.
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
