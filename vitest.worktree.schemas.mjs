// THROWAWAY worktree test config (not committed to package config).
// The worktree has no node_modules; alias bare runtime deps to the MAIN repo's
// installed node_modules so vitest can resolve `ulid`/`zod` against the
// worktree source files.
import { defineConfig } from 'vitest/config';

const MAIN = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/node_modules';

export default defineConfig({
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      ulid: `${MAIN}/.pnpm/ulid@2.4.0/node_modules/ulid/dist/index.esm.js`,
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
