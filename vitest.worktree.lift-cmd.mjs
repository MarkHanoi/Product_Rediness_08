// THROWAWAY worktree test config for the §RESI-LIFT-TOP-CAB command regression.
// The worktree has no node_modules and is NOT in the main pnpm workspace, so we
// alias the heavy @pryzm/* deps the command imports at module-load to lightweight
// worktree stubs (so we never drag THREE in via the geometry-lift / core-app-model
// barrels), the real event-bus source, and the MAIN repo's installed @opentelemetry.
//
// The command's canExecute() — the gate the CommandManager runs before execute() —
// touches NONE of the stubbed surfaces; it reads only ctx.projectContext + ctx.stores.
// On merge into the workspace this config + the __tests__/_stubs are deleted and the
// real packages resolve via the installed symlinks.
import { defineConfig } from 'vitest/config';

const WT = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/.claude/worktrees/agent-a847732b4bb92f7c2';
const MAIN = 'c:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/node_modules';

export default defineConfig({
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      '@pryzm/geometry-lift': `${WT}/packages/command-registry/__tests__/_stubs/geometryLift.ts`,
      '@pryzm/core-app-model/element-registry': `${WT}/packages/command-registry/__tests__/_stubs/coreAppModel.ts`,
      '@pryzm/core-app-model': `${WT}/packages/command-registry/__tests__/_stubs/coreAppModel.ts`,
      '@pryzm/event-bus': `${WT}/packages/event-bus/src/index.ts`,
      '@opentelemetry/api': `${MAIN}/.pnpm/@opentelemetry+api@1.9.1/node_modules/@opentelemetry/api/build/esm/index.js`,
    },
  },
  root: WT,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/command-registry/__tests__/createVerticalCirculation.topCab.test.ts'],
  },
});
