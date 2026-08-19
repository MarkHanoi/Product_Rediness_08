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
    /**
     * §FEAT-REGION-CURTAIN-WALL-ATTRIBUTED (L-1182) / C87 CW-Region-3.
     *
     * Widened from the bare literal `'wall'`. A curtain wall encloses space exactly
     * as a wall does — the founder's "put a floor in here" is the same request
     * whether the enclosure is masonry or glazing — but it lives in a DIFFERENT
     * STORE, so the host kind must travel with the id or the resolver cannot know
     * which store to ask.
     *
     * ⚠ THIS FIELD IS WHY THE CURTAIN-WALL EDGE WAS ANONYMOUS. L-1125 contributed
     * curtain-wall spines to the region edge set but deliberately WITHOUT an id,
     * because stamping one here would have declared `hostType: 'wall'` and sent
     * `WallFaceResolver` to `window.wallStore`, where the id does not exist. The
     * edge would have missed, silently fallen back to its authoring-time memory,
     * and the slab would have reported `preserved` while following nothing
     * (C79 §5.2.1). An anonymous edge was the honest answer while this field could
     * only say `'wall'`; now that it can name the kind, the edge is ATTRIBUTED.
     *
     * `'curtain-wall'` matches the `elementType` spelling used across the
     * curtain-wall family, so the two never need translating between each other.
     */
    hostType: 'wall' | 'curtain-wall';
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
