import type { FamilyParameter } from '../../family-schema.js';
import type { Migrator } from '../types.js';
export interface AddParameterParams {
    readonly parameter: FamilyParameter;
    readonly seedDefault?: number | string | boolean | null;
}
export declare function makeAddParameterMigrator(from: string, to: string, params: AddParameterParams): Migrator;
//# sourceMappingURL=add-parameter.d.ts.map