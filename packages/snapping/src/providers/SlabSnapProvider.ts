/**
 * SlabSnapProvider
 *
 * Snap provider for slab/floor polygon boundaries.
 *
 * §FEAT-SLAB-CORNER-REFS — cross-level shell reference.
 *   When a user draws walls on an UPPER floor, PRYZM offers the corners (and
 *   edge midpoints / edge nearest-points) of that floor's slab(s) as snap
 *   candidates. The upper-floor slab footprint is typically defined by the
 *   walls of the floor below, so snapping to slab corners lets the new walls
 *   line up exactly with the shell beneath them — a Revit-like reference the
 *   platform previously lacked.
 *
 * Snap targets (per slab polygon):
 *   • Each polygon vertex        (ENDPOINT)  — the slab corners.
 *   • Each edge midpoint         (MIDPOINT)
 *   • Nearest point on each edge (EDGE)      — snap ALONG the slab boundary.
 *
 * Level gating:
 *   When constructed with a `getActiveLevelId` accessor, only slabs whose
 *   `levelId` matches the active draw level contribute candidates. This keeps
 *   the reference scoped to the floor being drawn on (you snap to THIS floor's
 *   slab, not every slab in the model). When no accessor is supplied, or it
 *   returns null/undefined, all slabs contribute (backwards-compatible).
 *
 * Note on Y-elevation:
 *   SlabData.position.y is always 0 (world Y comes from BimManager at render
 *   time). Candidate points are emitted at position.y directly (0 in snap
 *   space). Wall-draw picking happens on the active level's ground plane, so
 *   the XZ of the candidate is what aligns the wall to the slab corner; the Y
 *   is normalised by the tool at commit time. Distance tests are done in the
 *   full 3-D metric but the draw plane and candidates share the same Y, so
 *   this is exact for the plan-view draw flow.
 *
 * Contract: C06 §snapping, §B.2 (ISnapProvider), §5.1.3 (null-guard),
 *           §5.1.4 (optional subscribe). ADR-0112.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { ISnapProvider, SnapCandidate, SnapType, DEFAULT_SNAP_PRIORITIES } from '../types';

interface MinSlab {
    id: string;
    levelId?: string;
    position: { x: number; y: number; z: number };
    polygon?: { x: number; y: number }[];
}

interface MinSlabStore {
    getAll(): MinSlab[];
    subscribe?(listener: (...args: any[]) => void): () => void;
}

/** §FEAT-SLAB-CORNER-REFS — lazy accessor for the level currently being drawn on. */
type ActiveLevelAccessor = () => string | null | undefined;

interface SlabEdge {
    a: THREE.Vector3;      // corner A (world)
    b: THREE.Vector3;      // corner B (world)
    mid: THREE.Vector3;
    slabId: string;
    index: number;
}

interface SlabTargets {
    levelId?: string;
    corners: { point: THREE.Vector3; slabId: string; index: number }[];
    edges: SlabEdge[];
}

export class SlabSnapProvider implements ISnapProvider {
    readonly providerType = 'slab';

    private _slabStore: MinSlabStore;
    private _getActiveLevelId?: ActiveLevelAccessor;
    private _slabs: SlabTargets[] = [];
    private _unsub?: () => void;

    /**
     * @param slabStore         Store exposing getAll()/subscribe().
     * @param getActiveLevelId  §FEAT-SLAB-CORNER-REFS — optional accessor that
     *   returns the level id being drawn on. When present, only that level's
     *   slabs are offered as references. Read lazily on every getCandidates()
     *   so a level switch takes effect without re-registering the provider.
     */
    constructor(slabStore: MinSlabStore, getActiveLevelId?: ActiveLevelAccessor) {
        this._slabStore = slabStore;
        this._getActiveLevelId = getActiveLevelId;
        this._unsub = slabStore.subscribe?.(() => this._rebuildIndex());
        this._rebuildIndex();
    }

    private _rebuildIndex(): void {
        this._slabs = [];

        for (const slab of this._slabStore.getAll()) {
            const poly = slab.polygon;
            if (!poly || poly.length < 2) continue;

            const ox = slab.position.x;
            const oy = slab.position.y;
            const oz = slab.position.z;

            const corners: SlabTargets['corners'] = [];
            const edges: SlabEdge[] = [];

            for (let i = 0; i < poly.length; i++) {
                const a = poly[i]!;
                const b = poly[(i + 1) % poly.length]!;

                const av = new THREE.Vector3(ox + a.x, oy, oz + a.y);
                const bv = new THREE.Vector3(ox + b.x, oy, oz + b.y);

                corners.push({ point: av.clone(), slabId: slab.id, index: i });
                edges.push({
                    a: av,
                    b: bv,
                    mid: new THREE.Vector3((av.x + bv.x) * 0.5, oy, (av.z + bv.z) * 0.5),
                    slabId: slab.id,
                    index: i,
                });
            }

            this._slabs.push({ levelId: slab.levelId, corners, edges });
        }
    }

