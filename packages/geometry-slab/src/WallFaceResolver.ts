import * as THREE from '@pryzm/renderer-three/three';
import { WallFaceRef, HostReferenceEdge, FreeLineEdge } from './SketchTypes';

export interface Segment2D {
    start: { x: number; y: number };
    end: { x: number; y: number };
}

/**
 * WallFaceResolver
 *
 * Resolves a HostReferenceEdge to a concrete 2D line segment by reading the
 * current wall geometry from the WallStore (via window.wallStore). // TODO(TASK-08)
 *
 * Contract compliance:
 * - §02 Projection-Only: This resolver is stateless and pure — it does not
 *   mutate any store or register any spatial element.
 * - §01 §2.1: All store reads are read-only (via getById).
 * - The returned Segment2D is in slab 2D space: x = world.x, y = world.z.
 *
 * Math:
 * Wall baseLine is the wall's center line in world XZ space.
 * Given direction d = normalize(end – start):
 *   Normal n = (d.z, –d.x)   (right-hand perpendicular when walking start→end)
 *   exteriorFace offset = +thickness/2 in n direction
 *   interiorFace offset = –thickness/2 in n direction
 *   centerLine   offset = 0
 *   coreExterior / coreInterior mirror exterior/interior (simplified — no layer model yet)
 */
export class WallFaceResolver {

    /**
     * Attempt to resolve a HostReferenceEdge to its current 2D segment.
     * Returns null if the host wall cannot be found.
     */
    static resolve(edge: HostReferenceEdge): Segment2D | null {
        const wallStore = window.wallStore; // TODO(TASK-08)
        if (!wallStore) return null;

        const wall = wallStore.getById?.(edge.hostId);
        if (!wall || !wall.baseLine || wall.baseLine.length < 2) return null;

        return WallFaceResolver.computeSegment(
            wall.baseLine[0],
            wall.baseLine[1],
            wall.thickness ?? 0,
            edge.reference,
            edge.offset
        );
    }

    /**
     * Resolve or fall back to last known fallback geometry.
     * Returns null only if both live resolution and fallback are unavailable.
     */
    static resolveOrFallback(edge: HostReferenceEdge): Segment2D | null {
        const live = WallFaceResolver.resolve(edge);
        if (live) return live;
        if (edge.fallback) return edge.fallback;
        return null;
    }

    /**
     * Resolve a HostReferenceEdge and capture the result as its fallback,
     * returning an updated copy of the edge. Use this when building the
     * geometry so that the fallback is always fresh.
     */
    static resolveAndCache(edge: HostReferenceEdge): { segment: Segment2D | null; updatedEdge: HostReferenceEdge } {
        const segment = WallFaceResolver.resolve(edge);
        const updatedEdge: HostReferenceEdge = { ...edge };
        if (segment) {
            updatedEdge.fallback = { start: segment.start, end: segment.end };
        }
        return { segment, updatedEdge };
    }

    /**
     * Convert a HostReferenceEdge to a FreeLineEdge using its current or
     * fallback geometry. Used when the host wall is deleted.
     */
    static degrade(edge: HostReferenceEdge): FreeLineEdge | null {
        const segment = WallFaceResolver.resolveOrFallback(edge);
        if (!segment) return null;
        return {
            type: 'freeLine',
            start: segment.start,
            end: segment.end
        };
    }

    private static computeSegment(
        v0: THREE.Vector3,
        v1: THREE.Vector3,
        thickness: number,
        reference: WallFaceRef,
        lateralOffset: number
    ): Segment2D {
        const dx = v1.x - v0.x;
        const dz = v1.z - v0.z;
        const len = Math.sqrt(dx * dx + dz * dz);

        // Unit normal perpendicular to wall direction (right-hand side when walking start→end)
        const nx = len > 0 ? dz / len : 0;
        const ny = len > 0 ? -dx / len : 0;

        // Compute face offset from center line
        let faceOffset = 0;
        switch (reference) {
            case 'exteriorFace':
            case 'coreExterior':
                faceOffset = thickness / 2;
                break;
            case 'interiorFace':
            case 'coreInterior':
                faceOffset = -thickness / 2;
                break;
            case 'centerLine':
            default:
                faceOffset = 0;
                break;
        }

        const totalOffset = faceOffset + lateralOffset;

        return {
            start: {
                x: v0.x + nx * totalOffset,
                y: v0.z + ny * totalOffset
            },
            end: {
                x: v1.x + nx * totalOffset,
                y: v1.z + ny * totalOffset
            }
        };
    }
}
