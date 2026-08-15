// Isolated vitest config for tools/tracker.
//
// WHY ITS OWN CONFIG: the root vitest.config.ts is happy-dom with an explicit,
// hand-curated include list (§L-851 — those patterns are load-bearing and were
// once silently wrong for 72 files). This suite is pure Node with no DOM, and
// editing the shared config from a concurrent lane risks a collision over a file
// other lanes also touch. A local config keeps the blast radius at zero.
//
// RUN:  npx vitest run --config tools/tracker/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tools/tracker/__tests__/**/*.test.ts'],
  },
});
