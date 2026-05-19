/**
 * FurnitureSnapProvider
 *
 * Snap provider for furniture elements.
 *
 * Snap targets (per furniture item, rotation-aware):
 *   • Center                        (CENTER)
 *   • 4 corners of bounding box     (ENDPOINT)
 *   • 4 edge midpoints              (MIDPOINT)
 *
 * Bounding box is computed from width (local X) and length (local Z), then
 * rotated by FurnitureData.rotation.y around the world Y axis.
 *
 * Contract: §B.2 (ISnapProvider), §5.1.3 (null-guard), §5.1.4 (optional subscribe)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { ISnapProvider, SnapCandidate, SnapType, DEFAULT_SNAP_PRIORITIES } from '../types';

interface EulerDTO { x: number; y: number; z: number; order?: string; }

interface MinFurniture {
    id: string;
    position: { x: number; y: number; z: number };
    rotation: EulerDTO;
    width: number;
    length: number;
    height: number;
}

interface MinFurnitureStore {
    getAll(): MinFurniture[];
    subscribe?(listener: (...args: any[]) => void): () => void;
}

interface SnapTarget {
    point: THREE.Vector3;
    type: SnapType;
    priority: number;
    sourceId: string;
    label: string;
}

export class FurnitureSnapProvider implements ISnapProvider {
    readonly providerType = 'furniture';

    private _furnitureStore: MinFurnitureStore;
    private _targets: SnapTarget[] = [];
    private _unsub?: () => void;

    constructor(furnitureStore: MinFurnitureStore) {
        this._furnitureStore = furnitureStore;
        this._unsub = furnitureStore.subscribe?.(() => this._rebuildIndex());
        this._rebuildIndex();
    }

    private _rebuildIndex(): void {
        this._targets = [];

        const ep = DEFAULT_SNAP_PRIORITIES[SnapType.ENDPOINT];
        const mp = DEFAULT_SNAP_PRIORITIES[SnapType.MIDPOINT];
        const cc = DEFAULT_SNAP_PRIORITIES[SnapType.CENTER];

        for (const furn of this._furnitureStore.getAll()) {
            const cx = furn.position.x;
            const cy = furn.position.y;
            const cz = furn.position.z;
            const rotY = furn.rotation?.y ?? 0;
            const cosR = Math.cos(rotY);
            const sinR = Math.sin(rotY);

            const hw = furn.width * 0.5;
            const hl = furn.length * 0.5;

            const project = (lx: number, lz: number) => ({
                x: cx + lx * cosR - lz * sinR,
                z: cz + lx * sinR + lz * cosR,
            });

            this._targets.push(
                { point: new THREE.Vector3(cx, cy, cz), type: SnapType.CENTER, priority: cc, sourceId: furn.id, label: 'furnCenter' },
            );

            const corners = [
                { lx: -hw, lz: -hl, label: 'SW' },
                { lx:  hw, lz: -hl, label: 'SE' },
                { lx:  hw, lz:  hl, label: 'NE' },
                { lx: -hw, lz:  hl, label: 'NW' },
            ];

            for (const { lx, lz, label } of corners) {
                const p = project(lx, lz);
                this._targets.push(
                    { point: new THREE.Vector3(p.x, cy, p.z), type: SnapType.ENDPOINT, priority: ep, sourceId: furn.id, label: `furn${label}` },
                );
            }

            const edgeMids = [
                { lx: 0,  lz: -hl, label: 'S' },
                { lx: hw, lz: 0,   label: 'E' },
                { lx: 0,  lz:  hl, label: 'N' },
                { lx:-hw, lz: 0,   label: 'W' },
            ];

            for (const { lx, lz, label } of edgeMids) {
                const p = project(lx, lz);
                this._targets.push(
                    { point: new THREE.Vector3(p.x, cy, p.z), type: SnapType.MIDPOINT, priority: mp, sourceId: furn.id, label: `furnEdge${label}` },
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
            out.push({ point: t.point.clone(), type: t.type, priority: t.priority, distance: Math.sqrt(d2), sourceId: t.sourceId, sourceType: 'furniture', metadata: { label: t.label } });
        }
        return out;
    }

    update(): void { this._rebuildIndex(); }

    dispose(): void {
        this._unsub?.();
        this._targets = [];
    }
}
