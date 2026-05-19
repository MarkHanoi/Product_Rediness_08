/**
 * SketchTypes.ts
 *
 * Defines the parametric sketch system for slab boundaries, modelled after
 * Revit's host–boundary constraint system.
 *
 * §03 Contract compliance:
 * - Sketch is stored as **rules** (references + offsets), not static geometry.
 * - Geometry is derived at projection time by WallFaceResolver.
 * - HostReferenceEdge carries a `fallback` segment that is populated when the
 *   referenced wall is deleted, ensuring non-destructive degradation.
 */

/** Which face of the host wall the edge is constrained to. */
export type WallFaceRef =
    | 'centerLine'
    | 'exteriorFace'
    | 'interiorFace'
    | 'coreExterior'
    | 'coreInterior';

/** A static, unconstrained line segment in the slab's local 2D coordinate space. */
export interface FreeLineEdge {
    type: 'freeLine';
    start: { x: number; y: number };
    end: { x: number; y: number };
}

/**
 * An edge whose geometry is derived from a wall's reference face.
 * When the host wall is deleted, this edge degrades to a FreeLineEdge
 * using the last known fallback coordinates.
 */
export interface HostReferenceEdge {
    type: 'hostReference';
    hostId: string;
    hostType: 'wall';
    reference: WallFaceRef;
    /** Lateral offset in metres (+ = outward, – = inward from the referenced face). */
    offset: number;
    /**
     * Populated by SlabDependencyTracker the last time the host wall was
     * successfully resolved. Used to degrade to a FreeLine if the host is deleted.
     */
    fallback?: { start: { x: number; y: number }; end: { x: number; y: number } };
}

export type SketchEdge = FreeLineEdge | HostReferenceEdge;

/** One closed boundary loop built from an ordered sequence of edges. */
export interface SketchLoop {
    edges: SketchEdge[];
}

/**
 * Full parametric sketch for a slab.
 * outerLoop  — the slab's outer profile boundary
 * innerLoops — optional cut-outs / openings within the slab
 */
export interface SlabSketch {
    outerLoop: SketchLoop;
    innerLoops?: SketchLoop[];
}
