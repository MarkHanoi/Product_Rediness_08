import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Anchor the project root at this package so the include glob resolves
  // whether the runner is invoked from the package or the repo root (the
  // command-registry config's own pattern).
  root: __dirname,
  test: {
    // happy-dom, not node — the trackers under test register the SAME window
    // listeners they register in production (`bim-floor-*` / `bim-ceiling-*`),
    // and the resolver they call reads `window.wallStore`
    // (WallFaceResolver.ts:37). A guard that cannot load the thing it guards is
    // not a guard — same conclusion @pryzm/geometry-slab's config reached for
    // the same reason.
    environment: 'happy-dom',
    include: ['__tests__/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
