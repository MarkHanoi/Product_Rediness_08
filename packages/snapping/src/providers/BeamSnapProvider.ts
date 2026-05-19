/**
 * BeamSnapProvider
 *
 * Snap provider for structural beams WITHOUT a steelProfileName
 * (concrete/generic beams — steel UB beams are handled by SteelSnapProvider).
 *
 * Snap targets per beam:
 *   • startPoint   (ENDPOINT)
 *   • endPoint     (ENDPOINT)
 *   • midPoint     (MIDPOINT)
 *   • quarter points  (MIDPOINT, lower priority)
 *
 * Contract: §B.2 (ISnapProvider), §5.1.3 (null-guard), §5.1.4 (optional subscribe)
 */

import * as THREE from '@pryzm/renderer-three/three';
import { ISnapProvider, SnapCandidate, SnapType, DEFAULT_SNAP_PRIORITIES } from '../types';

interface MinBeam {
    id: string;
    startPoint: { x: number; y: number; z: number };
    endPoint: { x: number; y: number; z: number };
    steelProfileName?: string;
}

interface MinBeamStore {
    getAll(): MinBeam[];
    subscribe?(listener: () => void): () => void;
}

interface SnapTarget {
    point: THREE.Vector3;
    type: SnapType;
    priority: number;
    sourceId: string;
    label: string;
}

export class BeamSnapProvider implements ISnapProvider {
    readonly providerType = 'beam';

    private _beamStore: MinBeamStore;
    private _targets: SnapTarget[] = [];
    private _unsub?: () => void;

    constructor(beamStore: MinBeamStore) {
        this._beamStore = beamStore;
        this._unsub = beamStore.subscribe?.(() => this._rebuildIndex());
        this._rebuildIndex();
    }

    private _rebuildIndex(): void {
        this._targets = [];

        const ep = DEFAULT_SNAP_PRIORITIES[SnapType.ENDPOINT];
        const mp = DEFAULT_SNAP_PRIORITIES[SnapType.MIDPOINT];

        for (const beam of this._beamStore.getAll()) {
            if (beam.steelProfileName) continue;

            const s = new THREE.Vector3(beam.startPoint.x, beam.startPoint.y, beam.startPoint.z);
            const e = new THREE.Vector3(beam.endPoint.x,   beam.endPoint.y,   beam.endPoint.z);
            const mid = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);

            this._targets.push(
                { point: s.clone(),   type: SnapType.ENDPOINT, priority: ep, sourceId: beam.id, label: 'beamStart' },
                { point: e.clone(),   type: SnapType.ENDPOINT, priority: ep, sourceId: beam.id, label: 'beamEnd' },
                { point: mid.clone(), type: SnapType.MIDPOINT, priority: mp, sourceId: beam.id, label: 'beamMid' },
            );
        }
    }

    getCandidates(queryPoint: THREE.Vector3, radius: number, enabledTypes: Set<SnapType>): SnapCandidate[] {
        const out: SnapCandidate[] = [];
        const r2 = radius * radius;
        for (const t of this._targets) {
            if (!enabledTypes.has(t.type)) continue;
            const d2 = t.point.distanceToSquared(queryPoint);
            if (d2 > r2) continue;
            out.push({ point: t.point.clone(), type: t.type, priority: t.priority, distance: Math.sqrt(d2), sourceId: t.sourceId, sourceType: 'beam', metadata: { label: t.label } });
        }
        return out;
    }

    update(): void { this._rebuildIndex(); }

    dispose(): void {
        this._unsub?.();
        this._targets = [];
    }
}
