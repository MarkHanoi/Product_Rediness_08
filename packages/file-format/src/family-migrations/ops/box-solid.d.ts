import type { FamilyDocument } from '../../family-schema.js';
import type { Migrator } from '../types.js';
/**
 * One dimension of an authored box: either BOUND to a parameter (the §64
 * demo — change the parameter, the shape resizes) or a fixed literal.
 *
 * ⛔ Deliberately NOT a free expression string. `evalLengthExpression` in
 *    `bakeFamilyInstance` accepts a bare parameter name or a numeric literal
 *    and NOTHING ELSE, so `Width - 2 * FrameWidth` as a HEIGHT would refuse at
 *    bake with `invalid-length`. Accepting a shape here that the evaluator
 *    refuses downstream is how an authoring surface lies. A derived dimension
 *    is expressed the way the format already expresses one: put the formula on
 *    a PARAMETER (`introduce-expression`) and bind the box to that parameter.
 */
export type BoxDimension = {
    readonly kind: 'parameter';
    readonly parameterId: string;
} | {
    readonly kind: 'literal';
    readonly value: number;
};
export interface BoxDimensions {
    readonly width: BoxDimension;
    readonly depth: BoxDimension;
    readonly height: BoxDimension;
}
/** What {@link readBoxSolid} recovers from the document. */
export interface BoxSolidReading extends BoxDimensions {
    readonly solidId: string;
    readonly profileId: string;
}
/**
 * Recover the authored dimensions of a box solid, or `null` when the solid's
 * profile was not authored by {@link makeAddBoxSolidMigrator} (a sketched
 * profile, an imported one, a rectangle written by hand in another spelling).
 *
 * ⭐ `null` is an ANSWER, not a failure: it is how a UI knows to show "this
 *    shape's profile is not a box this editor can edit" instead of a set of
 *    dimension fields that would silently rewrite something else.
 */
export declare function readBoxSolid(document: FamilyDocument, solidId: string): BoxSolidReading | null;
export interface AddBoxSolidParams extends BoxDimensions {
    /** `sol_` + ULID, minted by the caller through the ONE id factory. */
    readonly solidId: string;
    /** `prof_` + ULID. */
    readonly profileId: string;
    /** The profile's display name. */
    readonly profileName: string;
    /** An EXISTING `plane_` id — the profile is drawn on it. */
    readonly planeId: string;
    /** Four bare ULIDs for the corner entities. */
    readonly entityIds: readonly string[];
    readonly materialSlotId?: string | null;
}
/**
 * Append ONE parametric box: a rectangular profile plus the extrude that
 * builds it. Both land in the same op because a profile with no solid is
 * geometry nothing evaluates, and a solid with no profile does not validate —
 * splitting them would make a half-applied box a persistable state.
 */
export declare function makeAddBoxSolidMigrator(from: string, to: string, params: AddBoxSolidParams): Migrator;
export interface SetBoxDimensionsParams {
    readonly solidId: string;
    readonly width?: BoxDimension;
    readonly depth?: BoxDimension;
    readonly height?: BoxDimension;
}
/**
 * Re-dimension (or re-BIND) an existing box: literal → parameter is the §64
 * move, and it is the same op as parameter → literal.
 *
 * REFUSES a solid whose profile {@link readBoxSolid} does not recognise —
 * rewriting four corner points of a profile this op cannot read would destroy
 * authored geometry to satisfy a form.
 */
export declare function makeSetBoxDimensionsMigrator(from: string, to: string, params: SetBoxDimensionsParams): Migrator;
//# sourceMappingURL=box-solid.d.ts.map