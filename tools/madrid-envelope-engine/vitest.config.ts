import { defineConfig } from 'vitest/config';

// Standalone: this tool has no package.json (matching tools/murcia-parcel-probe,
// tools/spanish-genome-probe, tools/city-completion and tools/height-engine) so it cannot perturb
// the pnpm lockfile and cannot break `--frozen-lockfile` on the Fly deploy.
//
//   npx vitest run --config tools/madrid-envelope-engine/vitest.config.ts
//
// ⚠ EVERY TEST RUNS OFFLINE. The rules are exercised against `fixtures/*.json` — real rows captured
// once by `probe/03-capture-fixtures.mjs` and committed. A suite that fetched would go red when a
// municipal server had a bad afternoon, and green would then mean "the server was up" rather than
// "the adapter is correct".
//
// ⚠ Tests live at the PACKAGE ROOT `__tests__/`. `include` is a full path from the repo root
// because that is how the config is invoked; a bare `__tests__/**` would match nothing.
export default defineConfig({
    test: {
        include: ['tools/madrid-envelope-engine/__tests__/**/*.test.ts'],
        environment: 'node',
        globals: false,
        testTimeout: 30_000,
    },
});
