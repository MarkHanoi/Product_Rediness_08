/**
 * SlabSnapProvider
 *
 * Snap provider for slab/floor polygon boundaries.
 *
 * Snap targets:
 *   • Each polygon vertex   (ENDPOINT)
 *   • Each edge midpoint    (MIDPOINT)
 *
 * Note on Y-elevation:
 *   SlabData.position.y is always 0 (world Y comes from BimManager at render time).
 *   This provider uses position.y directly; for elevated slabs the Y will be 0
 *   in snap space. This is correct for plan-view dimensioning. Elevation/section
 *   annotations that need true height should snap to the level datum instead.
 *
 * Contract: §B.2 (ISnapProvider), §5.1.3 (null-guard), §5.1.4 (optional subscribe)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { ISnapProvider, SnapCandidate, SnapType, DEFAULT_SNAP_PRIORITIES } from '../types';

interface MinSlab {
    id: string;
    position: { x: number; y: number; z: number };
    polygon?: { x: number; y: number }[];
}

interface MinSlabStore {
    getAll(): MinSlab[];
    subscribe?(listener: (...args: any[]) => void): () => void;
}

interface SnapTarget {
    point: THREE.Vector3;
    type: SnapType;
    priority: number;
    sourceId: string;
    label: string;
}

export class SlabSnapProvider implements ISnapProvider {
    readonly providerType = 'slab';

    private _slabStore: MinSlabStore;
    private _targets: SnapTarget[] = [];
    private _unsub?: () => void;

    constructor(slabStore: MinSlabStore) {
        this._slabStore = slabStore;
        this._unsub = slabStore.subscribe?.(() => this._rebuildIndex());
        this._rebuildIndex();
    }

    private _rebuildIndex(): void {
        this._targets = [];

        for (const slab of this._slabStore.getAll()) {
            const poly = slab.polygon;
            if (!poly || poly.length < 2) continue;

            const ox = slab.position.x;
            const oy = slab.position.y;
            const oz = slab.position.z;

            const ep = DEFAULT_SNAP_PRIORITIES[SnapType.ENDPOINT];
            const mp = DEFAULT_SNAP_PRIORITIES[SnapType.MIDPOINT];

            for (let i = 0; i < poly.length; i++) {
                const a = poly[i]!;
                const b = poly[(i + 1) % poly.length]!;

                const ax = ox + a.x, az = oz + a.y;
                const bx = ox + b.x, bz = oz + b.y;

                this._targets.push(
                    { point: new THREE.Vector3(ax, oy, az), type: SnapType.ENDPOINT, priority: ep, sourceId: slab.id, label: `slabVtx${i}` },
                    { point: new THREE.Vector3((ax + bx) * 0.5, oy, (az + bz) * 0.5), type: SnapType.MIDPOINT, priority: mp, sourceId: slab.id, label: `slabEdgeMid${i}` },
                );
            }
        }
    }

    getCandidates(queryPoint: THREE.Vector3, radius: number, enabledTypes: Set<SnapType>): SnapCandidate[] {
        const out: SnapCandidate[] = [];
        const r2 = radius * radius;
        for (const t of this._targets) {
            if (!enabledTypes.has(t.type)) continue;
            const d2 = t.point.distanceToSquared(queryPoint);
            if (d2 > r2) continue;
            out.push({ point: t.point.clone(), type: t.type, priority: t.priority, distance: Math.sqrt(d2), sourceId: t.sourceId, sourceType: 'slab', metadata: { label: t.label } });
        }
        return out;
    }

    update(): void { this._rebuildIndex(); }

    dispose(): void {
        this._unsub?.();
        this._targets = [];
    }
}
