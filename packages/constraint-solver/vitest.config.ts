import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * The solver suites (`engine.test.ts`, `PlanegcsAdapter.test.ts`) are pure and
 * run in `node`, which stays the default here. `ConstraintEngine.rules.test.ts`
 * is not: the compliance engine touches `window` at module scope
 * (`src/ConstraintEngine.ts:109-111`) and reads `window.physicsEngine` inside
 * the physics rules, so it needs a DOM. That file selects `happy-dom` for
 * itself with an `@vitest-environment` docblock pragma — Vitest 4 removed
 * `environmentMatchGlobs`, and the pragma keeps the requirement stated in the
 * file that has it rather than in a glob here that can drift from its filename.
 *
 * ─── THE ALIAS, AND WHAT IT COSTS (C74 §3.5) ────────────────────────────────
 * `@pryzm/core-app-model` resolves to `__tests__/support/core-app-model.alias.ts`,
 * which exports only `batchCoordinator = { isBatching: false }`.
 *
 * WHY: the real barrel has 296 exports and pulls THREE transitively. Importing
 * it costs ~150 s of Vite transform per run — measured, not estimated — which
 * is a suite nobody runs, and an unrun suite is worth exactly as much as an
 * absent one.
 *
 * WHY IT IS SAFE: `ConstraintEngine.ts` uses `batchCoordinator` at exactly one
 * site — `_scheduleRun()` (`:248`), the 600 ms debounce gate. No rule's `check()`
 * touches it. `ConstraintEngine.rules.test.ts` calls `validateAll(ctx)` directly
 * and never enters `_scheduleRun`.
 *
 * WHAT IS THEREFORE NOT COVERED, stated rather than left to be discovered: the
 * debounced `_scheduleRun` → `run()` → `_broadcast()` lifecycle, the batch
 * suppression gate, and the `pryzm-constraints-updated` payload. If a test is
 * ever added that asserts any of those, this alias must go and the transform
 * cost must be paid.
 */
export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    alias: {
      '@pryzm/core-app-model': fileURLToPath(
        new URL('./__tests__/support/core-app-model.alias.ts', import.meta.url),
      ),
    },
  },
});
