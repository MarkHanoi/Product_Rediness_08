// §PARCEL-LAW-UNRESOLVED — the WORDS the "Why these numbers?" fold puts in a citation slot.
//
// WHY THIS IS A MODULE AND NOT AN `if` AT THE RENDER SITE
// ------------------------------------------------------
// STR §25.1 requires the Parcel Law card to hold a citation PER ROW. The interesting cases are
// precisely the ones an inline ternary collapses:
//
//   1. a published figure with a citation                      -> PUB, link
//   2. an estimated figure                                     -> EST
//   3. a figure OUR extraction pipeline read, unverified       -> MACHINE (a wrong value is OURS)
//   4. a source we consulted that STATES NOTHING               -> a fact, and a strong one
//   5. a slot the card promised that nothing addressed         -> a hole in OUR data
//   6. a NUMBER on screen that no derivation entry sources     -> a C58 §1.3 breach
//
// 4/5/6 all used to render as the same thing — nothing at all, or a bare em-dash under a green
// PUB pill. That is the §CONTEXT-DATA-HONESTY collapse (failure and empty are the same value only
// if nobody prints the difference) and, on ordinance numbers, it is L-616: a reader who sees no
// FAR row completes the sentence as "unbounded", which is an OVERSTATEMENT on real land.
//
// THIS MODULE RETURNS WORDS, NOT HTML — deliberately. `GISAreaLayout` owns the templating and the
// §L-402-XSS escaping (`escHtml` / `safeHttpUrl`), and those guards must have exactly one home:
// a second copy of an escaping helper is how one of them comes to be the stale one. So the split
// is semantics here, markup there, and the semantics are what the tests pin.
//
// PURE: no DOM, no I/O, no THREE. Every function is total over its input.

import type { ComplianceReport, ComplianceReportRow, ComplianceUnresolvedRow } from '@pryzm/site-parcel-data';

/** How strongly a slot may present itself. The renderer maps this to colour; nothing else does. */
export type CitationSlotTone =
    /** A published, ordinance-backed figure. The strongest affordance the card has. */
    | 'published'
    /** A default-pack estimate. Real enough to show, never authoritative. */
    | 'estimated'
    /** Read by PRYZM's own extraction pipeline and NOT human-verified — a wrong value is ours. */
    | 'machine'
    /** A source WAS consulted for this constraint and it states no figure. */
    | 'stated-empty'
    /** The card promised this slot and nothing filled it. */
    | 'unfilled'
    /** A figure is on screen and no derivation entry sources it (C58 §1.3 breach). */
    | 'uncited';

export interface CitationSlot {
    /** Short pill text, e.g. `PUB`. Kept short because it sits inline beside the value. */
    readonly pill: string;
    readonly tone: CitationSlotTone;
    /** Hover text. Always a full sentence — the pill alone never has to carry the meaning. */
    readonly title: string;
    /**
     * The sentence that goes where a citation would go, when there is no citation to put there.
     * `null` means "render the real citation / the existing no-citation affordance".
     */
    readonly note: string | null;
}

/**
 * ⚠ THE ORDER OF THESE ARMS IS LOAD-BEARING and mirrors the ladder the headline chip uses.
 *
 * `stated-empty` is tested FIRST because the three provenance pills are statements about how much
 * to TRUST A VALUE, and here there is no value to trust — badging "published" over an em-dash
 * asserts that a figure was published. The provenance is not lost: it is named inside the note,
 * because "Plandata states no figure" and "our OCR pipeline found no figure" are different facts.
 *
 * `machine` is then tested BEFORE `isEstimate` for the §PACK-CONFIDENCE-CEILING (L-665) reason:
 * `ComplianceReportRow.isEstimate` is `fieldProvenance === 'estimated'` ONLY, so a
 * `pipeline-extracted` row is falsy there and would fall through to the green PUB pill — the
 * strongest affordance the card has, on the weakest real provenance there is.
 */