    /**
     * §FEAT-SLAB-CORNER-REFS — nearest point on segment a→b to `p`, XZ metric.
     * Returns the clamped closest point (never past an endpoint, so it never
     * competes with the ENDPOINT corner candidate near the corners).
     */
    private static _closestOnEdge(p: THREE.Vector3, e: SlabEdge): { point: THREE.Vector3; t: number } {
        const abx = e.b.x - e.a.x;
        const abz = e.b.z - e.a.z;
        const lenSq = abx * abx + abz * abz;
        if (lenSq < 1e-9) return { point: e.a.clone(), t: 0 };
        let t = ((p.x - e.a.x) * abx + (p.z - e.a.z) * abz) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return {
            point: new THREE.Vector3(e.a.x + abx * t, e.a.y, e.a.z + abz * t),
            t,
        };
    }

    getCandidates(queryPoint: THREE.Vector3, radius: number, enabledTypes: Set<SnapType>): SnapCandidate[] {
        const out: SnapCandidate[] = [];
        const r2 = radius * radius;

        // §FEAT-SLAB-CORNER-REFS — level gate, read lazily so a level switch
        // takes effect immediately. When no active level is known, fall through
        // to all slabs (backwards-compatible plan dimensioning behaviour).
        const activeLevelId = this._getActiveLevelId?.();

        const ep = DEFAULT_SNAP_PRIORITIES[SnapType.ENDPOINT];
        const mp = DEFAULT_SNAP_PRIORITIES[SnapType.MIDPOINT];
        const edgeP = DEFAULT_SNAP_PRIORITIES[SnapType.EDGE];

        const wantEndpoint = enabledTypes.has(SnapType.ENDPOINT);
        const wantMidpoint = enabledTypes.has(SnapType.MIDPOINT);
        const wantEdge = enabledTypes.has(SnapType.EDGE) || enabledTypes.has(SnapType.NEAREST);

        for (const slab of this._slabs) {
            if (activeLevelId != null && slab.levelId != null && slab.levelId !== activeLevelId) {
                continue;
            }

            if (wantEndpoint) {
                for (const c of slab.corners) {
                    const d2 = c.point.distanceToSquared(queryPoint);
                    if (d2 > r2) continue;
                    out.push({
                        point: c.point.clone(),
                        type: SnapType.ENDPOINT,
                        priority: ep,
                        distance: Math.sqrt(d2),
                        sourceId: c.slabId,
                        sourceType: 'slab',
                        metadata: { label: `slabCorner${c.index}`, refType: 'slab-corner', slabId: c.slabId },
                    });
                }
            }

            if (wantMidpoint) {
                for (const e of slab.edges) {
                    const d2 = e.mid.distanceToSquared(queryPoint);
                    if (d2 > r2) continue;
                    out.push({
                        point: e.mid.clone(),
                        type: SnapType.MIDPOINT,
                        priority: mp,
                        distance: Math.sqrt(d2),
                        sourceId: e.slabId,
                        sourceType: 'slab',
                        metadata: { label: `slabEdgeMid${e.index}`, refType: 'slab-edge-mid', slabId: e.slabId },
                    });
                }
            }

            if (wantEdge) {
                for (const e of slab.edges) {
                    const { point, t } = SlabSnapProvider._closestOnEdge(queryPoint, e);
                    // Exclude the ends so EDGE never shadows the higher-priority
                    // corner ENDPOINT candidate right at a corner.
                    if (t <= 0.02 || t >= 0.98) continue;
                    const d2 = point.distanceToSquared(queryPoint);
                    if (d2 > r2) continue;
                    out.push({
                        point,
                        type: SnapType.EDGE,
                        priority: edgeP,
                        distance: Math.sqrt(d2),
                        sourceId: e.slabId,
                        sourceType: 'slab',
                        metadata: { label: `slabEdge${e.index}`, refType: 'slab-edge', slabId: e.slabId, t },
                    });
                }
            }
        }

        return out;
    }

    update(): void { this._rebuildIndex(); }

    dispose(): void {
        this._unsub?.();
        this._slabs = [];
    }
}
