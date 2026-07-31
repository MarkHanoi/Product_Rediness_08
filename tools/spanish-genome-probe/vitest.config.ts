import { defineConfig } from 'vitest/config';

// Standalone: this tool has no package.json (matching tools/city-completion and
// tools/height-engine) so it cannot perturb the pnpm lockfile.
//   npx vitest run --config tools/spanish-genome-probe/vitest.config.ts
export default defineConfig({
  test: {
    include: ['tools/spanish-genome-probe/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 30_000,
  },
});
