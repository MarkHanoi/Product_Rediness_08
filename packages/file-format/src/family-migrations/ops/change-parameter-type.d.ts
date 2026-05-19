import type { FamilyParameterDataTypeSchema } from '../../family-schema.js';
import type { z } from 'zod';
import type { Migrator } from '../types.js';
export type FamilyParameterDataType = z.infer<typeof FamilyParameterDataTypeSchema>;
export interface ChangeParameterTypeParams {
    readonly parameterId: string;
    readonly newDataType: FamilyParameterDataType;
    /** Pure value converter.  Receives the old typed value, returns the
     *  new one.  Throw to abort the migration. */
    readonly valueConverter: (oldValue: number | string | boolean | null) => number | string | boolean | null;
}
export declare function makeChangeParameterTypeMigrator(from: string, to: string, params: ChangeParameterTypeParams): Migrator;
//# sourceMappingURL=change-parameter-type.d.ts.map