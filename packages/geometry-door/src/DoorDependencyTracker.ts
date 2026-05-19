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

export class DoorDependencyTracker {
    /** wallId → doorIds hosted on that wall */
    private graph = new Map<string, Set<string>>();
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
            if (event === 'update' && prev && this._wallGeometryChanged(prev, wall)) {
                const ids = this.graph.get(wall.id);
                if (ids && ids.size > 0) {
                    for (const doorId of ids) {
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
        // Remove from any previous bucket (handles wallId reassignment).
        for (const set of this.graph.values()) set.delete(doorId);
        let bucket = this.graph.get(wallId);
        if (!bucket) {
            bucket = new Set();
            this.graph.set(wallId, bucket);
        }
        bucket.add(doorId);
    }

    private unregister(doorId: string): void {
        for (const set of this.graph.values()) set.delete(doorId);
    }

    /** Build an initial dependency graph snapshot from all existing doors. */
    bootstrap(): void {
        for (const door of doorStore.getAll()) {
            this.register(door.id, door.wallId);
        }
    }

    /** Read-only access used by tests and cleanup handlers. */
    getDoorIdsForWall(wallId: string): string[] {
        return Array.from(this.graph.get(wallId) ?? []);
    }

    dispose(): void {
        this.unsubscribeWall?.();
        this.unsubscribeDoor?.();
        this.graph.clear();
    }
}
