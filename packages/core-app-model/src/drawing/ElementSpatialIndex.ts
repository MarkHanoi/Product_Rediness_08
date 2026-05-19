import * as THREE from '@pryzm/renderer-three/three';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';

export interface ElementSpatialIndexEntry {
    elementId: string;
    object: THREE.Object3D;
    minY: number;
    maxY: number;
}

const _box = new THREE.Box3();

function getElementId(obj: THREE.Object3D): string | null {
    return (
        obj.userData?.elementId ??
        obj.userData?.id ??
        obj.uuid ??
        null
    ) as string | null;
}

function measureObjectY(obj: THREE.Object3D): { minY: number; maxY: number } | null {
    _box.setFromObject(obj);
    if (_box.isEmpty()) return null;
    return { minY: _box.min.y, maxY: _box.max.y };
}

export class ElementSpatialIndex {
    private _scene: THREE.Scene | null = null;
    private _entriesById = new Map<string, ElementSpatialIndexEntry>();
    private _sortedByMaxY: ElementSpatialIndexEntry[] = [];
    private _dirty = true;
    private _unsubscribe: (() => void) | null = null;
    /**
     * Disposer for the upsert-coalesce frame-scheduler subscription.
     *
     * Wave 7 S85.D-finish.4 (2026-04-30 evening): replaces the prior
     * `_rafHandle: number | null`. The upsert pump now uses
     * `getFrameScheduler().scheduleOnce('element-spatial-index-upsert', cb)`
     * (default `'post-render'` priority — the spatial index reads from
     * the scene graph AFTER it has been mutated by this frame's render).
     *
     * Coalescing semantic preserved: a non-null `_upsertDispose` means a
     * frame is already queued and `scheduleUpsert` only adds to the
     * pending set without re-scheduling.
     */
    private _upsertDispose: TickListenerDisposer | null = null;
    private _pendingUpserts = new Set<string>();

    bindScene(scene: THREE.Scene): void {
        if (this._scene === scene) return;
        this._scene = scene;
        this.rebuild(scene);
        if (!this._unsubscribe) {
            this._unsubscribe = storeEventBus.subscribe(event => {
                if (event.operation === 'delete') {
                    this.remove(event.elementId);
                    return;
                }
                this.scheduleUpsert(event.elementId);
            });
        }
    }

    rebuild(scene: THREE.Scene = this._scene as THREE.Scene): void {
        if (!scene) return;
        this._scene = scene;
        this._entriesById.clear();
        scene.traverse(obj => {
            if (!obj.userData?.elementType) return;
            this.upsertObject(obj);
        });
        this._dirty = true;
        this._ensureSorted();
    }

    upsert(elementId: string): void {
        const root = elementRegistry.getRoot(elementId);
        if (!root) return;
        this.upsertObject(root, elementId);
    }

    upsertObject(obj: THREE.Object3D, forcedElementId?: string): void {
        const elementId = forcedElementId ?? getElementId(obj);
        if (!elementId) return;
        const measured = measureObjectY(obj);
        if (!measured) {
            this.remove(elementId);
            return;
        }
        this._entriesById.set(elementId, { elementId, object: obj, ...measured });
        this._dirty = true;
    }

    remove(elementId: string): void {
        if (this._entriesById.delete(elementId)) {
            this._dirty = true;
        }
    }

    queryVisible(depthY: number, topY: number): string[] {
        this._ensureSorted();
        const minY = Math.min(depthY, topY);
        const maxY = Math.max(depthY, topY);
        const start = this._firstMaxYAtLeast(minY);
        const result: string[] = [];
        for (let i = start; i < this._sortedByMaxY.length; i++) {
            const entry = this._sortedByMaxY[i]!;
            if (entry.minY <= maxY) result.push(entry.elementId);
        }
        return result;
    }

    getEntry(elementId: string): ElementSpatialIndexEntry | undefined {
        return this._entriesById.get(elementId);
    }

    get size(): number {
        return this._entriesById.size;
    }

    get entries(): readonly ElementSpatialIndexEntry[] {
        return Array.from(this._entriesById.values());
    }

    dispose(): void {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        if (this._upsertDispose !== null) {
            this._upsertDispose();
            this._upsertDispose = null;
        }
        this._entriesById.clear();
        this._sortedByMaxY = [];
        this._scene = null;
        this._dirty = true;
    }

    private scheduleUpsert(elementId: string): void {
        this._pendingUpserts.add(elementId);
        if (this._upsertDispose !== null) return;
        this._upsertDispose = getFrameScheduler().scheduleOnce(
            'element-spatial-index-upsert',
            () => {
                this._upsertDispose = null;
                const ids = Array.from(this._pendingUpserts);
                this._pendingUpserts.clear();
                for (const id of ids) this.upsert(id);
            },
        );
    }

    private _ensureSorted(): void {
        if (!this._dirty) return;
        this._sortedByMaxY = Array.from(this._entriesById.values())
            .sort((a, b) => a.maxY - b.maxY);
        this._dirty = false;
    }

    private _firstMaxYAtLeast(minY: number): number {
        let lo = 0;
        let hi = this._sortedByMaxY.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this._sortedByMaxY[mid]!.maxY < minY) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }
}

export const elementSpatialIndex = new ElementSpatialIndex();