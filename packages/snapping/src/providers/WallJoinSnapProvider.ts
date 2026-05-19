/**
 * WallJoinSnapProvider
 *
 * Direction-aware wall join snapping, approximating Revit's "snap to wall face
 * along drawing direction" behaviour.
 *
 * When the user is drawing a wall (activeStartPoint is set) and moves the cursor
 * toward an existing wall, this provider detects where the current drawing ray
 * intersects each nearby wall's FACE lines and offers snap candidates there.
 *
 * This is complementary to WallSnapProvider (which provides endpoint / midpoint /
 * centreline snaps regardless of drawing direction).
 *
 * Contract compliance:
 *  - Pure read — no store writes, no scene access.
 *  - Implements ISnapProvider (UI / Tools layer).
 *  - New file — does not modify any existing provider.
 */

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

export class WallJoinSnapProvider implements ISnapProvider {
    readonly providerType = 'wall-join';

    private wallStore: WallStore;
    private spatialIndex: SpatialGrid<WallSegment>;
    private segments: Map<string, WallSegment> = new Map();
    private unsubscribe?: () => void;

    /** The current drawing start point (set by SnapManager). */
    private activeStartPoint: THREE.Vector3 | null = null;

    /**
     * Minimum drawing ray length before join-snap activates.
     * Below this distance the direction is too uncertain.
     */
    private static readonly MIN_RAY_LENGTH = 0.1;

    /**
     * How far (metres) from the cursor a candidate face-intersection must be
     * to be offered as a snap.  Slightly wider than the normal snapRadius to
     * ensure join candidates are presented while drawing toward a far wall.
     */
    private static readonly CANDIDATE_RADIUS_MULTIPLIER = 2.0;

    constructor(wallStore: WallStore) {
        this.wallStore = wallStore;
        this.spatialIndex = new SpatialGrid<WallSegment>(2.0);
        this.rebuildIndex();

        if (wallStore?.subscribe) {
            // §PERF-2026: incremental index update — see WallSnapProvider for
            // rationale. Replaces full O(N) rebuild on every wall mutation
            // with a per-segment insert/remove.
            this.unsubscribe = wallStore.subscribe((event: any, wall: any) => {
                if (!wall || !wall.id) {
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

    // ISnapProvider.onContextChange — called by SnapManager.setActiveStartPoint
    onContextChange(startPoint: THREE.Vector3 | null): void {
        this.activeStartPoint = startPoint ? startPoint.clone() : null;
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
        bounds.expandByScalar(seg.thickness / 2 + 0.5);
        return bounds;
    }

    private _upsertOne(wall: { id: string; baseLine: any; thickness: number }): void {
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
        if (!enabledTypes.has(SnapType.WALL_JOIN)) return [];
        if (!this.activeStartPoint) return [];

        const rayStart = this.activeStartPoint;
        const rawDir = new THREE.Vector3().subVectors(queryPoint, rayStart);
        rawDir.y = 0;

        if (rawDir.length() < WallJoinSnapProvider.MIN_RAY_LENGTH) return [];

        const rayDir = rawDir.clone().normalize();
        const candidates: SnapCandidate[] = [];

        // Search a wider radius — walls may be farther than the snap radius
        const searchRadius = Math.max(
            queryPoint.distanceTo(rayStart) * 1.2,
            radius * WallJoinSnapProvider.CANDIDATE_RADIUS_MULTIPLIER
        );
        const nearbySegments = this.spatialIndex.queryRadius(queryPoint, searchRadius);

        for (const segment of nearbySegments) {
            const segDir  = new THREE.Vector3().subVectors(segment.end, segment.start).normalize();
            const perpDir = new THREE.Vector3(-segDir.z, 0, segDir.x); // left normal of segment

            // ── For each face (left/right) of the wall ────────────────────────
            for (const sign of [1, -1] as const) {
                const halfT = segment.thickness / 2;
                const faceOffset = perpDir.clone().multiplyScalar(halfT * sign);

                // Face line endpoints
                const faceStart = segment.start.clone().add(faceOffset);
                const faceEnd   = segment.end.clone().add(faceOffset);

                // Face plane in 2D (XZ):
                //   plane normal = perpDir * sign (points outward)
                //   plane point  = midpoint of face
                const faceMid    = faceStart.clone().lerp(faceEnd, 0.5);
                const faceNormal = perpDir.clone().multiplyScalar(sign);

                // Intersect the drawing ray with the face plane ───────────────
                const denom = faceNormal.dot(rayDir);

                // Only consider faces whose normal opposes the drawing direction
                // (i.e., we're heading into the face, not away from it).
                if (denom >= 0) continue; // face is behind or parallel

                const toFace = new THREE.Vector3().subVectors(faceMid, rayStart);
                const t = toFace.dot(faceNormal) / denom;

                if (t < 0) continue; // intersection is behind start

                const hitPoint = rayStart.clone().addScaledVector(rayDir, t);
                hitPoint.y = queryPoint.y; // keep at level elevation

                // Check the hit point lies within the face segment (with a small tolerance)
                const faceProjResult = GeometryUtils.pointToLineDistance2D(hitPoint, faceStart, faceEnd);
                if (faceProjResult.t < -0.01 || faceProjResult.t > 1.01) continue;

                const distToQuery = hitPoint.distanceTo(queryPoint);
                if (distToQuery > radius * WallJoinSnapProvider.CANDIDATE_RADIUS_MULTIPLIER) continue;

                // Determine join type from the approach geometry:
                //   - If hitting the face near the segment body → T-join candidate
                //   - Metadata lets WallTool / UI show the appropriate indicator
                const isNearEndpoint =
                    hitPoint.distanceTo(segment.start) < segment.thickness ||
                    hitPoint.distanceTo(segment.end)   < segment.thickness;

                const joinType = isNearEndpoint ? 'corner' : 't-join';

                candidates.push({
                    point: hitPoint,
                    type: SnapType.WALL_JOIN,
                    priority: DEFAULT_SNAP_PRIORITIES[SnapType.WALL_JOIN],
                    distance: distToQuery,
                    sourceId: segment.id,
                    sourceType: 'wall',
                    metadata: {
                        wallId: segment.id,
                        joinType,
                        faceSign: sign,
                        faceLabel: sign > 0 ? 'face_left' : 'face_right',
                        t: faceProjResult.t,
                        rayT: t,
                        refType: 'wall_join_face'
                    }
                });
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
