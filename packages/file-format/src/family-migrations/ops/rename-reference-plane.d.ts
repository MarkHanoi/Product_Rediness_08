import type { Migrator } from '../types.js';
export interface RenameReferencePlaneParams {
    /** The `plane_` id of an EXISTING reference plane. */
    readonly planeId: string;
    /** The new user-facing name. Trimmed before it is compared or written. */
    readonly newName: string;
}
/**
 * Rename one reference plane. The `id` never moves, so nothing that references
 * the plane can be orphaned — which is why a rename is safe on a plane already
 * carrying shapes while REORIENT and DELETE still are not.
 *
 * ⛔ Refuses by name: unknown plane, empty name, a name already used by another
 *    plane in this document, and a "rename" to the current name.
 */
export declare function makeRenameReferencePlaneMigrator(from: string, to: string, params: RenameReferencePlaneParams): Migrator;
