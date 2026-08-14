// ─── parcelEdgeClassificationDetermination — "no edge is street frontage" stops
//     being "nobody classified the edges" (C78 §1.4 · C71 §4.4 · §CONTEXT-DATA-HONESTY)
//
// THE DEFECT FAMILY. A committed C19 parcel boundary carries an OPTIONAL
// `edgeClassifications` array — one label per ring edge ('front' | 'side' | …).
// Every reader defaulted it with `?? []`, which merged two facts that lead to
// different actions:
//   1. the edges WERE classified and none of them is street frontage — a real
//      answer, and a notable one: a landlocked parcel is a genuine finding;
//   2. nothing ever classified the edges — no answer at all.
// The site-data card then rendered `frontEdges > 0 ? …` and, on case (2),
// silently omitted the frontage clause entirely. To a reader that is
// indistinguishable from case (1): the card asserted "this plot has no street
// frontage" on a plot nobody had measured.
//
// WHY THAT PARTICULAR LIE MATTERS HERE. Street frontage is not decoration — it
// is the edge buildable depth insets FROM, so it decides the envelope, and the
// card exists (per its own §MURCIA-CARD-PARCEL-RING note, L-676) precisely so a
// human can judge whether the massing makes sense against the plot. This file's
// sibling arm already got this right for the RING: "an ABSENT ring must SAY it
// is absent … Failure and empty are the same value only if nobody prints the
// difference." This module extends the same doctrine to the edge labels.
//
// WHY IT IS A SEPARATE, PURE MODULE. The readers live inside multi-thousand-line
// DOM builders where nothing is reachable from a test. Extracting the DECISION
// is what makes the distinction assertable — the same reason `roomWallScope.ts`
// was extracted for the chat room-scope defect (commit a0a6ed09).
//
// NO RIVAL VOCABULARY. The determination type and the closed C78 §8.1 reason
// union come from `../relationshipDetermination`, which type-only-imports the
// eleven-member union from `@pryzm/command-bus`. Nothing is minted here.
//
// PURE: no store access, no I/O, no DOM, no throw.

import {
    determineRelationshipArray,
    type RelationshipDetermination,
} from '../relationshipDetermination';

/** The answer to "how are this parcel's ring edges classified?". */
export type ParcelEdgeClassificationDetermination = RelationshipDetermination<string>;

/** The label that means "this edge faces the street" — the one depth insets from. */
export const FRONT_EDGE = 'front';

/**
 * THE discriminator. Replaces `boundary.edgeClassifications ?? []`.
 *
 * TWO unrecorded shapes, not one — this is where the first draft of this module
 * itself would have collapsed a case, and the schema is the witness:
 *   · absent / null / non-array → nothing was ever written;
 *   · WRONG LENGTH — `ParcelBoundarySchema` (packages/schemas/src/site/Parcel.ts)
 *     DEFAULTS `edgeClassifications` to `[]`, while C19 §2.7 requires one entry
 *     per polygon edge for a classified parcel. So a schema-valid, committed,
 *     never-classified parcel carries `[]` AGAINST A NON-EMPTY POLYGON. Treating
 *     that `[]` as "examined, landlocked" would be the same defect one notch
 *     deeper. When the caller supplies `polygonLength`, a length mismatch is
 *     UNDETERMINED.
 * A present array of the right length → `determined`, whatever its content: a
 * parcel whose edges were examined and none classified `front` is a real answer
 * (C71 §4.4).
 */
export function determineParcelEdgeClassifications(
    raw: unknown,
    scope = 'parcel edge classifications',
    polygonLength?: number,
): ParcelEdgeClassificationDetermination {
    const d = determineRelationshipArray<string>(raw, scope, {
        detail:
            'the committed parcel boundary carries no edgeClassifications array — no producer ' +
            'classified its edges. Zero street frontage was NOT determined (C78 §1.4).',
    });
    if (
        d.kind === 'determined' &&
        polygonLength !== undefined &&
        polygonLength > 0 &&
        d.elements.length !== polygonLength
    ) {
        return {
            kind: 'undetermined',
            scope,
            reason: 'RELATIONSHIP_NOT_RECORDED',
            detail:
                `edgeClassifications has ${d.elements.length} entr(ies) for a ${polygonLength}-edge ` +
                'polygon — C19 §2.7 requires one per edge, and the schema DEFAULTS the array to `[]`, ' +
                'so this is the shape of a parcel nobody classified, not a classification.',
        };
    }
    return d;
}

/**
 * The classifications, or `null` when they were never recorded.
 *
 * NOT a shorthand for `?? []`: returning `null` where the old code returned `[]`
 * is exactly the observable difference this module exists to create.
 */
export function parcelEdgeClassificationsOrUnknown(
    raw: unknown,
    polygonLength?: number,
): readonly string[] | null {
    const d = determineParcelEdgeClassifications(raw, undefined, polygonLength);
    return d.kind === 'determined' ? d.elements : null;
}

/**
 * How many ring edges face the street — or `null` when nobody classified them.
 *
 * The THREE-WAY value the `?? []` collapsed to two: `null` (unknown), `0`
 * (classified, landlocked) and `n > 0` are three different facts about a plot.
 */
export function frontEdgeCount(raw: unknown, polygonLength?: number): number | null {
    const ids = parcelEdgeClassificationsOrUnknown(raw, polygonLength);
    return ids === null ? null : ids.filter((c) => c === FRONT_EDGE).length;
}

/**
 * The clause the site-data card appends to its "Boundary edges: N" row.
 *
 * EVERY arm is a NON-EMPTY string on purpose. The old code emitted `''` for
 * both unknown and zero, and an empty string is the render-layer spelling of the
 * very equation this module forbids: the reader cannot tell a withheld answer
 * from a negative one when both print as nothing.
 *
 * The all-`unclassified` arm exists because C19's enum carries `'unclassified'`
 * as an IN-BAND per-edge unknown: a full-length array of them is recorded, but
 * it records that nobody decided — which is not a landlocked finding either.
 */
export function frontageClause(raw: unknown, polygonLength?: number): string {
    const ids = parcelEdgeClassificationsOrUnknown(raw, polygonLength);
    if (ids === null) return ' (street frontage not recorded)';
    if (ids.length > 0 && ids.every((c) => c === 'unclassified')) {
        return ' (edges not yet classified)';
    }
    const n = ids.filter((c) => c === FRONT_EDGE).length;
    if (n === 0) return ' (no edge classified as street frontage)';
    return ` (${n} street frontage)`;
}
