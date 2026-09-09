import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    // ⭐ §L-851 — THIS PATTERN WAS AN ALLOWLIST THAT MISSED A REAL SPEC ON TWO AXES.
    // It read `__tests__/**/*.test.ts`, and
    // `src/__tests__/pluginDtoStoresAreProjectScoped.spec.ts` matched neither the DIRECTORY
    // (`src/__tests__`, not `__tests__`) nor the SUFFIX (`.spec.ts`, not `.test.ts`). A spec
    // outside the include is not skipped, it is NEVER DISCOVERED — `vitest run <path>` prints
    // "No test files found" and exits 1 without ever saying the file exists. "Never ran" and
    // "passed" print the same value.
    //
    // ⛔ IT WAS RED. Measured in isolation under a throwaway config BEFORE widening (the L-849
    // protocol, non-negotiable): 3 of 5 failed. The spec pinned EIGHT plugin-DTO families and
    // `composeRuntime` has NINE (`siteworks` was added and the pin that exists to catch exactly
    // that could not fire), and it wrote through `store.set()` and `new Store()` — neither of
    // which this `Store` has had since it required a `storeKey` and moved writes to
    // `applyPatch`. Repaired against the real API, re-measured 5/5 green, and only THEN wired.
    // Widening adds EXACTLY ONE file; the other 17 already matched.
    include: ['{__tests__,src/__tests__}/**/*.{test,spec}.ts'],
  },
});
