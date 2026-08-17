// MT-07 / ADR-0327 §Decision 2 — resolve the LEVEL AUTHORITY for the Inspect
// surfaces at ONE place, instead of each surface probing `runtime.levelStore`.
//
// THE DEFECT THIS CLOSES (pinned at dddca348)
//
// `runtime.levelStore` is the C20 entity store `packages/stores/src/LevelStore.ts`.
// `composeRuntime.ts:1028` constructs it, `runtime-composer/types.ts:3783`
// publishes it, `composeRuntime.ts:1707` disposes it — and **nothing in
// production ever writes it**. Its only writers are the four aggregate commands
// `levelCreate` / `levelUpdate` / `levelSetActive` / `levelDelete`, which have
// zero production callers (reachable only from `packages/stores/src/index.ts`
// re-exports and four test files). So it lists zero levels in every real
// session, and the Inspect tree's level tier — plus the `ElementLocation`
// projection that feeds `buildIsolationIntent` — rendered nothing.
//
// The LIVE authority is `window.bimManager`, assigned at
// `apps/editor/src/engine/initScene.ts:757`, whose constructor seeds
// `{ id: 'L0', name: 'Ground', elevation: 0 }` (`BimKernel.ts:166`) so it is
// never empty. ADR-0327 §Decision 2 names it as the authority the phantom's
// readers migrate to, and commit 31346724 established the pattern at
// RoomGraphPanel. This is the same migration for the Inspect surfaces.
//
// WHY HERE AND NOT INSIDE THE READERS
//
// `buildModelElementLocations` is documented PURE (no I/O, no DOM, no THREE)
// and is unit-tested as such. Reading a window global from inside it would
// break that. `ModelTree` takes its runtime by constructor injection for the
// same reason. So the authority is resolved where the runtime is RESOLVED —
// `InspectPanel` / `modelTreeTestModal` / `livingGraphSelection` — and handed
// down through the existing `levelStore` slot, which both readers already probe
// duck-typed via `list()`.
//
// WHAT IS DELIBERATELY *NOT* DONE HERE
//
//   · No fallback keyed on EMPTINESS. "the live authority is absent" and "the
//     live authority reports no levels" are different facts (§CONTEXT-DATA-
//     HONESTY), and an `if (levels.length === 0) fall back` would merge them.
//     The branch is on PRESENCE of the authority, never on its contents.
//   · No try/catch around `getLevels()`. A throw must stay a throw: the
//     downstream consumers already distinguish it — `livingGraphSelection`
//     §GR-10 turns a throwing projection into `RELATIONSHIP_NOT_READABLE`
//     rather than an empty answer. Swallowing here would destroy that.
//   · `runtime.levelStore` is NOT deleted. ADR-0327 §Decision 3 keeps it as an
//     entity store; this only stops the Inspect surfaces treating it as the
//     level authority. When its aggregate commands acquire production callers,
//     the honest fix is to reconcile the two records — not to re-point this.

/** The minimum shape both Inspect readers probe: a `list()` returning levels. */
export interface LevelAuthority {
    list(): ReadonlyArray<unknown>;
}

/** `BimManager`'s level read API — the live authority per ADR-0327 §Decision 2. */
interface BimLevelSource {
    getLevels(): unknown;
}

/** Structural check for the live authority. No `(window as any)` — P4 is a
 *  shrink-only ratchet and is RED; this must not add to it. */
function isBimLevelSource(value: unknown): value is BimLevelSource {
    if (typeof value !== 'object' || value === null) return false;
    return typeof Reflect.get(value, 'getLevels') === 'function';
}

/**
 * Return the object the Inspect surfaces should read levels from.
 *
 * Precedence — on PRESENCE, never on emptiness:
 *   1. `window.bimManager` when it exposes `getLevels()` — the live authority.
 *   2. otherwise the runtime's own `levelStore`, unchanged.
 *
 * Rule 2 is what keeps every existing suite honest: no test installs
 * `window.bimManager`, so they continue to exercise the injected store exactly
 * as before. In production rule 1 always wins, because `initScene.ts:757`
 * assigns it before any panel mounts.
 *
 * The returned adapter does not copy or cache — each `list()` re-reads the
 * authority, so a level added after the panel mounted appears on the next
 * refresh.
 */
export function resolveLevelAuthority(runtimeLevelStore: unknown): unknown {
    if (typeof window === 'undefined') return runtimeLevelStore;

    const bim: unknown = window.bimManager;
    if (!isBimLevelSource(bim)) return runtimeLevelStore;

    const authority: LevelAuthority = {
        list: () => {
            const levels = bim.getLevels();
            // A non-array from the authority is a shape violation, not an empty
            // model — but the readers' probe ladder is the established place
            // that degrades, so hand it through untouched rather than inventing
            // a second policy here.
            return Array.isArray(levels) ? levels : [];
        },
    };
    return authority;
}
