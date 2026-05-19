import * as THREE from '@pryzm/renderer-three/three';
import { WallStore } from './WallStore';
import { WallData } from './WallTypes';
import { PathResolver } from './PathResolver';

export type AnchorType = 'CENTERLINE' | 'FACE' | 'ENDPOINT';

export interface WallAnchor {
    wallId: string;
    type: AnchorType;
    point: THREE.Vector3;
    normal?: THREE.Vector3;
    t: number; // Parameter along the baseline [0, 1]
    side?: 'LEFT' | 'RIGHT' | 'CENTER';
}

export class WallIntentResolver {
    constructor(private wallStore: WallStore) {}

    /**
     * Resolves a raycast hit or a proximity point on a wall into a semantic anchor.
     * Supports both straight walls (baseLine segment) and curved walls (WallCurve
     * tessellated polyline).  Prioritizes face snapping based on distance from
     * the wall centreline.
     *
     * Contract §01-1.5: resolvers are read-only; no store mutation here.
     */
    resolveHitToAnchor(hit: THREE.Intersection | THREE.Vector3, proximityRadius: number = 0.3): WallAnchor | null {
        let hitPoint: THREE.Vector3;
        let targetWall: WallData | null = null;

        if (hit instanceof THREE.Vector3) {
            hitPoint = hit.clone();
            const walls = this.wallStore.getAll();
            let minDist = proximityRadius;

            for (const wall of walls) {
                const dist = this.pointToWallDistance(hitPoint, wall);
                if (dist < minDist) {
                    minDist = dist;
                    targetWall = wall;
                }
            }
        } else {
            const mesh = hit.object as THREE.Mesh;
            const wallId = mesh.userData.wallId || mesh.userData.parentId;
            targetWall = wallId ? this.wallStore.getById(wallId) || null : null;
            hitPoint = hit.point.clone();
        }

        if (!targetWall) return null;

        const wall = targetWall;
        const thickness = wall.thickness;

        // --- Curved wall path ---
        if (wall.curve) {
            const [startPt, endPt] = wall.baseLine;
            const start = new THREE.Vector3(startPt.x, startPt.y, startPt.z);
            const end   = new THREE.Vector3(endPt.x, endPt.y, endPt.z);
            const ctrl = new THREE.Vector3(
                wall.curve.control.x,
                wall.curve.control.y,
                wall.curve.control.z
            );
            const pts = PathResolver.toPolyline(
                { kind: 'Arc', start, end, control: ctrl },
                wall.curve.segments
            );

            // Project query onto XZ plane at wall elevation
            const query = hitPoint.clone();
            query.y = start.y;

            const { point: centerlinePoint, t, segmentIndex } = PathResolver.closestPointOnPolyline(pts, query);

            // Tangent from segment direction
            const segA = pts[segmentIndex];
            const segB = pts[Math.min(segmentIndex + 1, pts.length - 1)];
            const tangent = new THREE.Vector3().subVectors(segB, segA).normalize();
            const normal = new THREE.Vector3(-tangent.z, 0, tangent.x); // left normal

            const toHit = new THREE.Vector3().subVectors(query, centerlinePoint);
            const distFromCenter = toHit.dot(normal);

            let anchorPoint = centerlinePoint.clone();
            let side: 'LEFT' | 'RIGHT' | 'CENTER' = 'CENTER';
            let anchorType: AnchorType = 'CENTERLINE';

            if (Math.abs(distFromCenter) > thickness * 0.1) {
                side = distFromCenter > 0 ? 'LEFT' : 'RIGHT';
                anchorType = 'FACE';
                anchorPoint.add(normal.clone().multiplyScalar(side === 'LEFT' ? thickness / 2 : -thickness / 2));
            }

            return {
                wallId: wall.id,
                type: anchorType,
                point: anchorPoint,
                normal: side === 'LEFT' ? normal : (side === 'RIGHT' ? normal.clone().negate() : undefined),
                t,
                side
            };
        }

        // --- Straight wall path (original logic, unchanged) ---
        const [start, end] = wall.baseLine;
        hitPoint.y = start.y;

        const v = new THREE.Vector3().subVectors(hitPoint, start);
        const lineDir = new THREE.Vector3().subVectors(end, start);
        const lineLen = lineDir.length();

        if (lineLen < 0.001) return null;

        lineDir.normalize();

        let t = v.dot(lineDir) / lineLen;
        t = Math.max(0, Math.min(1, t));

        const centerlinePoint = new THREE.Vector3().lerpVectors(start, end, t);
        const normal = new THREE.Vector3(-lineDir.z, 0, lineDir.x);
        const toHit = new THREE.Vector3().subVectors(hitPoint, centerlinePoint);
        const distFromCenter = toHit.dot(normal);

        let anchorPoint = centerlinePoint.clone();
        let side: 'LEFT' | 'RIGHT' | 'CENTER' = 'CENTER';
        let anchorType: AnchorType = 'CENTERLINE';

        if (Math.abs(distFromCenter) > thickness * 0.1) {
            side = distFromCenter > 0 ? 'LEFT' : 'RIGHT';
            anchorType = 'FACE';
            anchorPoint.add(normal.clone().multiplyScalar(side === 'LEFT' ? thickness / 2 : -thickness / 2));
        }

        return {
            wallId: wall.id,
            type: anchorType,
            point: anchorPoint,
            normal: side === 'LEFT' ? normal : (side === 'RIGHT' ? normal.clone().negate() : undefined),
            t,
            side
        };
    }

