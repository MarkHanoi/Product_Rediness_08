import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node env is sufficient: the geometry factories under test import only
    // `@pryzm/renderer-three/three` (pure geometry math, no DOM). The catalogue
    // store guards its `window` assignment with `typeof window !== 'undefined'`,
    // so it loads cleanly under node too.
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
