// vitest.inner.config.mts — LANE BASE-INNER (perf axes A+B at the runtime layer).
//
// Purpose-built config for `tools/perf/inner-runtime-perf.perf.test.ts`, which
// drives the REAL composed runtime (composeRuntime → bootstrapWithEverything →
// commandBus) headless. It mirrors the two resolution facts of
// `apps/editor/vitest.config.ts` (which the composed-runtime tests in
// `apps/editor/__tests__/` depend on):
//
//   1. the `@app/*` source aliases (engine views transitively imported by
//      plugins reach `@app/ui/*`);
//   2. the `@thatopen/ui` node stub (§L-540-CI-GATE) — a browser-only Lit
//      library evaluated at module scope by `packages/geometry-slab/src/
//      SlabTool.ts:3`, which is on `bootstrapWithEverything`'s import graph.
//
// Timing hygiene: single fork, no file parallelism, no isolation churn — one
// process, one runtime, sequential dispatches.
//
// Reproduce:  npx vitest run -c tools/perf/vitest.inner.config.mts
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');

export default defineConfig({
  resolve: {
    alias: {
      '@app/ui':        resolve(repo, 'apps/editor/src/ui'),
      '@app/engine':    resolve(repo, 'apps/editor/src/engine'),
      '@app/rendering': resolve(repo, 'apps/editor/src/rendering'),
      '@thatopen/ui':   resolve(repo, 'apps/editor/__mocks__/thatopen-ui.node-stub.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tools/perf/**/*.perf.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
  },
});
