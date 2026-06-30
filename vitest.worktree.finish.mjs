// THROWAWAY worktree test config for §RESI-FINISH-BULK (ADR-0087). The worktree
// has no node_modules; the only runtime dep the bulk-finish command + test pull in
// is @opentelemetry/api (via ../types) — aliased to the MAIN repo's install. The
// @pryzm/room-topology import is type-only, so it is stripped at compile.
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
    include: ['packages/command-registry/__tests__/updateRoomFinishesBulk.test.ts'],
  },
});
