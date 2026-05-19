import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['config-shape.test.ts'],
    environment: 'node',
  },
});