    /**
     * Minimum distance from point to wall (straight or curved).
     * Used for proximity-based wall picking.
     */
    private pointToWallDistance(p: THREE.Vector3, wall: WallData): number {
        const [startPt, endPt] = wall.baseLine;
        const start = new THREE.Vector3(startPt.x, startPt.y, startPt.z);
        const end   = new THREE.Vector3(endPt.x, endPt.y, endPt.z);
        const query = p.clone();
        query.y = start.y;

        if (wall.curve) {
            const ctrl = new THREE.Vector3(
                wall.curve.control.x,
                wall.curve.control.y,
                wall.curve.control.z
            );
            const pts = PathResolver.toPolyline(
                { kind: 'Arc', start, end, control: ctrl },
                wall.curve.segments
            );
            const { point } = PathResolver.closestPointOnPolyline(pts, query);
            return query.distanceTo(point);
        }

        return this.pointToSegmentDistance(query, start, end);
    }

    private pointToSegmentDistance(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
        const v = new THREE.Vector3().subVectors(b, a);
        const w = new THREE.Vector3().subVectors(p, a);
        const c1 = w.dot(v);
        if (c1 <= 0) return p.distanceTo(a);
        const c2 = v.dot(v);
        if (c2 <= c1) return p.distanceTo(b);
        const b_proj = c1 / c2;
        const pb = new THREE.Vector3().addVectors(a, v.multiplyScalar(b_proj));
        return p.distanceTo(pb);
    }

    /**
     * Resolves two anchors into final start/end points.
     * If snapped to a wall face, the connection is made perpendicular.
     */
    resolvePlacement(startAnchor: WallAnchor | THREE.Vector3, endAnchor: WallAnchor | THREE.Vector3): { start: THREE.Vector3, end: THREE.Vector3 } {
        let start = startAnchor instanceof THREE.Vector3 ? startAnchor : startAnchor.point;
        let end = endAnchor instanceof THREE.Vector3 ? endAnchor : endAnchor.point;

        // If we have a start anchor on a wall and an end point/anchor,
        // we might want to ensure the new wall is perpendicular if it's very close to perpendicular
        // or specifically requested. The user wants it "perpendicular to the wall I touched".

        if (!(startAnchor instanceof THREE.Vector3) && startAnchor.normal) {
            // Adjust end point to be perpendicular to the start wall if only one anchor is present
            // or if we want to enforce perpendicularity from the start wall.
            const toEnd = new THREE.Vector3().subVectors(end, start);
            const projection = toEnd.dot(startAnchor.normal);
            end = new THREE.Vector3().addVectors(start, startAnchor.normal.clone().multiplyScalar(projection));
        } else if (!(endAnchor instanceof THREE.Vector3) && endAnchor.normal) {
            // Adjust start point to be perpendicular to the end wall
            const toStart = new THREE.Vector3().subVectors(start, end);
            const projection = toStart.dot(endAnchor.normal);
            start = new THREE.Vector3().addVectors(end, endAnchor.normal.clone().multiplyScalar(projection));
        }

        return { start, end };
    }
}
