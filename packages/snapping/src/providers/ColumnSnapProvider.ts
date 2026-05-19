/**
 * ColumnSnapProvider
 *
 * Snap provider for concrete and circular columns
 * (steel UC/UB columns are handled separately by SteelSnapProvider).
 *
 * Snap targets:
 *   Rectangular columns: base-center, top-center, 4 corner bases, 4 corner tops,
 *                        4 base edge midpoints
 *   Circular columns:    base-center, top-center, N/S/E/W quadrant points at base and top
 *
 * Contract: §B.2 (ISnapProvider), §5.1.3 (null-guard), §5.1.4 (optional subscribe)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { ISnapProvider, SnapCandidate, SnapType, DEFAULT_SNAP_PRIORITIES } from '../types';

interface MinColumn {
    id: string;
    position: { x: number; y: number; z: number };
    height: number;
    rotation: number;
    profile: 'rectangular' | 'circular' | 'UC' | 'UB';
    width: number;
    depth: number;
    baseOffset: number;
    steelProfileName?: string;
}

interface MinColumnStore {
    getAll(): MinColumn[];
    subscribe?(listener: () => void): () => void;
}

interface SnapTarget {
    point: THREE.Vector3;
    type: SnapType;
    priority: number;
    sourceId: string;
    label: string;
}

export class ColumnSnapProvider implements ISnapProvider {
    readonly providerType = 'column';

    private _columnStore: MinColumnStore;
    private _targets: SnapTarget[] = [];
    private _unsub?: () => void;

    constructor(columnStore: MinColumnStore) {
        this._columnStore = columnStore;
        this._unsub = columnStore.subscribe?.(() => this._rebuildIndex());
        this._rebuildIndex();
    }

    private _rebuildIndex(): void {
        this._targets = [];

        for (const col of this._columnStore.getAll()) {
            if (col.steelProfileName) continue;

            const baseY = col.position.y + (col.baseOffset ?? 0);
            const topY  = baseY + col.height;
            const cx    = col.position.x;
            const cz    = col.position.z;

            const ep = DEFAULT_SNAP_PRIORITIES[SnapType.ENDPOINT];
            const mp = DEFAULT_SNAP_PRIORITIES[SnapType.MIDPOINT];
            const cc = DEFAULT_SNAP_PRIORITIES[SnapType.CENTER];

            this._targets.push(
                { point: new THREE.Vector3(cx, baseY, cz), type: SnapType.ENDPOINT, priority: ep, sourceId: col.id, label: 'colBaseCenter' },
                { point: new THREE.Vector3(cx, topY,  cz), type: SnapType.ENDPOINT, priority: ep, sourceId: col.id, label: 'colTopCenter' },
                { point: new THREE.Vector3(cx, (baseY + topY) * 0.5, cz), type: SnapType.CENTER, priority: cc, sourceId: col.id, label: 'colMidCenter' },
            );

            const rot = col.rotation ?? 0;
            const cosR = Math.cos(rot);
            const sinR = Math.sin(rot);

            if (col.profile === 'rectangular') {
                const hw = col.width * 0.5;
                const hd = col.depth * 0.5;

                const localCorners = [
                    { lx: -hw, lz: -hd, label: 'SW' },
                    { lx:  hw, lz: -hd, label: 'SE' },
                    { lx:  hw, lz:  hd, label: 'NE' },
                    { lx: -hw, lz:  hd, label: 'NW' },
                ];

                for (const { lx, lz, label } of localCorners) {
                    const wx = cx + lx * cosR - lz * sinR;
                    const wz = cz + lx * sinR + lz * cosR;
                    this._targets.push(
                        { point: new THREE.Vector3(wx, baseY, wz), type: SnapType.ENDPOINT, priority: ep, sourceId: col.id, label: `colBase${label}` },
                        { point: new THREE.Vector3(wx, topY,  wz), type: SnapType.ENDPOINT, priority: ep, sourceId: col.id, label: `colTop${label}` },
                    );
                }

                const localEdgeMids = [
                    { lx: 0,   lz: -hd, label: 'S' },
                    { lx: hw,  lz: 0,   label: 'E' },
                    { lx: 0,   lz:  hd, label: 'N' },
                    { lx: -hw, lz: 0,   label: 'W' },
                ];

                for (const { lx, lz, label } of localEdgeMids) {
                    const wx = cx + lx * cosR - lz * sinR;
                    const wz = cz + lx * sinR + lz * cosR;
                    this._targets.push(
                        { point: new THREE.Vector3(wx, baseY, wz), type: SnapType.MIDPOINT, priority: mp, sourceId: col.id, label: `colBaseEdge${label}` },
                    );
                }

            } else if (col.profile === 'circular') {
                const r = col.width * 0.5;

                const quadrants = [
                    { dx: r,  dz: 0,  label: 'E' },
                    { dx: -r, dz: 0,  label: 'W' },
                    { dx: 0,  dz: r,  label: 'N' },
                    { dx: 0,  dz: -r, label: 'S' },
                ];

                for (const { dx, dz, label } of quadrants) {
                    this._targets.push(
                        { point: new THREE.Vector3(cx + dx, baseY, cz + dz), type: SnapType.EDGE, priority: DEFAULT_SNAP_PRIORITIES[SnapType.EDGE], sourceId: col.id, label: `colBase${label}` },
                        { point: new THREE.Vector3(cx + dx, topY,  cz + dz), type: SnapType.EDGE, priority: DEFAULT_SNAP_PRIORITIES[SnapType.EDGE], sourceId: col.id, label: `colTop${label}` },
                    );
                }
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
            out.push({ point: t.point.clone(), type: t.type, priority: t.priority, distance: Math.sqrt(d2), sourceId: t.sourceId, sourceType: 'column', metadata: { label: t.label } });
        }
        return out;
    }

    update(): void { this._rebuildIndex(); }

    dispose(): void {
        this._unsub?.();
        this._targets = [];
    }
}
