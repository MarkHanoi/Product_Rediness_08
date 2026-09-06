import type { Migrator } from '../types.js';
export interface SetParameterDefaultParams {
    /** The `par_` id of an EXISTING parameter. */
    readonly parameterId: string;
    /**
     * The new definition default, in the declared datatype's own terms — a RUNTIME
     * length for `length`, the resolver's scalar 0/1 for `boolean`. `null` CLEARS
     * the default and returns the parameter to having no definition-level value.
     */
    readonly defaultValue: number | string | null;
}
/**
 * Change one parameter's `defaultValue` — the ordinary "make Height 2400" edit
 * the op suite could not perform, so the only way to move a number was to author
 * a constant FORMULA, which clears the default (ADR-0376 D4) and leaves the
 * parameter reading as derived.
 *
 * ⛔ Refuses by name: unknown parameter; a parameter that carries a formula
 *    (D4 — the value would resolve to nothing); a value whose type does not match
 *    the declared `dataType`; a non-integer or negative `count`; a `boolean` that
 *    is neither 0 nor 1; and a "change" to the value already held.
 */
export declare function makeSetParameterDefaultMigrator(from: string, to: string, params: SetParameterDefaultParams): Migrator;
