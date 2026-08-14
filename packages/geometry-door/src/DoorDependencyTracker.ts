import { doorStore } from './DoorStore';
import type { WallStore } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';

/**
 * §DOOR-AUDIT-2026 P2 #12 — DoorDependencyTracker
 *
 * Mirrors `SlabDependencyTracker` for the door element type. Maintains a live
 * `wallId → Set<doorId>` index from the door store and reacts to host-wall
 * mutations:
 *
 *  - On wall `update`: ensure all hosted doors get rebuilt by triggering
 *    builder rebuild (the doorStore 'update' event is the canonical channel).
 *  - On wall `remove`: defer to the wall cascade — `WallStore.removeWall()`
 *    already iterates `childrenIds` and calls `removeDoor()`, which emits
 *    `doorStore.remove`. The tracker simply unregisters its index entries
 *    so memory does not leak across project lifetimes.
 *
 * §07 compliance: no window-global access. The tracker is constructed
 * with explicit references; it watches the wall store via `subscribe()`.
 */
/** Minimal duck-type — accepts any CommandManager without coupling to a specific declaration. */
export interface DoorTrackerCommandManagerRef {
    current: { execute: (cmd: any, metadata?: any) => any } | undefined;
}

type WallEventType = 'add' | 'update' | 'remove';
type WallStoreRef = Pick<WallStore, 'subscribe'>;

/**
 * §GR-10/GR-14 — the answer to "which doors hang on this wall?" WITH its
 * determination status. `[]` is representable only through the `determined`
 * arm, so C71 §4.4 (*"`[]` may only ever mean zero results"*) holds by
 * construction rather than by a caller remembering to check.
 *
 * `STALE_DERIVED_STATE` is the C78 §8.1 member, restated as a literal — the
 * union is CLOSED at eleven at `packages/command-bus/src/consequence.ts`;
 * nothing here mints, extends or renames. See
 * {@link DoorDependencyTracker.doorIdsForWallDetermination}.
 */
export type DoorTrackerDetermination =
    | { readonly kind: 'determined'; readonly doorIds: readonly string[] }
    | {
        readonly kind: 'undetermined';
        readonly reason: 'STALE_DERIVED_STATE';
        readonly detail: string;
    };

export class DoorDependencyTracker {
    /** wallId → doorIds hosted on that wall */
    private graph = new Map<string, Set<string>>();
    /**
     * §FIX-HOSTWALL-TRACKER-INDEX-QUADRATIC — doorId → the wallId bucket the door is
     * CURRENTLY filed under. The forward `graph` alone cannot answer "which bucket holds
     * this door?" without scanning every bucket, which made `register()`/`unregister()`
     * O(walls-with-openings) and therefore made `bootstrap()` and project-teardown
     * `clear()` O(doors × walls) — quadratic. This pointer makes both O(1).
     *
     * INVARIANT (must hold after EVERY mutation, mirroring the DoorStore `_byWall`
     * invariant): `home.get(d) === w`  ⟺  `graph.get(w)!.has(d)`. Empty buckets are
     * pruned, so `graph` never retains a wall key with a zero-size Set.
     */
    private home = new Map<string, string>();
    private unsubscribeWall?: () => void;
    private unsubscribeDoor?: () => void;

