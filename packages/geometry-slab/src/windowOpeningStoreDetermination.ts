// ─── windowOpeningStoreDetermination — a diagnostic that cannot silently
//     disable itself (C78 §20 · C71 §4.4 · C70 L-INV-1) ────────────────────────
//
// THE SITE: `check-no-empty-means-unknown` ARM B, `SlabFragmentBuilder.ts`:
//
//     const winOpenings: any[] = window.openingStore.getByHostId?.(data.id) ?? [];
//     if (winOpenings.length > 0) { console.warn('DEPS NOT INJECTED …'); }
//
// THE DEFECT IS SELF-CANCELLING, which is what makes it worth a module. That
// branch exists ONLY to warn that the builder is running on a legacy bootstrap
// path with `deps.openingStore` un-injected. The optional call `?.` and the
// `?? []` merge three cases:
//   (1) the slab genuinely has no openings — a real answer;
//   (2) `window.openingStore` carries no `getByHostId` — a store of the wrong
//       shape, which is a WORSE version of the very wiring failure being probed;
//   (3) `getByHostId` threw.
// In (2) and (3) the result is `[]`, `length > 0` is false, and the warning
// never prints. The diagnostic goes quiet exactly when it has most to say.
//
// NO RIVAL VOCABULARY. `RELATIONSHIP_NOT_READABLE` is the C78 §8.1 member for
// "the substrate that would answer is absent or threw" — the union is CLOSED at
// eleven at `packages/command-bus/src/consequence.ts` and this module mints
// nothing. It is restated as a literal, not imported, because `@pryzm/command-bus`
// is not a declared dependency of `@pryzm/geometry-slab` and adding one is a
// manifest + lockfile change that collides with concurrent work in a shared tree
// — the same call `boundingWallDetermination` (core-app-model),
// `wallRoomAdjacencyDetermination` (constraint-solver), `storeReadDetermination`
// (ai-host) and `roomStoreDetermination` (room-topology) already made. The
// companion test PINS the literal against the command-bus source.

/**
 * The C78 §8.1 member this module can produce. Only the producible member is
 * named — a partial copy of a closed union that lists members it never emits is
 * a fork waiting to happen.
 * @see packages/command-bus/src/consequence.ts `UndeterminedReason`
 */
export type WindowOpeningStoreUndeterminedReason = 'RELATIONSHIP_NOT_READABLE';

/**
 * "What openings does the window-global store hold for this host?", with the
 * determination status in the TYPE. `[]` is representable only through the
 * `determined` arm, so C71 §4.4 holds by construction.
 */
export type WindowOpeningsDetermination =
    | {
        readonly kind: 'determined';
        /** MAY be empty — read successfully, and this host genuinely has none. */
        readonly openings: readonly unknown[];
    }
    | {
        readonly kind: 'undetermined';
        readonly reason: WindowOpeningStoreUndeterminedReason;
        /** WHICH unreadable case, in words. For a log line; never parsed. */
        readonly detail: string;
    };

/**
 * TOTAL read of `window.openingStore.getByHostId(hostId)`.
 *
 * Never throws — a caller that had to wrap this in try/catch would rebuild the
 * defect it closes.
 */
export function readWindowOpeningsForDiagnostic(
    store: unknown,
    hostId: string,
): WindowOpeningsDetermination {
    if (store === null || store === undefined) {
        return {
            kind: 'undetermined', reason: 'RELATIONSHIP_NOT_READABLE',
            detail: 'window.openingStore is absent — nothing was read',
        };
    }
    const fn = (store as { getByHostId?: unknown }).getByHostId;
    if (typeof fn !== 'function') {
        return {
            kind: 'undetermined', reason: 'RELATIONSHIP_NOT_READABLE',
            detail: 'window.openingStore has no callable `getByHostId` — the store is of the wrong ' +
                'shape, which is a worse form of the wiring failure this probe exists to detect',
        };
    }
    let raw: unknown;
    try {
        raw = (fn as (id: string) => unknown).call(store, hostId);
    } catch (err) {
        return {
            kind: 'undetermined', reason: 'RELATIONSHIP_NOT_READABLE',
            detail: 'getByHostId threw: ' + (err instanceof Error ? err.message : String(err)),
        };
    }
    if (!Array.isArray(raw)) {
        return {
            kind: 'undetermined', reason: 'RELATIONSHIP_NOT_READABLE',
            detail: 'getByHostId returned ' + (raw === undefined ? 'undefined' : typeof raw) +
                ', not an array — the old `?? []` absorbed this silently',
        };
    }
    return { kind: 'determined', openings: raw as readonly unknown[] };
}
