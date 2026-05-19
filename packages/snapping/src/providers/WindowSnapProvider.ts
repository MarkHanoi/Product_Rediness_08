/**
 * WindowSnapProvider
 *
 * Snap provider for window openings hosted on walls.
 * Mirrors DoorSnapProvider with window-specific geometry:
 *   sillHeight = bottom of glass pane above floor
 *   height     = vertical extent of the glazed area
 *
 * Snap targets (per window):
 *   • Base left / center / right at floor level        (ENDPOINT)
 *   • Sill left / center / right at sillHeight         (ENDPOINT)
 *   • Top  left / center / right at sillHeight+height  (ENDPOINT)
 *   • Mid-height center                                 (MIDPOINT)
 *
 * OFFSET ENCODING (PLAN-09 CENTER convention):
 *   window.offset = distance from baseLine[0] to CENTRE of opening.
 *
 * Contracts: §B.2 (ISnapProvider), §5.1.3 (null-guard), §5.1.4 (optional subscribe)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { ISnapProvider, SnapCandidate, SnapType, DEFAULT_SNAP_PRIORITIES } from '../types';

interface MinWall {
    id: string;
    baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
}

// §PERF-2026: widened listener type — see DoorSnapProvider for rationale.
interface MinWallStore {
    getAll(): MinWall[];
    getById?(id: string): MinWall | undefined;
    subscribe?(listener: (...args: any[]) => void): () => void;
}

interface MinWindow {
    id: string;
    wallId: string;
    offset: number;
    width: number;
    height: number;
    sillHeight: number;
}

interface MinWindowStore {
    getAll(): MinWindow[];
    getById?(id: string): MinWindow | undefined;
    subscribe?(listener: (...args: any[]) => void): () => void;
}

interface SnapTarget {
    point: THREE.Vector3;
    type: SnapType;
    priority: number;
    sourceId: string;
    label: string;
}

export class WindowSnapProvider implements ISnapProvider {
    readonly providerType = 'window';

    private _windowStore: MinWindowStore;
    private _wallStore: MinWallStore;
    private _targets: SnapTarget[] = [];
    // §PERF-2026: per-window snap-target cache.
    private _targetsByWindow: Map<string, SnapTarget[]> = new Map();
    private _windowsByWall: Map<string, Set<string>> = new Map();
    private _unsubWindow?: () => void;
    private _unsubWall?: () => void;
    private _flushScheduled = false;

    constructor(windowStore: MinWindowStore, wallStore: MinWallStore) {
        this._windowStore = windowStore;
        this._wallStore   = wallStore;
        this._unsubWindow = windowStore.subscribe?.((event: any, win: any) => {
            if (!win || !win.id) { this._rebuildIndex(); return; }
            if (event === 'remove') this._removeWindow(win.id);
            else                    this._upsertWindow(win);
        });
        this._unsubWall = wallStore.subscribe?.((_event: any, wall: any) => {
            if (!wall || !wall.id) { this._rebuildIndex(); return; }
            const dependentWinIds = this._windowsByWall.get(wall.id);
            if (!dependentWinIds || dependentWinIds.size === 0) return;
            for (const winId of dependentWinIds) {
                // §PERF-2026: O(1) window lookup via getById() (was O(N) find()).
                const win = this._windowStore.getById
                    ? this._windowStore.getById(winId)
                    : this._windowStore.getAll().find(w => w.id === winId);
                if (win) this._upsertWindow(win);
            }
        });
        this._rebuildIndex();
    }

    private _scheduleFlatten(): void {
        if (this._flushScheduled) return;
        this._flushScheduled = true;
        Promise.resolve().then(() => {
            this._flushScheduled = false;
            this._flatten();
        });
    }

    private _flatten(): void {
        this._targets = [];
        for (const arr of this._targetsByWindow.values()) {
            for (const t of arr) this._targets.push(t);
        }
    }

    private _upsertWindow(win: MinWindow): void {
        // §PERF-2026: O(1) wall lookup via getById() (was O(N) find()).
        const wall = this._wallStore.getById
            ? this._wallStore.getById(win.wallId)
            : this._wallStore.getAll().find(w => w.id === win.wallId);
        if (!wall) {
            this._removeWindow(win.id);
            return;
        }
        // Maintain reverse index — handle host-wall rebind.
        for (const [wallId, set] of this._windowsByWall) {
            if (set.has(win.id) && wallId !== win.wallId) set.delete(win.id);
        }
        let bucket = this._windowsByWall.get(win.wallId);
        if (!bucket) {
            bucket = new Set<string>();
            this._windowsByWall.set(win.wallId, bucket);
        }
        bucket.add(win.id);

        this._targetsByWindow.set(win.id, this._buildTargetsForWindow(win, wall));
        this._scheduleFlatten();
    }

    private _removeWindow(winId: string): void {
        if (!this._targetsByWindow.delete(winId)) return;
        for (const set of this._windowsByWall.values()) set.delete(winId);
        this._scheduleFlatten();
    }

    private _buildTargetsForWindow(win: MinWindow, wall: MinWall): SnapTarget[] {
        const out: SnapTarget[] = [];

        const s0 = wall.baseLine[0];
        const s1 = wall.baseLine[1];
        const start = new THREE.Vector3(s0.x, s0.y, s0.z);
        const end   = new THREE.Vector3(s1.x, s1.y, s1.z);
        const dir   = new THREE.Vector3().subVectors(end, start);
        const wallLen = dir.length();
        if (wallLen < 0.001) return out;
        dir.divideScalar(wallLen);

        const baseY    = start.y;
        const centerH  = win.offset;
        const leftH    = centerH - win.width * 0.5;
        const rightH   = centerH + win.width * 0.5;

        const cx = start.x + dir.x * centerH;
        const cz = start.z + dir.z * centerH;
        const lx = start.x + dir.x * leftH;
        const lz = start.z + dir.z * leftH;
        const rx = start.x + dir.x * rightH;
        const rz = start.z + dir.z * rightH;

        const yBase = baseY;
        const ySill = baseY + win.sillHeight;
        const yTop  = baseY + win.sillHeight + win.height;
        const yMid  = baseY + win.sillHeight + win.height * 0.5;

        const ep = DEFAULT_SNAP_PRIORITIES[SnapType.ENDPOINT];
        const mp = DEFAULT_SNAP_PRIORITIES[SnapType.MIDPOINT];

        out.push(
            { point: new THREE.Vector3(lx, yBase, lz), type: SnapType.ENDPOINT, priority: ep, sourceId: win.id, label: 'winLeftBase' },
            { point: new THREE.Vector3(cx, yBase, cz), type: SnapType.ENDPOINT, priority: ep, sourceId: win.id, label: 'winCenterBase' },
            { point: new THREE.Vector3(rx, yBase, rz), type: SnapType.ENDPOINT, priority: ep, sourceId: win.id, label: 'winRightBase' },
            { point: new THREE.Vector3(lx, ySill, lz), type: SnapType.ENDPOINT, priority: ep, sourceId: win.id, label: 'winLeftSill' },
            { point: new THREE.Vector3(cx, ySill, cz), type: SnapType.ENDPOINT, priority: ep, sourceId: win.id, label: 'winCenterSill' },
            { point: new THREE.Vector3(rx, ySill, rz), type: SnapType.ENDPOINT, priority: ep, sourceId: win.id, label: 'winRightSill' },
            { point: new THREE.Vector3(lx, yTop, lz), type: SnapType.ENDPOINT, priority: ep, sourceId: win.id, label: 'winLeftTop' },
            { point: new THREE.Vector3(cx, yTop, cz), type: SnapType.ENDPOINT, priority: ep, sourceId: win.id, label: 'winCenterTop' },
            { point: new THREE.Vector3(rx, yTop, rz), type: SnapType.ENDPOINT, priority: ep, sourceId: win.id, label: 'winRightTop' },
            { point: new THREE.Vector3(cx, yMid, cz), type: SnapType.MIDPOINT, priority: mp, sourceId: win.id, label: 'winCenterMid' },
        );
        return out;
    }

    private _rebuildIndex(): void {
        this._targetsByWindow.clear();
        this._windowsByWall.clear();

        const wallMap = new Map<string, MinWall>();
        for (const w of this._wallStore.getAll()) wallMap.set(w.id, w);

        for (const win of this._windowStore.getAll()) {
            const wall = wallMap.get(win.wallId);
            if (!wall) continue;
            this._targetsByWindow.set(win.id, this._buildTargetsForWindow(win, wall));
            let bucket = this._windowsByWall.get(win.wallId);
            if (!bucket) {
                bucket = new Set<string>();
                this._windowsByWall.set(win.wallId, bucket);
            }
            bucket.add(win.id);
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
            out.push({ point: t.point.clone(), type: t.type, priority: t.priority, distance: Math.sqrt(d2), sourceId: t.sourceId, sourceType: 'window', metadata: { label: t.label } });
        }
        return out;
    }

    update(): void { this._rebuildIndex(); }

    dispose(): void {
        this._unsubWindow?.();
        this._unsubWall?.();
        this._targets = [];
    }
}
