import type { Migrator } from '../types.js';
export interface IntroduceExpressionParams {
    readonly parameterId: string;
    readonly expression: string;
    /** When true, removes the parameter's value from every
     *  `document.types[*].values` (since the expression now drives it).
     *  Defaults to `false`. */
    readonly clearTypeOverrides?: boolean;
    /** When `true` (the DEFAULT), a non-null `defaultValue` that the new
     *  expression supersedes is moved to `supersededDefault` for provenance.
     *  Set `false` to DROP it instead.  Either way the `defaultValue` is
     *  cleared — that is not optional, it is ADR-0376 D4. */
    readonly recordSupersededDefault?: boolean;
}
export declare function makeIntroduceExpressionMigrator(from: string, to: string, params: IntroduceExpressionParams): Migrator;
//# sourceMappingURL=introduce-expression.d.ts.map