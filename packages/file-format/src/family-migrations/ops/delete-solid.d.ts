import type { Migrator } from '../types.js';
export interface DeleteSolidParams {
    readonly solidId: string;
    /** Keep the profile even when it becomes unreferenced. Default `false`. */
    readonly keepProfile?: boolean;
}
export declare function makeDeleteSolidMigrator(from: string, to: string, params: DeleteSolidParams): Migrator;
//# sourceMappingURL=delete-solid.d.ts.map