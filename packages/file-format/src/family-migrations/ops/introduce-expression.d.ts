import type { Migrator } from '../types.js';
export interface IntroduceExpressionParams {
    readonly parameterId: string;
    readonly expression: string;
    /** When true, removes the parameter's value from every
     *  `document.types[*].values` (since the expression now drives it).
     *  Defaults to `false`. */
    readonly clearTypeOverrides?: boolean;
}
export declare function makeIntroduceExpressionMigrator(from: string, to: string, params: IntroduceExpressionParams): Migrator;
//# sourceMappingURL=introduce-expression.d.ts.map