// ─── roomStoreDetermination — "I could not read the room store" stops being
//     "this element is in no room" (C78 §20 · C71 §4.4 · C70 L-INV-1) ────────
//
// THE SITE THIS EXISTS FOR. `check-no-empty-means-unknown` ARM A, at
// `packages/room-topology/src/RoomContentsService.ts:195`:
//
//     private _allRooms(): RoomData[] {
//       try {
//         const fn = (this.deps.roomStore as any).getAll;
//         if (typeof fn === 'function') return fn.call(this.deps.roomStore) ?? [];
//       } catch { /* fall through */ }
//       return [];                       // ← THE FINDING
//     }
//
// THREE DISTINGUISHABLE CASES, ONE VALUE. That single `return []` is reached when
//   (1) the project genuinely holds no rooms — a real, correct answer;
//   (2) `deps.roomStore` carries no `getAll` at all — a mis-wired or partially
//       constructed dependency, cast through `as any` so the compiler is blind
//       to it (ARM B's shape, stacked inside ARM A's);
//   (3) `getAll` THREW — the store exists, was asked, and failed.
// Only (1) is an answer. (2) and (3) are "I could not look", and this service
// converted both into the positive claim *there are no rooms*.
//
// WHY IT TRAVELS. `_allRooms()` is the sole room source for
// `getRoomForElement`, which answers *"which room is this wall / door / column
// in?"*. On (2) or (3) it returns `{ rooms: [], primaryRoomId: null,
// relationship: 'none' }` — literally *"this element belongs to no room"* — and
// nothing in the shape distinguishes that from a confident answer. It is the
// `FacadeOrientationService` shape (C79 §5.2.0): an absence rendered as a
// positive fact about the building.
//
// NO RIVAL VOCABULARY. The union is C78 §8.1's, CLOSED at eleven members, at
// `packages/command-bus/src/consequence.ts`. Exactly one member applies here:
//   · `RELATIONSHIP_NOT_READABLE` — the substrate that would answer is absent or
//     threw. "I could not look", precisely. Cases (2) and (3) above.
// `RELATIONSHIP_NOT_RECORDED` is deliberately NOT produced here: that member is
// about an edge nobody writes, and a room store that threw has written nothing
// either way. Nothing is minted, nothing is extended, nothing is renamed — this
// module CLASSIFIES.
//
// WHY THE UNION IS RESTATED STRUCTURALLY RATHER THAN IMPORTED. Identical
// reasoning to the three modules that already do this — `boundingWallDetermination`
// (core-app-model), `wallRoomAdjacencyDetermination` (constraint-solver),
// `storeReadDetermination` (ai-host): `@pryzm/command-bus` is not a declared
// dependency of `@pryzm/room-topology`, and adding one is a manifest + lockfile
// change that collides with concurrent work in a shared tree. The companion test
// PINS these literals against the command-bus source text, so a drift in the
// closed union fails a test instead of forking in silence.

import type { RoomData } from './RoomTypes';

/**
 * The C78 §8.1 member this module can legitimately produce, restated
 * structurally.
 *
 * @see packages/command-bus/src/consequence.ts `UndeterminedReason` — the
 * authority. Only the producible member is named: a partial copy of a closed
 * union that lists members it never emits is a fork waiting to happen.
 */
export type RoomStoreUndeterminedReason = 'RELATIONSHIP_NOT_READABLE';

/**
 * The answer to "what rooms does this project hold?", with the determination
 * status carried in the TYPE rather than inferred from a length.
 *
 * `[]` is representable ONLY through the `determined` arm, so C71 §4.4 —
 * *"`[]` may only ever mean zero results"* — holds by construction rather than
 * by a caller remembering to check.
 */
export type RoomStoreDetermination =
    | {
        readonly kind: 'determined';
        /**
         * MAY be empty. An empty DETERMINED set is a real answer: the store was
         * read successfully and this project genuinely holds no rooms.
         */
        readonly rooms: readonly RoomData[];
    }
    | {
        readonly kind: 'undetermined';
        readonly reason: RoomStoreUndeterminedReason;
        /** WHAT question went unanswered, for a card, a log line or a prompt. */
        readonly scope: string;
        /** WHICH of the two unreadable cases, in words. Never parsed. */
        readonly detail: string;
    };

/** Minimal structural shape this reader needs; deliberately not `MinRoomStore`. */
interface MaybeRoomStore {
    getAll?: unknown;
}

/**
 * THE room-store read discriminator. Replaces
 * `try { return store.getAll?.() ?? []; } catch { return []; }`.
 *
 * - **`getAll` present and returns an array** → `determined`, WHATEVER its
 *   length. An empty project is a real answer and must not be refused.
 * - **store absent / null** → `undetermined`. Nothing was read.
 * - **store present but has no callable `getAll`** → `undetermined`. This is the
 *   case the `as any` cast at the call site hid from the compiler.
 * - **`getAll` THREW** → `undetermined`. A throw is "I could not look" by
 *   definition; converting it to `[]` asserts a different fact entirely.
 * - **`getAll` returned a non-array** (including `undefined`, which the old
 *   `?? []` silently absorbed) → `undetermined`.
 *
 * TOTAL: never throws, so callers need no try/catch — which is what would
 * rebuild the very defect this closes.
 */
export function readRoomsDetermined(
    store: unknown,
    scope = 'roomStore.getAll',
): RoomStoreDetermination {
    if (store === null || store === undefined) {
        return {
            kind: 'undetermined', reason: 'RELATIONSHIP_NOT_READABLE', scope,
            detail: 'the room store dependency is absent (null/undefined) — nothing was read',
        };
    }
    const fn = (store as MaybeRoomStore).getAll;
    if (typeof fn !== 'function') {
        return {
            kind: 'undetermined', reason: 'RELATIONSHIP_NOT_READABLE', scope,
            detail: 'the room store carries no callable `getAll` — the dependency is mis-wired ' +
                'or partially constructed, and an `as any` cast at the call site hid it from the compiler',
        };
    }
    let raw: unknown;
    try {
        raw = (fn as () => unknown).call(store);
    } catch (err) {
        return {
            kind: 'undetermined', reason: 'RELATIONSHIP_NOT_READABLE', scope,
            detail: 'roomStore.getAll() threw: ' + (err instanceof Error ? err.message : String(err)),
        };
    }
    if (!Array.isArray(raw)) {
        return {
            kind: 'undetermined', reason: 'RELATIONSHIP_NOT_READABLE', scope,
            detail: 'roomStore.getAll() returned ' + (raw === undefined ? 'undefined' : typeof raw) +
                ', not an array — the old `?? []` absorbed this silently',
        };
    }
    return { kind: 'determined', rooms: raw as readonly RoomData[] };
}
