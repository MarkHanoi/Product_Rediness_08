import { windowStore } from './WindowStore';
import type { WallStore } from '@pryzm/geometry-wall';
import type { WallData } from '@pryzm/geometry-wall';

/**
 * §WIN-AUDIT-2026 W9 — WindowDependencyTracker
 *
 * Mirrors the door tracker. Maintains `wallId → Set<windowId>` and reacts to
 * host-wall lifecycle events. The wall cascade owns destructive removal; this
 * tracker is a lightweight index used by the level-cleanup handler and any
 * future per-element observers.
 */
/** Minimal duck-type — accepts any CommandManager without coupling to a specific declaration. */
export interface WindowTrackerCommandManagerRef {
    current: { execute: (cmd: any, metadata?: any) => any } | undefined;
}

type WallEventType = 'add' | 'update' | 'remove';
type WallStoreRef = Pick<WallStore, 'subscribe'>;

export class WindowDependencyTracker {
    private graph = new Map<string, Set<string>>();
    /**
     * §FIX-HOSTWALL-TRACKER-INDEX-QUADRATIC — windowId → the wallId bucket it is
     * currently filed under. Twin of the DoorDependencyTracker pointer; see the long
     * note there. Turns `register()` / `unregister()` from an O(walls-with-openings)
     * bucket scan into O(1), which is what makes `bootstrap()` and project-teardown
     * `clear()` linear instead of quadratic.
     *
     * INVARIANT: `home.get(w) === wall`  ⟺  `graph.get(wall)!.has(w)`; empty buckets pruned.
     */
    private home = new Map<string, string>();
    private unsubscribeWall?: () => void;
    private unsubscribeWindow?: () => void;

    constructor(_commandManagerRef: WindowTrackerCommandManagerRef, wallStore: WallStoreRef) {
        this.unsubscribeWindow = windowStore.subscribe((event, win) => {
            if (event === 'add' || event === 'update') this.register(win.id, win.wallId);
            if (event === 'remove') this.unregister(win.id);
        });

        this.unsubscribeWall = wallStore.subscribe((event: WallEventType, wall: WallData, prev?: WallData) => {
            if (event === 'remove') {
                // §FIX-HOSTWALL-TRACKER-INDEX-QUADRATIC — purge BOTH sides of the index
                // together, or the dropped bucket's windows keep a `home` pointer to a
                // wall key that no longer exists.
                const gone = this.graph.get(wall.id);
                if (gone) { for (const winId of gone) this.home.delete(winId); }
                this.graph.delete(wall.id);
                return;
            }
            // §WALL-DEEP-2026 O2 (RESOLVED 2026-04-24) — wall→window cascade.
            //
            //   When a wall's geometry changes (baseLine endpoints, height, or
            //   thickness), every hosted window must re-render at the new world
            //   position even though its own stored fields are unchanged. The
            //   window's mesh transform is derived from the wall, so without
            //   this cascade the window stays glued to the wall's old position
            //   until the user manually edits a window field.
            //
            //   We call `windowStore.touch(id)` for each hosted window, which
            //   re-emits an idempotent 'update' event that WindowBuilder picks
            //   up via its own subscription and rebuilds the mesh.
            //
            // §FIX-HOSTWALL-CASCADE-SET-REENTRANCY (L-250 / L-01 lineage) — the
            // twin of the DoorDependencyTracker fix; see the long note there.
            // `ids` is the LIVE index Set and `windowStore.touch()` synchronously
            // re-enters this tracker's own window subscriber → `register()` →
            // delete + re-add of the id being iterated → the `for…of` visits it
            // again forever, inside `wallStore.update()`'s listener fan-out.
            // Iterate a SNAPSHOT: finite by construction.
            if (event === 'update' && prev && this._wallGeometryChanged(prev, wall)) {
                const ids = this.graph.get(wall.id);
                if (ids && ids.size > 0) {
                    for (const winId of [...ids]) {
                        try { windowStore.touch(winId); }
                        catch (err) { console.warn(`[WindowDependencyTracker] touch(${winId}) failed:`, err); }
                    }
                }
            }
        });
    }

    /**
     * §WALL-DEEP-2026 O2 — geometry-change detector.
     *
     * Returns true if any wall field that affects hosted-opening world
     * placement has changed: the two baseLine endpoints (planar XZ + y),
     * height, or thickness. Layer / metadata / side-classification edits
     * intentionally do NOT trigger a rebuild because they cannot move an
     * opening's world position.
     */
    private _wallGeometryChanged(prev: WallData, next: WallData): boolean {
        if (prev.height !== next.height) return true;
        if (prev.thickness !== next.thickness) return true;
        const a = prev.baseLine, b = next.baseLine;
        return (
            a[0].x !== b[0].x || a[0].y !== b[0].y || a[0].z !== b[0].z ||
            a[1].x !== b[1].x || a[1].y !== b[1].y || a[1].z !== b[1].z
        );
    }

    private register(windowId: string, wallId: string): void {
        // §FIX-HOSTWALL-CASCADE-SET-REENTRANCY — DEFENCE IN DEPTH. A
        // re-registration that changes nothing must not mutate the index: the
        // delete-then-re-add below is only meaningful on a genuine host-wall
        // reassignment. Every idempotent `touch()` arrives already indexed under
        // the same wall, so this early return removes the re-entrant Set churn at
        // its source. (Twin of the DoorDependencyTracker guard.)
        //
        // §FIX-HOSTWALL-TRACKER-INDEX-QUADRATIC — read the O(1) `home` pointer instead
        // of probing the bucket, and detach from the previous bucket directly instead of
        // scanning every bucket.
        const current = this.home.get(windowId);
        if (current === wallId) return;
        if (current !== undefined) this._detach(windowId, current);
        let bucket = this.graph.get(wallId);
        if (!bucket) {
            bucket = new Set();
            this.graph.set(wallId, bucket);
        }
        bucket.add(windowId);
        this.home.set(windowId, wallId);
    }

    private unregister(windowId: string): void {
        const current = this.home.get(windowId);
        if (current === undefined) return;
        this._detach(windowId, current);
    }

    /** §FIX-HOSTWALL-TRACKER-INDEX-QUADRATIC — O(1) bucket detach, pruning empties. */
    private _detach(windowId: string, wallId: string): void {
        const bucket = this.graph.get(wallId);
        if (bucket) {
            bucket.delete(windowId);
            if (bucket.size === 0) this.graph.delete(wallId);
        }
        this.home.delete(windowId);
    }

    bootstrap(): void {
        for (const win of windowStore.getAll()) {
            this.register(win.id, win.wallId);
        }
    }

    getWindowIdsForWall(wallId: string): string[] {
        return Array.from(this.graph.get(wallId) ?? []);
    }

    dispose(): void {
        this.unsubscribeWall?.();
        this.unsubscribeWindow?.();
        this.graph.clear();
        this.home.clear();
    }
}