export function describeCitationSlot(row: ComplianceReportRow): CitationSlot {
    if (!row.hasStatedValue) {
        const who = row.provenance === 'pipeline-extracted'
            ? 'PRYZM’s extraction pipeline read this source'
            : `${row.source} was consulted`;
        return {
            pill: 'STATES NONE',
            tone: 'stated-empty',
            title:
                `${who} for this constraint and it carries no figure. This is a FINDING about the `
                + 'source, not a gap in our data — and it is not a finding that the constraint is '
                + 'unlimited.',
            note: null,
        };
    }
    if (row.provenance === 'pipeline-extracted') {
        return {
            pill: '⚠ MACHINE',
            tone: 'machine',
            title:
                'MACHINE-EXTRACTED by PRYZM’s OCR/extraction pipeline and NOT human-verified. Not '
                + 'published data — a wrong value here is our error.',
            note: null,
        };
    }
    if (row.isEstimate) {
        return {
            pill: 'EST',
            tone: 'estimated',
            title: 'A default rule-pack ESTIMATE, not an authoritative determination for this zone.',
            note: null,
        };
    }
    return {
        pill: 'PUB',
        tone: 'published',
        title: 'Published, ordinance-backed value for this zone.',
        note: null,
    };
}

/**
 * The slot for a row the card PROMISED and the derivation does not fill.
 *
 * ⚠ Both arms refuse the completion the reader would otherwise make. `no-value` says the words
 * "not a finding that the zone is unlimited" out loud, because that is exactly the inference
 * L-616 was written about. `value-without-citation` is the worse arm and says so: a number is
 * already on the reader's screen, and nothing in the determination can source it.
 */
export function describeUnresolvedSlot(row: ComplianceUnresolvedRow): CitationSlot {
    if (row.reason === 'value-without-citation') {
        return {
            pill: 'UNCITED',
            tone: 'uncited',
            title:
                'The card shows a figure for this row and the determination carries no derivation '
                + 'entry for it (C58 §1.3), so PRYZM cannot say where it came from.',
            note:
                'A value is shown above with no source behind it. Treat it as unverified until the '
                + 'rule pack emits a derivation entry for this constraint.',
        };
    }
    return {
        pill: 'NOT DERIVED',
        tone: 'unfilled',
        title:
            'The rule pack for this zone produced no value for this constraint, so there is nothing '
            + 'to cite.',
        note:
            'No value was resolved, so there is nothing to cite. This is a MISSING LOOKUP — it is '
            + 'NOT a finding that the zone sets no limit here.',
    };
}

/**
 * The fold's own footer sentences. Returns the caveats in reading order; an empty array means the
 * determination is complete on every slot the card promised, and the fold says nothing extra.
 *
 * ⚠ The estimate fraction keeps `rows.length` as its denominator. Unresolved slots are counted in
 * their OWN sentence and never folded in — silently growing "N of M are ESTIMATED" would restate
 * an existing honest sentence as a different quantity (L-526).
 */
export function describeCitationFoldCaveats(report: ComplianceReport): readonly string[] {
    const out: string[] = [];
    if (report.hasAnyEstimate) {
        out.push(
            `${report.estimatedRowCount} of ${report.rows.length} resolved value(s) are ESTIMATED `
            + '— not an authoritative determination.',
        );
    }
    const uncited = report.unresolvedRows.filter((r) => r.reason === 'value-without-citation').length;
    const missing = report.unresolvedRowCount - uncited;
    if (missing > 0) {
        out.push(
            `${missing} row(s) the card shows have NO value from this rule pack. An empty row means `
            + 'PRYZM did not resolve the rule — never that the rule is absent.',
        );
    }
    if (uncited > 0) {
        out.push(
            `${uncited} row(s) show a figure this determination cannot source (C58 §1.3). Those `
            + 'numbers are unverified.',
        );
    }
    return out;
}

/**
 * Whether the fold has anything to say at all. Deliberately TRUE when only unresolved slots exist:
 * that is the case in which the reader most needs the fold, and the old guard
 * (`rows.length === 0 -> render nothing`) hid the fold exactly then.
 */
export function citationFoldHasContent(report: ComplianceReport | null): boolean {
    return !!report && (report.rows.length > 0 || report.unresolvedRowCount > 0);
}
