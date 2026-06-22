// THROWAWAY worktree test config for the residentialBuilding ai-host workflows
// (P6.2 platePartition). The worktree has no node_modules; the only external dep
// of platePartition.ts is @opentelemetry/api (aliased to the MAIN repo's install).
// rectDecomposition.ts is internal + dependency-free.
import { defineConfig } from 'vitest/config';

const MAIN = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/node_modules';

export default defineConfig({
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      '@opentelemetry/api': `${MAIN}/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/index.js`,
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/ai-host/src/workflows/residentialBuilding/__tests__/**/*.test.ts'],
  },
});
