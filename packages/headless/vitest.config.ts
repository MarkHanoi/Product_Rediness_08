import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // happy-dom, not node: `composeRuntime` touches `document` while wiring
    // DOM-adjacent slots even with `canvas: null`.  The reference probe
    // (tools/rac-conformance/runtime-harness) runs under happy-dom for the
    // same reason.  This is the HOST environment — it is not a stub of the
    // subject under test, which is the real `composeRuntime`.
    environment: 'happy-dom',
    globals: false,
    include: ['__tests__/**/*.test.ts'],
    reporter: 'default',
    // The real composition root pulls a large import graph (transform alone
    // is ~20 s cold).  The 5 s default is not a statement about the code
    // under test; it is a statement about esbuild.  Matches the reference
    // probe's harness config.
    testTimeout: 600_000,
    hookTimeout: 600_000,
    pool: 'forks',
  },
});
