/**
 * CurtainWallSnapProvider
 *
 * Snap provider for curtain wall segments.
 * Registers with SnapManager under providerType = 'curtain-wall'.
 *
 * ## Snap Types Provided
 *
 *   ENDPOINT     — start/end of each curtain wall baseLine
 *   MIDPOINT     — midpoint of each baseLine
 *   CENTERLINE   — closest point on the baseLine centreline (t 0.05–0.95)
 *   EDGE         — same as CENTERLINE but lower priority (nearest on line)
 *   INTERSECTION — intersection of any two curtain wall segments nearby
 *   PERPENDICULAR— perpendicular drop from drawing start point to any segment
 *
 * Curtain walls have no thickness, so FACE snaps are not applicable.
 *
 * ## Store Subscription
 *
 * The provider subscribes to CurtainWallStore changes and rebuilds its
 * spatial index automatically. The spatial index uses a 2.0 m cell size
 * (matching WallSnapProvider) for O(1) neighbourhood queries.
 *
 * ## Contract References
 *
 *   §02 §1.2  — baseLine coordinates used directly (Y ignored for 2D snap)
 *   Issue 1   — closes the snap-infrastructure gap identified in audit 2026-03-31
 */

import * as THREE from '@pryzm/renderer-three/three';
import { ISnapProvider, SnapCandidate, SnapType, DEFAULT_SNAP_PRIORITIES } from '../types';
import { SpatialGrid } from '@pryzm/spatial-index';
import { GeometryUtils } from '../GeometryUtils';

interface CurtainWallSegment {
    id: string;
    start: THREE.Vector3;
    end: THREE.Vector3;
}

interface CurtainWallStoreLike {
    // P0.3 DTO Migration: baseLine is now [Point3D, Point3D] — plain {x,y,z} objects.
    // rebuildIndex() constructs THREE.Vector3 from these at snap-query time.
    getAll(): Array<{
        id: string;
        baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
    }>;
    subscribe?(listener: (event: string, cw: any) => void): () => void;
}

export class CurtainWallSnapProvider implements ISnapProvider {
    readonly providerType = 'curtain-wall';

    private cwStore: CurtainWallStoreLike;
    private spatialIndex: SpatialGrid<CurtainWallSegment>;
    private segments: Map<string, CurtainWallSegment> = new Map();
    private unsubscribe?: () => void;

    constructor(cwStore: CurtainWallStoreLike) {
        this.cwStore = cwStore;
        this.spatialIndex = new SpatialGrid<CurtainWallSegment>(2.0);
        this.rebuildIndex();

        if (cwStore.subscribe) {
            this.unsubscribe = cwStore.subscribe(() => {
                this.rebuildIndex();
            });
        }
    }

    private rebuildIndex(): void {
        this.spatialIndex.clear();
        this.segments.clear();

        const walls = this.cwStore.getAll();
        for (const cw of walls) {
            const segment: CurtainWallSegment = {
                id: cw.id,
                start: new THREE.Vector3(cw.baseLine[0].x, cw.baseLine[0].y, cw.baseLine[0].z),
                end:   new THREE.Vector3(cw.baseLine[1].x, cw.baseLine[1].y, cw.baseLine[1].z),
            };
            this.segments.set(cw.id, segment);

            const bounds = new THREE.Box3();
            bounds.expandByPoint(segment.start);
            bounds.expandByPoint(segment.end);
            bounds.expandByScalar(0.5); // generous margin for snapping

            this.spatialIndex.insert(segment, bounds);
        }
    }

    update(): void {
        this.rebuildIndex();
    }

    getCandidates(queryPoint: THREE.Vector3, radius: number, enabledTypes: Set<SnapType>): SnapCandidate[] {
        const candidates: SnapCandidate[] = [];
        const nearbySegments = this.spatialIndex.queryRadius(queryPoint, radius * 2);

        for (const seg of nearbySegments) {
            // ── ENDPOINT snaps ───────────────────────────────────────────────
            if (enabledTypes.has(SnapType.ENDPOINT)) {
                const startDist = queryPoint.distanceTo(seg.start);
                if (startDist <= radius) {
                    candidates.push({
                        point: seg.start.clone(),
                        type: SnapType.ENDPOINT,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.ENDPOINT],
                        distance: startDist,
                        sourceId: seg.id,
                        sourceType: 'curtain-wall',
                        metadata: { endpoint: 'start', curtainWallId: seg.id }
                    });
                }

                const endDist = queryPoint.distanceTo(seg.end);
                if (endDist <= radius) {
                    candidates.push({
                        point: seg.end.clone(),
                        type: SnapType.ENDPOINT,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.ENDPOINT],
                        distance: endDist,
                        sourceId: seg.id,
                        sourceType: 'curtain-wall',
                        metadata: { endpoint: 'end', curtainWallId: seg.id }
                    });
                }
            }

