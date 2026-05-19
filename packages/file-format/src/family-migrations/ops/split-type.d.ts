import type { Migrator } from '../types.js';
export interface SplitTypeParams {
    readonly sourceTypeId: string;
    readonly newTypeId: string;
    readonly newTypeName: string;
    readonly valueOverrides?: Record<string, number | string | boolean>;
}
export declare function makeSplitTypeMigrator(from: string, to: string, params: SplitTypeParams): Migrator;
//# sourceMappingURL=split-type.d.ts.map