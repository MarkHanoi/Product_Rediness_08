import * as THREE from '@pryzm/renderer-three/three';
import { ISnapProvider, SnapCandidate, SnapType, DEFAULT_SNAP_PRIORITIES } from '../types';
import { SpatialGrid } from '@pryzm/spatial-index';
import { GeometryUtils } from '../GeometryUtils';

interface WallSegment {
    id: string;
    start: THREE.Vector3;
    end: THREE.Vector3;
    thickness: number;
}

interface WallStore {
    getAll(): Array<{
        id: string;
        baseLine: [THREE.Vector3, THREE.Vector3];
        thickness: number;
    }>;
    subscribe?(listener: (event: string, wall: any) => void): () => void;
}

export class WallSnapProvider implements ISnapProvider {
    readonly providerType = 'wall';

    private wallStore: WallStore;
    private spatialIndex: SpatialGrid<WallSegment>;
    private segments: Map<string, WallSegment> = new Map();
    private unsubscribe?: () => void;

    constructor(wallStore: WallStore) {
        this.wallStore = wallStore;
        this.spatialIndex = new SpatialGrid<WallSegment>(2.0);
        this.rebuildIndex();

        if (wallStore?.subscribe) {
            // §PERF-2026: incremental index update.  The previous implementation
            // rebuilt the entire spatial index on every wall mutation, which
            // scaled O(N) per click and dominated pointermove cost above ~50
            // walls.  By using the typed event payload we now only touch the
            // single segment that actually changed.
            this.unsubscribe = wallStore.subscribe((event: any, wall: any) => {
                if (!wall || !wall.id) {
                    // Safety net — fall back to a full rebuild if the event
                    // arrived without a payload (legacy / unknown emitters).
                    this.rebuildIndex();
                    return;
                }
                if (event === 'remove') {
                    this._removeOne(wall.id);
                } else {
                    this._upsertOne(wall);
                }
            });
        }
    }

    private _buildSegment(wall: { id: string; baseLine: any; thickness: number }): WallSegment {
        return {
            id: wall.id,
            start: new THREE.Vector3(
                wall.baseLine[0].x,
                wall.baseLine[0].y,
                wall.baseLine[0].z,
            ),
            end: new THREE.Vector3(
                wall.baseLine[1].x,
                wall.baseLine[1].y,
                wall.baseLine[1].z,
            ),
            thickness: wall.thickness,
        };
    }

    private _segmentBounds(seg: WallSegment): THREE.Box3 {
        const bounds = new THREE.Box3();
        bounds.expandByPoint(seg.start);
        bounds.expandByPoint(seg.end);
        bounds.expandByScalar(seg.thickness / 2);
        return bounds;
    }

    private _upsertOne(wall: { id: string; baseLine: any; thickness: number }): void {
        // True per-segment update: SpatialGrid.insert() internally calls
        // remove(item) when the item is already indexed, so we only ever
        // touch O(cellsCovered) buckets — never the whole index.
        const prev = this.segments.get(wall.id);
        if (prev) this.spatialIndex.remove(prev);
        const segment = this._buildSegment(wall);
        this.segments.set(wall.id, segment);
        this.spatialIndex.insert(segment, this._segmentBounds(segment));
    }

    private _removeOne(wallId: string): void {
        const prev = this.segments.get(wallId);
        if (!prev) return;
        this.spatialIndex.remove(prev);
        this.segments.delete(wallId);
    }

    private rebuildIndex(): void {
        this.spatialIndex.clear();
        this.segments.clear();

        if (!this.wallStore) return;
        const walls = this.wallStore.getAll();
        for (const wall of walls) {
            const segment = this._buildSegment(wall as any);
            this.segments.set(wall.id, segment);
            this.spatialIndex.insert(segment, this._segmentBounds(segment));
        }
    }

    update(): void {
        this.rebuildIndex();
    }

    getCandidates(queryPoint: THREE.Vector3, radius: number, enabledTypes: Set<SnapType>): SnapCandidate[] {
        const candidates: SnapCandidate[] = [];
        const nearbySegments = this.spatialIndex.queryRadius(queryPoint, radius * 2);

        for (const segment of nearbySegments) {
            const dir = new THREE.Vector3().subVectors(segment.end, segment.start).normalize();
            // Perpendicular (outward-left normal) in XZ
            const perpDir = new THREE.Vector3(-dir.z, 0, dir.x);

            // ── ENDPOINT snaps ────────────────────────────────────────────────
            if (enabledTypes.has(SnapType.ENDPOINT)) {
                const startDist = queryPoint.distanceTo(segment.start);
                if (startDist <= radius) {
                    candidates.push({
                        point: segment.start.clone(),
                        type: SnapType.ENDPOINT,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.ENDPOINT],
                        distance: startDist,
                        sourceId: segment.id,
                        sourceType: 'wall',
                        metadata: { endpoint: 'start', wallId: segment.id }
                    });
                }

                const endDist = queryPoint.distanceTo(segment.end);
                if (endDist <= radius) {
                    candidates.push({
                        point: segment.end.clone(),
                        type: SnapType.ENDPOINT,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.ENDPOINT],
                        distance: endDist,
                        sourceId: segment.id,
                        sourceType: 'wall',
                        metadata: { endpoint: 'end', wallId: segment.id }
                    });
                }
            }

