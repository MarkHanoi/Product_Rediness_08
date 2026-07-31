import { defineConfig } from 'vitest/config';

// Standalone: this tool has no package.json (matching tools/spanish-genome-probe,
// tools/city-completion and tools/height-engine) so it cannot perturb the pnpm
// lockfile and cannot break `--frozen-lockfile` on the Fly deploy.
//   npx vitest run --config tools/murcia-parcel-probe/vitest.config.ts
//
// Every test runs OFFLINE against captured live fixtures. The probe's network
// layer is only ever exercised through an injected `fetchImpl`.
export default defineConfig({
    test: {
        include: ['tools/murcia-parcel-probe/__tests__/**/*.test.ts'],
        environment: 'node',
        globals: false,
        testTimeout: 30_000,
    },
});
