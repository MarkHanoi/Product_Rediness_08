// THROWAWAY worktree test config for @pryzm/geometry-lift (residential-building P2).
// The worktree has no node_modules and is NOT in the main pnpm workspace, so we
// alias the @pryzm/* workspace deps to the WORKTREE source (real event-bus source;
// a tiny test stub for core-app-model so we don't drag in the THREE-touching
// barrel) + alias bare runtime deps to the MAIN repo's installed node_modules.
//
// The LiftMeshBuilder (THREE via @pryzm/renderer-three/three) is NOT exercised
// here — it needs the renderer boundary + a WebGL/headless THREE harness and is
// validated in-browser (P2 gate). These tests cover the DATA + TYPE layer:
// LiftStore, LiftTypeStore, LiftTypeDefinitions.
import { defineConfig } from 'vitest/config';

const WT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/.claude/worktrees/agent-af9007b747e5a1936';
const MAIN = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/node_modules';

export default defineConfig({
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      '@pryzm/core-app-model': `${WT}/packages/geometry-lift/__tests__/_stubs/coreAppModel.ts`,
      '@pryzm/event-bus': `${WT}/packages/event-bus/src/index.ts`,
      '@opentelemetry/api': `${MAIN}/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/index.js`,
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/geometry-lift/__tests__/**/*.test.ts'],
  },
});
