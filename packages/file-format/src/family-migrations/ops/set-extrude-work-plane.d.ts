import type { Migrator } from '../types.js';
export interface SetExtrudeWorkPlaneParams {
    /** The `sol_` id of an EXISTING `extrude` solid. */
    readonly solidId: string;
    /** The `plane_` id of an EXISTING reference plane. */
    readonly planeId: string;
}
/**
 * Put one extrude solid on one reference plane: the profile is re-bound to the
 * plane and the solid's sweep axis becomes the plane's UNIT normal.
 *
 * ⛔ Refuses, by name, every way this can be meaningless: unknown solid,
 *    non-extrude solid (naming the kind), unknown plane, a plane whose normal
 *    has no length, a plane whose origin is not the model origin, and a solid
 *    whose profile is missing. A refusal leaves the document untouched — the
 *    migrator throws before it builds a new document, so a half-moved solid is
 *    not a state this op can produce.
 */
export declare function makeSetExtrudeWorkPlaneMigrator(from: string, to: string, params: SetExtrudeWorkPlaneParams): Migrator;
//# sourceMappingURL=set-extrude-work-plane.d.ts.map