            // ── MIDPOINT snap ────────────────────────────────────────────────
            if (enabledTypes.has(SnapType.MIDPOINT)) {
                const mid = GeometryUtils.getMidpoint(seg.start, seg.end);
                const midDist = queryPoint.distanceTo(mid);
                if (midDist <= radius) {
                    candidates.push({
                        point: mid,
                        type: SnapType.MIDPOINT,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.MIDPOINT],
                        distance: midDist,
                        sourceId: seg.id,
                        sourceType: 'curtain-wall',
                        metadata: { curtainWallId: seg.id }
                    });
                }
            }

            // ── CENTERLINE snap ──────────────────────────────────────────────
            // Snaps to the closest point on the curtain wall segment centreline.
            // Excluded near endpoints (t < 0.05 / t > 0.95).
            if (enabledTypes.has(SnapType.CENTERLINE)) {
                const result = GeometryUtils.pointToLineDistance2D(queryPoint, seg.start, seg.end);
                if (result.distance <= radius && result.t > 0.05 && result.t < 0.95) {
                    candidates.push({
                        point: result.closestPoint,
                        type: SnapType.CENTERLINE,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.CENTERLINE],
                        distance: result.distance,
                        sourceId: seg.id,
                        sourceType: 'curtain-wall',
                        metadata: { t: result.t, curtainWallId: seg.id, refType: 'centerline' }
                    });
                }
            }

            // ── EDGE snap ────────────────────────────────────────────────────
            if (enabledTypes.has(SnapType.NEAREST) || enabledTypes.has(SnapType.EDGE)) {
                const result = GeometryUtils.pointToLineDistance2D(queryPoint, seg.start, seg.end);
                if (result.distance <= radius && result.t > 0.05 && result.t < 0.95) {
                    candidates.push({
                        point: result.closestPoint,
                        type: SnapType.EDGE,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.EDGE],
                        distance: result.distance,
                        sourceId: seg.id,
                        sourceType: 'curtain-wall',
                        metadata: { t: result.t, curtainWallId: seg.id }
                    });
                }
            }
        }

        // ── INTERSECTION snaps ───────────────────────────────────────────────
        if (enabledTypes.has(SnapType.INTERSECTION) && nearbySegments.length > 1) {
            for (let i = 0; i < nearbySegments.length; i++) {
                for (let j = i + 1; j < nearbySegments.length; j++) {
                    const seg1 = nearbySegments[i]!;
                    const seg2 = nearbySegments[j]!;
                    const intersection = GeometryUtils.lineLineIntersection2D(
                        seg1.start, seg1.end,
                        seg2.start, seg2.end
                    );
                    if (intersection) {
                        const dist = queryPoint.distanceTo(intersection);
                        if (dist <= radius) {
                            candidates.push({
                                point: intersection,
                                type: SnapType.INTERSECTION,
                                priority: DEFAULT_SNAP_PRIORITIES[SnapType.INTERSECTION],
                                distance: dist,
                                sourceId: `${seg1.id}:${seg2.id}`,
                                sourceType: 'curtain-wall-intersection',
                                metadata: { cw1: seg1.id, cw2: seg2.id }
                            });
                        }
                    }
                }
            }
        }

        return candidates;
    }

    /**
     * Perpendicular candidates: the foot of a perpendicular from `fromPoint`
     * to each nearby curtain wall segment.
     */
    getPerpendicularCandidates(
        fromPoint: THREE.Vector3,
        queryPoint: THREE.Vector3,
        radius: number
    ): SnapCandidate[] {
        const candidates: SnapCandidate[] = [];
        const nearbySegments = this.spatialIndex.queryRadius(queryPoint, radius * 3);

        for (const seg of nearbySegments) {
            const perpPoint = GeometryUtils.getPerpendicularPoint(fromPoint, seg.start, seg.end);
            if (perpPoint) {
                const dist = queryPoint.distanceTo(perpPoint);
                if (dist <= radius) {
                    candidates.push({
                        point: perpPoint,
                        type: SnapType.PERPENDICULAR,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.PERPENDICULAR],
                        distance: dist,
                        sourceId: seg.id,
                        sourceType: 'curtain-wall',
                        metadata: { fromPoint: fromPoint.clone(), curtainWallId: seg.id }
                    });
                }
            }
        }

        return candidates;
    }

    dispose(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        this.spatialIndex.clear();
        this.segments.clear();
    }
}
