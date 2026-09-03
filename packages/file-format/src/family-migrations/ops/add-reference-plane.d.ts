import type { ReferencePlane } from '../../family-schema.js';
import type { Migrator } from '../types.js';
export interface AddReferencePlaneParams {
    readonly plane: ReferencePlane;
}
export declare function makeAddReferencePlaneMigrator(from: string, to: string, params: AddReferencePlaneParams): Migrator;
//# sourceMappingURL=add-reference-plane.d.ts.map