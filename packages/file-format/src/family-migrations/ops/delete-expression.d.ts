import type { Migrator } from '../types.js';
export interface DeleteExpressionParams {
    readonly parameterId: string;
    /** When `true` (the DEFAULT), a `supersededDefault` recorded by the
     *  `introduce-expression` that installed this formula is restored to
     *  `defaultValue` and the provenance key removed. `false` drops it. */
    readonly restoreSupersededDefault?: boolean;
    /** An explicit value to leave behind, which WINS over any restored
     *  `supersededDefault`. Use it when the caller knows what the parameter
     *  should read once the formula is gone. */
    readonly replacementDefault?: number | string;
}
export declare function makeDeleteExpressionMigrator(from: string, to: string, params: DeleteExpressionParams): Migrator;
//# sourceMappingURL=delete-expression.d.ts.map