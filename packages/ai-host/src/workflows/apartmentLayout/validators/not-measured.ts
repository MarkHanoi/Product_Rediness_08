// Apartment-layout validators — THE NOT-MEASURED RECORD.
//
// §L-909(b) REPORT HONESTY (2026-08-14). Three validators — G-7 (frontage
// length), G-10 (glazed-to-floor ratio) and A-7 (frontage topology) — are
// COMPUTATION-FREE: each compares a value its CALLER must measure against a
// programmatic threshold. Before this file existed, a caller that could not
// measure the value handed the validator a "conservative" `0` / `false`, and
// the validator dutifully printed that unmeasured default as a MEASURED zero:
//
//     "G-7 frontage: bedroom 'Bedroom 1' has external frontage 0.00 m"
//
// on a layout whose engine had emitted a window into that very room. That is
// the context-data-honesty defect (`failure` and `empty` collapsed to the same
// value) at the REPORTING layer, and it is forbidden by C78 §1.4, C70
// L-INV-1 and C75 §1.4.
//
// The rule now is C83 §5.2.1/§5.3: **a rule that cannot compute its own
// precondition emits NOTHING and records WHY.** The absent measurement is
// carried as `undefined` (never `0`, never `false`) all the way from the
// producer through the adapter into the validator; the validator SKIPS and
// appends one `NotMeasuredNote`, which the orchestrator aggregates and the
// report formatter renders in its own section. The user sees
// "frontage not measured by this report" — never a violation minted from a
// default.
//
// PURE: types + one frozen-record factory. No I/O, no DOM, no THREE.

/** The geometry-derived inputs that can be genuinely UNMEASURABLE at the
 *  report layer. Each maps 1:1 to a `ApartmentLayoutRoom` field. */
export type NotMeasuredField =
    | 'externalFrontageM'
    | 'glazedAreaM2'
    | 'hasExteriorEdge';

/**
 * One "this rule could not run" record. Emitted INSTEAD of a violation when
 * the rule's precondition is absent.
 *
 * `classId` is the rule that skipped ('G-7' / 'G-10' / 'A-7'), so the report
 * can say which check did not run rather than silently omitting it.
 */
export interface NotMeasuredNote {
    /** Rule that could not run — 'G-7' | 'G-10' | 'A-7'. */
    readonly classId: string;
    /** Room the rule would have applied to. */
    readonly roomId: string;
    /** Room type (the rule's applicability was already established). */
    readonly roomType: string;
    /** The input field that was absent. */
    readonly field: NotMeasuredField;
    /** Human-readable reason, rendered verbatim in the report. */
    readonly reason: string;
}

/** Build one frozen note. Keeps the phrasing in ONE place so G-7 / G-10 /
 *  A-7 cannot drift into three different vocabularies for the same fact. */
export function notMeasuredNote(
    classId: string,
    roomId: string,
    roomType: string,
    field: NotMeasuredField,
    reason: string,
): NotMeasuredNote {
    return Object.freeze({ classId, roomId, roomType, field, reason });
}