    constructor(_commandManagerRef: DoorTrackerCommandManagerRef, wallStore: WallStoreRef) {
        // Track door registration ⇄ deregistration into the dependency graph.
        this.unsubscribeDoor = doorStore.subscribe((event, door) => {
            if (event === 'add' || event === 'update') this.register(door.id, door.wallId);
            if (event === 'remove') this.unregister(door.id);
        });

        // React to host-wall lifecycle.
        this.unsubscribeWall = wallStore.subscribe((event: WallEventType, wall: WallData, prev?: WallData) => {
            if (event === 'remove') {
                // The wall cascade handles the actual delete; we only purge our index.
                // §FIX-HOSTWALL-TRACKER-INDEX-QUADRATIC — dropping the bucket alone left
                // every one of its doors pointing at a wall key that no longer exists, so
                // a later `register()` for that door would try to prune a bucket that had
                // already gone and the `home` ⟺ `graph` invariant would be false. Purge
                // both sides together.
                const gone = this.graph.get(wall.id);
                if (gone) { for (const doorId of gone) this.home.delete(doorId); }
                this.graph.delete(wall.id);
                return;
            }
            // §WALL-DEEP-2026 O2 (RESOLVED 2026-04-24) — wall→door cascade.
            //
            //   When a wall's geometry changes (baseLine, height, thickness),
            //   each hosted door's world position is now stale even though its
            //   own stored fields are unchanged. Re-emit a touch() so the
            //   DoorBuilder rebuilds the mesh at the new transform. See the
            //   matching block in WindowDependencyTracker for full rationale.
            //
            // §FIX-HOSTWALL-CASCADE-SET-REENTRANCY (L-250 / L-01 lineage — the
            // "move a wall that hosts a door → the whole app freezes" hang).
            //
            // `ids` is the LIVE index Set. `doorStore.touch()` re-emits a door
            // 'update' SYNCHRONOUSLY, which re-enters THIS tracker's own door
            // subscriber (:38-41) → `register()` → which DELETES the door id from
            // every bucket and RE-ADDS it. Deleting and re-inserting an element of
            // a `Set` **while a `for…of` is iterating it** appends the element at
            // the END of the iteration order, so the iterator visits it AGAIN —
            // for a single hosted door that is an unbounded loop that never
            // returns. It runs inside `wallStore.update()`'s synchronous listener
            // fan-out, i.e. inside `UpdateWallBaselineCommand.execute()`, which is
            // exactly why the founder's console ends on the CommandManager
            // snapshot line with no error and no further output.
            //
            // A bare wall never reaches it (`ids` is empty), which is why the
            // freeze is hosted-opening-specific.
            //
            // Fix: iterate a SNAPSHOT of the bucket — a plain array, finite by
            // construction, that a re-entrant index mutation cannot extend. The
            // set of doors to re-anchor is the set that was hosted when the wall
            // moved; that is precisely the snapshot.
            if (event === 'update' && prev && this._wallGeometryChanged(prev, wall)) {
                const ids = this.graph.get(wall.id);
                if (ids && ids.size > 0) {
                    for (const doorId of [...ids]) {
                        try { doorStore.touch(doorId); }
                        catch (err) { console.warn(`[DoorDependencyTracker] touch(${doorId}) failed:`, err); }
                    }
                }
            }
        });
    }

    /** §WALL-DEEP-2026 O2 — wall geometry change detector (mirrors WindowDependencyTracker). */
    private _wallGeometryChanged(prev: WallData, next: WallData): boolean {
        if (prev.height !== next.height) return true;
        if (prev.thickness !== next.thickness) return true;
        const a = prev.baseLine, b = next.baseLine;
        return (
            a[0].x !== b[0].x || a[0].y !== b[0].y || a[0].z !== b[0].z ||
            a[1].x !== b[1].x || a[1].y !== b[1].y || a[1].z !== b[1].z
        );
    }

    private register(doorId: string, wallId: string): void {
        // §FIX-HOSTWALL-CASCADE-SET-REENTRANCY — DEFENCE IN DEPTH (belt to the
        // snapshot's braces above). A re-registration that changes nothing must
        // not TOUCH the index at all: the delete-then-re-add below is only
        // meaningful when the door actually moved host wall. Every `touch()`
        // (the wall→door cascade, the builder re-anchor, an idempotent replay)
        // arrives here with the door ALREADY indexed under the same wall, so
        // this early return removes the re-entrant Set churn at its source —
        // any future caller that iterates a live bucket is safe by construction,
        // not merely by that caller's own discipline.
        //
        // §FIX-HOSTWALL-TRACKER-INDEX-QUADRATIC — the guard now reads the `home`
        // pointer rather than the bucket, which is the same answer (the invariant
        // makes them equivalent) at O(1) and without needing the bucket to exist.
        const current = this.home.get(doorId);
        if (current === wallId) return;
        // Remove from the previous bucket — O(1) via `home`, not an O(buckets) scan.
        if (current !== undefined) this._detach(doorId, current);
        let bucket = this.graph.get(wallId);
        if (!bucket) {
            bucket = new Set();
            this.graph.set(wallId, bucket);
        }
        bucket.add(doorId);
        this.home.set(doorId, wallId);
    }

