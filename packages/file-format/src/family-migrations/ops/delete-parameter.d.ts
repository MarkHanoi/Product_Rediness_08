import type { Migrator } from '../types.js';
export interface DeleteParameterParams {
    readonly parameterId: string;
}
export declare function makeDeleteParameterMigrator(from: string, to: string, params: DeleteParameterParams): Migrator;
//# sourceMappingURL=delete-parameter.d.ts.map