            // ── MIDPOINT snap ─────────────────────────────────────────────────
            if (enabledTypes.has(SnapType.MIDPOINT)) {
                const midpoint = GeometryUtils.getMidpoint(segment.start, segment.end);
                const midDist = queryPoint.distanceTo(midpoint);
                if (midDist <= radius) {
                    candidates.push({
                        point: midpoint,
                        type: SnapType.MIDPOINT,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.MIDPOINT],
                        distance: midDist,
                        sourceId: segment.id,
                        sourceType: 'wall',
                        metadata: { wallId: segment.id }
                    });
                }
            }

            // ── CENTERLINE snap (Revit: "Wall Centerline" / Location Line) ───
            // Snaps to the wall's centreline at the closest body point.
            // Excluded near endpoints (t<0.05 / t>0.95) so it doesn't compete with ENDPOINT.
            if (enabledTypes.has(SnapType.CENTERLINE)) {
                const result = GeometryUtils.pointToLineDistance2D(queryPoint, segment.start, segment.end);
                if (result.distance <= radius && result.t > 0.05 && result.t < 0.95) {
                    candidates.push({
                        point: result.closestPoint,
                        type: SnapType.CENTERLINE,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.CENTERLINE],
                        distance: result.distance,
                        sourceId: segment.id,
                        sourceType: 'wall',
                        metadata: { t: result.t, wallId: segment.id, refType: 'centerline' }
                    });
                }
            }

            // ── EDGE snap (nearest point — kept for general use) ──────────────
            if (enabledTypes.has(SnapType.NEAREST) || enabledTypes.has(SnapType.EDGE)) {
                const result = GeometryUtils.pointToLineDistance2D(queryPoint, segment.start, segment.end);
                if (result.distance <= radius && result.t > 0.05 && result.t < 0.95) {
                    candidates.push({
                        point: result.closestPoint,
                        type: SnapType.EDGE,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.EDGE],
                        distance: result.distance,
                        sourceId: segment.id,
                        sourceType: 'wall',
                        metadata: { t: result.t, wallId: segment.id }
                    });
                }
            }

            // ── FACE snaps (Revit: "Finish Face Interior / Exterior") ─────────
            // Snaps to the left or right face of the wall.
            // The face closer to the query point is labelled "near" (exterior for
            // exterior walls, interior for interior walls from the user's perspective).
            if (enabledTypes.has(SnapType.FACE)) {
                const perpOffset = segment.thickness / 2;

                for (const sign of [1, -1] as const) {
                    const faceLabel = sign > 0 ? 'face_left' : 'face_right';
                    const faceStart = segment.start.clone().add(perpDir.clone().multiplyScalar(perpOffset * sign));
                    const faceEnd   = segment.end.clone().add(perpDir.clone().multiplyScalar(perpOffset * sign));

                    const result = GeometryUtils.pointToLineDistance2D(queryPoint, faceStart, faceEnd);
                    if (result.distance <= radius) {
                        // Determine near/far face based on which side the query point is on
                        const toQuery = new THREE.Vector3().subVectors(queryPoint, result.closestPoint);
                        const sideSign = toQuery.dot(perpDir.clone().multiplyScalar(sign));
                        const facePosition = sideSign >= 0 ? 'near' : 'far';

                        candidates.push({
                            point: result.closestPoint,
                            type: SnapType.FACE,
                            priority: DEFAULT_SNAP_PRIORITIES[SnapType.FACE],
                            distance: result.distance,
                            sourceId: segment.id,
                            sourceType: 'wall',
                            metadata: {
                                face: faceLabel,
                                facePosition,
                                sign,
                                t: result.t,
                                wallId: segment.id,
                                refType: 'face'
                            }
                        });
                    }
                }
            }
        }

        // ── INTERSECTION snaps ─────────────────────────────────────────────────
        // Performance: only test pairs where BOTH segments are near the query point
        // (within 2× snap radius). Previously O(n²) over all walls.
        if (enabledTypes.has(SnapType.INTERSECTION)) {
            const nearbyArr = nearbySegments; // already spatially limited
            for (let i = 0; i < nearbyArr.length; i++) {
                for (let j = i + 1; j < nearbyArr.length; j++) {
                    const seg1 = nearbyArr[i]!;
                    const seg2 = nearbyArr[j]!;

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
                                sourceType: 'wall-intersection',
                                metadata: { wall1: seg1.id, wall2: seg2.id }
                            });
                        }
                    }
                }
            }
        }

        return candidates;
    }

    getPerpendicularCandidates(
        fromPoint: THREE.Vector3,
        queryPoint: THREE.Vector3,
        radius: number
    ): SnapCandidate[] {
        const candidates: SnapCandidate[] = [];
        const nearbySegments = this.spatialIndex.queryRadius(queryPoint, radius * 3);

        for (const segment of nearbySegments) {
            const perpPoint = GeometryUtils.getPerpendicularPoint(fromPoint, segment.start, segment.end);
            if (perpPoint) {
                const dist = queryPoint.distanceTo(perpPoint);
                if (dist <= radius) {
                    candidates.push({
                        point: perpPoint,
                        type: SnapType.PERPENDICULAR,
                        priority: DEFAULT_SNAP_PRIORITIES[SnapType.PERPENDICULAR],
                        distance: dist,
                        sourceId: segment.id,
                        sourceType: 'wall',
                        metadata: { fromPoint: fromPoint.clone(), wallId: segment.id }
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
