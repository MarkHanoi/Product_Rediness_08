/**
 * StairSnapProvider
 *
 * Snap provider for stair elements.
 *
 * Snap targets (per stair):
 *   • startPosition                            (ENDPOINT)
 *   • Computed end of each flight segment      (ENDPOINT)
 *   • startPosition midpoint to first end      (MIDPOINT)
 *
 * The full stair geometry (flights + landings) can be complex. This provider
 * uses the stored flight directions and riser counts to estimate flight endpoints
 * without requiring the full StairMeshBuilder.
 *
 * Contract: §B.2 (ISnapProvider), §5.1.3 (null-guard), §5.1.4 (optional subscribe)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { ISnapProvider, SnapCandidate, SnapType, DEFAULT_SNAP_PRIORITIES } from '../types';

interface Vec3 { x: number; y: number; z: number; }

interface MinFlight {
    direction: Vec3;
    riserCount: number;
    startOverride?: Vec3;
}

interface MinStair {
    id: string;
    startPosition: Vec3;
    width: number;
    riserHeight: number;
    treadDepth: number;
    flights: MinFlight[];
}

interface MinStairStore {
    getAll(): MinStair[];
    subscribe?(listener: (...args: any[]) => void): () => void;
}

interface SnapTarget {
    point: THREE.Vector3;
    type: SnapType;
    priority: number;
    sourceId: string;
    label: string;
}

export class StairSnapProvider implements ISnapProvider {
    readonly providerType = 'stair';

    private _stairStore: MinStairStore;
    private _targets: SnapTarget[] = [];
    private _unsub?: () => void;

    constructor(stairStore: MinStairStore) {
        this._stairStore = stairStore;
        this._unsub = stairStore.subscribe?.(() => this._rebuildIndex());
        this._rebuildIndex();
    }

    private _rebuildIndex(): void {
        this._targets = [];

        const ep = DEFAULT_SNAP_PRIORITIES[SnapType.ENDPOINT];
        const mp = DEFAULT_SNAP_PRIORITIES[SnapType.MIDPOINT];

        for (const stair of this._stairStore.getAll()) {
            const s = stair.startPosition;
            const startPt = new THREE.Vector3(s.x, s.y, s.z);

            this._targets.push(
                { point: startPt.clone(), type: SnapType.ENDPOINT, priority: ep, sourceId: stair.id, label: 'stairStart' },
            );

            let cursor = startPt.clone();

            for (let fi = 0; fi < stair.flights.length; fi++) {
                const flight = stair.flights[fi];
                if (!flight?.direction) continue;

                const start3 = flight.startOverride
                    ? new THREE.Vector3(flight.startOverride.x, flight.startOverride.y, flight.startOverride.z)
                    : cursor.clone();

                const dir = new THREE.Vector3(flight.direction.x, flight.direction.y, flight.direction.z);
                const dirLen = dir.length();
                if (dirLen < 0.001) continue;
                dir.divideScalar(dirLen);

                const run    = stair.treadDepth * flight.riserCount;
                const rise   = stair.riserHeight * flight.riserCount;
                const horDir = new THREE.Vector3(dir.x, 0, dir.z).normalize();

                const flightEnd = new THREE.Vector3(
                    start3.x + horDir.x * run,
                    start3.y + rise,
                    start3.z + horDir.z * run,
                );

                this._targets.push(
                    { point: flightEnd.clone(), type: SnapType.ENDPOINT, priority: ep, sourceId: stair.id, label: `stairFlight${fi}End` },
                    { point: new THREE.Vector3(
                        (start3.x + flightEnd.x) * 0.5,
                        (start3.y + flightEnd.y) * 0.5,
                        (start3.z + flightEnd.z) * 0.5,
                    ), type: SnapType.MIDPOINT, priority: mp, sourceId: stair.id, label: `stairFlight${fi}Mid` },
                );

                cursor = flightEnd;
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
            out.push({ point: t.point.clone(), type: t.type, priority: t.priority, distance: Math.sqrt(d2), sourceId: t.sourceId, sourceType: 'stair', metadata: { label: t.label } });
        }
        return out;
    }

    update(): void { this._rebuildIndex(); }

    dispose(): void {
        this._unsub?.();
        this._targets = [];
    }
}
