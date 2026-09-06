import type { Migrator } from '../types.js';
export interface SetPlaneOffsetParams {
    /** The `plane_` id of an EXISTING reference plane. */
    readonly planeId: string;
    /**
     * Signed offset along the plane's `normal`, in RUNTIME length units, as an
     * expression over the definition's parameters (`Height`, `Sill + 50`, `900`).
     * `null` CLEARS the dimension and returns the plane to an undimensioned datum.
     */
    readonly offsetExpression: string | null;
}
/**
 * Dimension one reference plane with an EXPRESSION over the definition's own
 * parameters, so a parameter MOVES the plane and every extrude built on that
 * plane follows (`bakeFamilyInstance`'s `resolvePlaneOffsetM`).
 *
 * ⛔ Refuses by name: unknown plane; a blank expression (pass `null` to clear);
 *    a zero-length or non-finite normal; and a plane whose literal `origin` is
 *    already non-zero, because that would state the position twice.
 */
export declare function makeSetPlaneOffsetMigrator(from: string, to: string, params: SetPlaneOffsetParams): Migrator;