    private unregister(doorId: string): void {
        const current = this.home.get(doorId);
        if (current === undefined) return;
        this._detach(doorId, current);
    }

    /** §FIX-HOSTWALL-TRACKER-INDEX-QUADRATIC — O(1) bucket detach, pruning empties. */
    private _detach(doorId: string, wallId: string): void {
        const bucket = this.graph.get(wallId);
        if (bucket) {
            bucket.delete(doorId);
            if (bucket.size === 0) this.graph.delete(wallId);
        }
        this.home.delete(doorId);
    }

    /**
     * §GR-10/GR-14 — has {@link bootstrap} ever run on this instance?
     *
     * Not a diagnostic nicety: an un-bootstrapped tracker's index is EMPTY, and
     * every read off it returns `[]` — indistinguishable from "this wall hosts no
     * doors". `check-move-propagation`'s PC1 control exists for the identical
     * shape one element type over: *"with `tracker.bootstrap()` called, the
     * identical wall move must produce exactly 1 rebuild"* — the slab tracker's
     * wire was cut in two places and the symptom was silence.
     */
    private _bootstrapped = false;

    /** Build an initial dependency graph snapshot from all existing doors. */
    bootstrap(): void {
        for (const door of doorStore.getAll()) {
            this.register(door.id, door.wallId);
        }
        this._bootstrapped = true;
    }

    /**
     * §GR-10/GR-14 — "which doors hang on this wall?", with the determination
     * status in the TYPE rather than inferred from a length.
     *
     * THE DEFECT THIS ENDS. `getDoorIdsForWall` used to be
     * `Array.from(this.graph.get(wallId) ?? [])`, and returned `[]` for two
     * cases that are not the same fact:
     *   (1) the index was read and this wall genuinely hosts no doors;
     *   (2) THE INDEX WAS NEVER POPULATED — `bootstrap()` was not called and no
     *       door event has fired since construction — so nothing was ever
     *       recorded and `[]` is not an answer about the building at all.
     * Case (2) is not hypothetical: it is exactly the failure
     * `check-move-propagation` pins for the SLAB tracker, whose wire was found
     * cut in two places. Its only symptom is a correct-looking empty array.
     *
     * The disagreement is DETECTABLE, and this method detects it rather than
     * asserting it: the authoritative source is `doorStore`, so an index that is
     * empty while the store holds doors is provably out of date with
     * authoritative state — `STALE_DERIVED_STATE`, the C78 §8.1 member whose
     * definition is exactly *"the derived state this branch reads is known to be
     * out of date with authoritative state, so an answer would be a guess."*
     * (Restated as a literal, not imported: `@pryzm/command-bus` is not a
     * declared dependency of `@pryzm/geometry-door`, the same call the four
     * sibling determination modules made. The test pins it against the
     * command-bus source and asserts the union is still closed at eleven.)
     *
     * An empty store and an empty index AGREE, so that is `determined` and empty
     * — refusing there would be the mirror-image defect.
     */
    doorIdsForWallDetermination(wallId: string): DoorTrackerDetermination {
        if (!this._bootstrapped && this.graph.size === 0 && doorStore.getAll().length > 0) {
            return {
                kind: 'undetermined',
                reason: 'STALE_DERIVED_STATE',
                detail: `the door dependency index is empty while doorStore holds ` +
                    `${doorStore.getAll().length} door(s) and bootstrap() has never run — ` +
                    `nothing was ever indexed, so "no doors on this wall" would be a guess`,
            };
        }
        const bucket = this.graph.get(wallId);
        return { kind: 'determined', doorIds: bucket ? Array.from(bucket) : [] };
    }

    /**
     * Read-only access used by tests and cleanup handlers.
     *
     * RETAINED at its original signature so every existing caller compiles and
     * behaves identically. It is now a NARROWING of
     * {@link doorIdsForWallDetermination} rather than a second, rival read — the
     * distinction is preserved there for any caller that needs the truth, which
     * is what it never was before.
     */
    getDoorIdsForWall(wallId: string): string[] {
        const d = this.doorIdsForWallDetermination(wallId);
        return d.kind === 'determined' ? d.doorIds : [];
    }

    dispose(): void {
        this.unsubscribeWall?.();
        this.unsubscribeDoor?.();
        this.graph.clear();
        this.home.clear();
    }
}
