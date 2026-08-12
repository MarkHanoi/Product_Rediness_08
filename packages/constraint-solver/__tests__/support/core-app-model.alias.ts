/**
 * @file packages/constraint-solver/__tests__/support/core-app-model.alias.ts
 *
 * A build-cost alias for `@pryzm/core-app-model`, wired in `vitest.config.ts`.
 * **This is not a stand-in for any constraint rule** — see the disclosure in
 * `ConstraintEngine.rules.test.ts` and in `vitest.config.ts`.
 *
 * `ConstraintEngine.ts` imports exactly one symbol from that package,
 * `batchCoordinator`, and reads exactly one property of it, `.isBatching`, at
 * exactly one site: `_scheduleRun()` (`src/ConstraintEngine.ts:248`), the 600 ms
 * debounce gate. No rule's `check()` body references it.
 *
 * The real barrel has 296 exports and pulls THREE transitively; importing it
 * costs ~150 s of Vite transform per run. The rules suite calls
 * `validateAll(ctx)` directly and never enters `_scheduleRun`, so nothing this
 * file replaces is on any covered path.
 *
 * **NOT COVERED because of this file:** the debounced `_scheduleRun` → `run()`
 * → `_broadcast()` lifecycle, the batch-suppression behaviour, and the
 * `pryzm-constraints-updated` event payload. Any test of those must drop the
 * alias and bind the real coordinator.
 */

/** `isBatching: false` — the non-suppressed state; the only field read. */
export const batchCoordinator = { isBatching: false };
