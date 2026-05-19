/**
 * DoorSnapProvider
 *
 * Snap provider for door openings hosted on walls.
 * Computes 3D snap points from the host wall baseline + door offset/width/height.
 *
 * Snap targets (per door):
 *   • Base left / base center / base right  (floor level of opening, ENDPOINT)
 *   • Sill level left / center / right      (at sillHeight, ENDPOINT)
 *   • Top left  / top center / top right    (at sillHeight + height, ENDPOINT)
 *   • Mid-height center                     (at sillHeight + height/2, MIDPOINT)
 *
 * OFFSET ENCODING (PLAN-09 — CENTER convention):
 *   door.offset = distance from baseLine[0] to CENTRE of opening.
 *   LEFT_EDGE  = offset − width/2
 *   RIGHT_EDGE = offset + width/2
 *
 * Contracts: §B.2 (ISnapProvider), §5.1.3 (null-guard), §5.1.4 (optional subscribe)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { ISnapProvider, SnapCandidate, SnapType, DEFAULT_SNAP_PRIORITIES } from '../types';

interface MinWall {
    id: string;
    baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
}

// §PERF-2026: subscribe() in this provider receives the typed (event, payload)
// signature emitted by WallStore/DoorStore, so we widen the listener type from
// the original `() => void` to allow the new incremental-update closure.
interface MinWallStore {
    getAll(): MinWall[];
    getById?(id: string): MinWall | undefined;
    subscribe?(listener: (...args: any[]) => void): () => void;
}

interface MinDoor {
    id: string;
    wallId: string;
    offset: number;
    width: number;
    height: number;
    sillHeight: number;
}

interface MinDoorStore {
    getAll(): MinDoor[];
    getById?(id: string): MinDoor | undefined;
    subscribe?(listener: (...args: any[]) => void): () => void;
}

interface SnapTarget {
    point: THREE.Vector3;
    type: SnapType;
    priority: number;
    sourceId: string;
    label: string;
}

export class DoorSnapProvider implements ISnapProvider {
    readonly providerType = 'door';

    private _doorStore: MinDoorStore;
    private _wallStore: MinWallStore;
    private _targets: SnapTarget[] = [];
    // §PERF-2026: per-door snap-target cache.  Keyed by door.id so a single
    // door / wall mutation can update only its own slice instead of dropping
    // and rebuilding every target on the level.
    private _targetsByDoor: Map<string, SnapTarget[]> = new Map();
    // Reverse index: wallId → set of doorIds hosted on that wall, so a wall
    // mutation only reprocesses the doors that depend on it.
    private _doorsByWall: Map<string, Set<string>> = new Map();
    private _unsubDoor?: () => void;
    private _unsubWall?: () => void;
    // Coalesce a burst of mutations within one tick into one flat-list rebuild.
    private _flushScheduled = false;

    constructor(doorStore: MinDoorStore, wallStore: MinWallStore) {
        this._doorStore = doorStore;
        this._wallStore = wallStore;
        this._unsubDoor = doorStore.subscribe?.((event: any, door: any) => {
            if (!door || !door.id) { this._rebuildIndex(); return; }
            if (event === 'remove') this._removeDoor(door.id);
            else                    this._upsertDoor(door);
        });
        this._unsubWall = wallStore.subscribe?.((_event: any, wall: any) => {
            if (!wall || !wall.id) { this._rebuildIndex(); return; }
            // A wall mutation only invalidates the doors hosted on it.
            const dependentDoorIds = this._doorsByWall.get(wall.id);
            if (!dependentDoorIds || dependentDoorIds.size === 0) return;
            for (const doorId of dependentDoorIds) {
                // §PERF-2026: O(1) door lookup via getById() (was O(N) find()).
                const door = this._doorStore.getById
                    ? this._doorStore.getById(doorId)
                    : this._doorStore.getAll().find(d => d.id === doorId);
                if (door) this._upsertDoor(door);
            }
        });
        this._rebuildIndex();
    }

    private _scheduleFlatten(): void {
        if (this._flushScheduled) return;
        this._flushScheduled = true;
        // Microtask — runs after the current synchronous mutation burst, before
        // any user interaction can read _targets again.
        Promise.resolve().then(() => {
            this._flushScheduled = false;
            this._flatten();
        });
    }

    private _flatten(): void {
        this._targets = [];
        for (const arr of this._targetsByDoor.values()) {
            for (const t of arr) this._targets.push(t);
        }
    }

    private _upsertDoor(door: MinDoor): void {
        // §PERF-2026: O(1) wall lookup via getById() (was O(N) find()).
        const wall = this._wallStore.getById
            ? this._wallStore.getById(door.wallId)
            : this._wallStore.getAll().find(w => w.id === door.wallId);
        if (!wall) {
            this._removeDoor(door.id);
            return;
        }
        // Maintain reverse index.
        const prevTargets = this._targetsByDoor.get(door.id);
        if (prevTargets && prevTargets.length > 0) {
            const prevWallId = prevTargets[0]!.sourceId === door.id
                ? this._findWallIdForDoor(door.id)
                : null;
            if (prevWallId && prevWallId !== door.wallId) {
                this._doorsByWall.get(prevWallId)?.delete(door.id);
            }
        }
        let bucket = this._doorsByWall.get(door.wallId);
        if (!bucket) {
            bucket = new Set<string>();
            this._doorsByWall.set(door.wallId, bucket);
        }
        bucket.add(door.id);

        this._targetsByDoor.set(door.id, this._buildTargetsForDoor(door, wall));
        this._scheduleFlatten();
    }

    private _findWallIdForDoor(_doorId: string): string | null {
        // Reverse-lookup helper used only on rebind.  Linear scan is fine here
        // because rebinds (a door changing its host wall) are rare.
        for (const [wallId, doorIds] of this._doorsByWall) {
            if (doorIds.has(_doorId)) return wallId;
        }
        return null;
    }

    private _removeDoor(doorId: string): void {
        if (!this._targetsByDoor.delete(doorId)) return;
        for (const set of this._doorsByWall.values()) set.delete(doorId);
        this._scheduleFlatten();
    }

    private _buildTargetsForDoor(door: MinDoor, wall: MinWall): SnapTarget[] {
        const out: SnapTarget[] = [];

        const s0 = wall.baseLine[0];
        const s1 = wall.baseLine[1];
        const start = new THREE.Vector3(s0.x, s0.y, s0.z);
        const end   = new THREE.Vector3(s1.x, s1.y, s1.z);
        const dir   = new THREE.Vector3().subVectors(end, start);
        const wallLen = dir.length();
        if (wallLen < 0.001) return out;
        dir.divideScalar(wallLen);

        const baseY = start.y;
        const centerH  = door.offset;
        const leftH    = centerH - door.width * 0.5;
        const rightH   = centerH + door.width * 0.5;

        const cx = start.x + dir.x * centerH;
        const cz = start.z + dir.z * centerH;
        const lx = start.x + dir.x * leftH;
        const lz = start.z + dir.z * leftH;
        const rx = start.x + dir.x * rightH;
        const rz = start.z + dir.z * rightH;

        const yBase = baseY;
        const ySill = baseY + door.sillHeight;
        const yTop  = baseY + door.sillHeight + door.height;
        const yMid  = baseY + door.sillHeight + door.height * 0.5;

        const ep = DEFAULT_SNAP_PRIORITIES[SnapType.ENDPOINT];
        const mp = DEFAULT_SNAP_PRIORITIES[SnapType.MIDPOINT];

        out.push(
            { point: new THREE.Vector3(lx, yBase, lz), type: SnapType.ENDPOINT, priority: ep, sourceId: door.id, label: 'doorLeftBase' },
            { point: new THREE.Vector3(cx, yBase, cz), type: SnapType.ENDPOINT, priority: ep, sourceId: door.id, label: 'doorCenterBase' },
            { point: new THREE.Vector3(rx, yBase, rz), type: SnapType.ENDPOINT, priority: ep, sourceId: door.id, label: 'doorRightBase' },
            { point: new THREE.Vector3(lx, ySill, lz), type: SnapType.ENDPOINT, priority: ep, sourceId: door.id, label: 'doorLeftSill' },
            { point: new THREE.Vector3(cx, ySill, cz), type: SnapType.ENDPOINT, priority: ep, sourceId: door.id, label: 'doorCenterSill' },
            { point: new THREE.Vector3(rx, ySill, rz), type: SnapType.ENDPOINT, priority: ep, sourceId: door.id, label: 'doorRightSill' },
            { point: new THREE.Vector3(lx, yTop, lz), type: SnapType.ENDPOINT, priority: ep, sourceId: door.id, label: 'doorLeftTop' },
            { point: new THREE.Vector3(cx, yTop, cz), type: SnapType.ENDPOINT, priority: ep, sourceId: door.id, label: 'doorCenterTop' },
            { point: new THREE.Vector3(rx, yTop, rz), type: SnapType.ENDPOINT, priority: ep, sourceId: door.id, label: 'doorRightTop' },
            { point: new THREE.Vector3(cx, yMid, cz), type: SnapType.MIDPOINT, priority: mp, sourceId: door.id, label: 'doorCenterMid' },
        );
        return out;
    }

    private _rebuildIndex(): void {
        // Full rebuild — used at construction and as a safety fallback when an
        // event arrives without a payload.  Routed through the per-door cache
        // so getCandidates() always reads from the same flat array regardless
        // of code path.
        this._targetsByDoor.clear();
        this._doorsByWall.clear();

        const wallMap = new Map<string, MinWall>();
        for (const w of this._wallStore.getAll()) wallMap.set(w.id, w);

        for (const door of this._doorStore.getAll()) {
            const wall = wallMap.get(door.wallId);
            if (!wall) continue;
            this._targetsByDoor.set(door.id, this._buildTargetsForDoor(door, wall));
            let bucket = this._doorsByWall.get(door.wallId);
            if (!bucket) {
                bucket = new Set<string>();
                this._doorsByWall.set(door.wallId, bucket);
            }
            bucket.add(door.id);
        }
        this._flatten();
    }

    getCandidates(queryPoint: THREE.Vector3, radius: number, enabledTypes: Set<SnapType>): SnapCandidate[] {
        const out: SnapCandidate[] = [];
        const r2 = radius * radius;
        for (const t of this._targets) {
            if (!enabledTypes.has(t.type)) continue;
            const d2 = t.point.distanceToSquared(queryPoint);
            if (d2 > r2) continue;
            out.push({ point: t.point.clone(), type: t.type, priority: t.priority, distance: Math.sqrt(d2), sourceId: t.sourceId, sourceType: 'door', metadata: { label: t.label } });
        }
        return out;
    }

    update(): void { this._rebuildIndex(); }

    dispose(): void {
        this._unsubDoor?.();
        this._unsubWall?.();
        this._targets = [];
    }
}
