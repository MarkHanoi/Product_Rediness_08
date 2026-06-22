// THROWAWAY worktree test config for @pryzm/typology-pack-residential-building.
// The worktree has no node_modules and is NOT in the main pnpm workspace, so we
// alias the @pryzm/* workspace deps to the WORKTREE source (so tests exercise the
// modified worktree code, not the main repo) + alias bare runtime deps to the
// MAIN repo's installed node_modules.
import { defineConfig } from 'vitest/config';

const WT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/.claude/worktrees/agent-ab171777486b8e53a';
const MAIN = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/node_modules';

export default defineConfig({
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      '@pryzm/schemas': `${WT}/packages/schemas/src/index.ts`,
      '@pryzm/typology-pipeline': `${WT}/packages/typology-pipeline/src/index.ts`,
      ulid: `${MAIN}/.pnpm/ulid@2.4.0/node_modules/ulid/dist/index.esm.js`,
      '@opentelemetry/api': `${MAIN}/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/index.js`,
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
  },
});
