import { defineConfig } from 'vitest/config';

// Pure-Node DSL + resolver + units.  No DOM, no THREE, no PostCSS.
// `family-bake-pure-node` gate (`family-editor-quality-gates`-equivalent
// for the runtime layer) runs in this environment.
export default defineConfig({
  css: {
    postcss: { plugins: [] },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
