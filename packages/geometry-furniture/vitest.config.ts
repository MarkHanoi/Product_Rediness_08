import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // happy-dom (not node): some furniture modules transitively reach DOM/THREE
    // at module-eval time. A DOM-providing environment lets the resolver load.
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.ts'],
  },
});
