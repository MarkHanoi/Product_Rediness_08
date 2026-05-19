import type { Migrator } from '../types.js';
export interface RenameParameterParams {
    readonly parameterId: string;
    readonly newName: string;
}
export declare function makeRenameParameterMigrator(from: string, to: string, params: RenameParameterParams): Migrator;
//# sourceMappingURL=rename-parameter.d.ts.map