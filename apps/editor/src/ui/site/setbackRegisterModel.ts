// §26.6.2 (L-13046, founder 2026-09-07) — THE SETBACK REGISTER: one row per perimeter edge.
//
// Founder, verbatim: *"WE SHOULD HAVE DATA ABOUT THE DEPTH — BUT GENERALLY ABOUT EVERY SETBACK — AND
// WHY — AND IT SHOULD BE SELECTABLE AND HYPERLINK — I WANT TO KNOW FOR EVERY VECTOR OF THE PERIMETER
// THE SETBACK — THIS SHOULD BE DROPDOWN AS IT CAN GET A LOT OF DATA."*
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS IS: C58 §1.3 RENDERED PER EDGE INSTEAD OF PER PARCEL
// ═══════════════════════════════════════════════════════════════════════════════════════════
// C58 §1.3 says *"every envelope constraint cites its source rule"*, and the derivation trace already
// does — per CONSTRAINT: `setback.front` / `setback.side` / `setback.rear`, or `alignment.depth` /
// `alignment.offset` in an alignment-governed zone. What the founder wants is the same fact turned
// ninety degrees: not "the front setback is 3 m", but "THIS edge — the one I can see on the map —
// is the front, so 3 m applies to it, because Art. X says so". The join between the two is C19 §2.3
// `boundary.edgeClassifications`: one label per edge, telling us WHICH edge is the front.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE ONE RULE THAT GOVERNS EVERY ROW: WHERE THE CLASS IS UNKNOWN, SAY SO PER EDGE. NEVER INFER.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// C19 §10.1 — edge-classification AUTHORING is PENDING. There is no UI that assigns front / side /
// rear today, so for most parcels the array is absent, or the schema's `[]` default, or in-band
// `'unclassified'`. Each of those is *"nobody decided"*, and each is stated as such on ITS OWN row.
// A heuristic here — longest edge is the front, opposite is the rear — would put a legal number
// against an edge on the strength of a guess, and the row would read exactly like a recorded one.
// That is §L-616 (an unknown drawn as a bound is an overstatement on real land) at the smallest
// possible grain, and it is refused. The determination is read through the SAME three-arm rule
// every other reader uses (`parcelEdgeClassificationDetermination.ts`); this module never looks at
// the raw array.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE ARMS, AND WHY EACH IS A DIFFERENT SENTENCE
// ═══════════════════════════════════════════════════════════════════════════════════════════
//   · applied            — the edge's class has a numeric row in the trace: value + ITS citation.
//   · alignment-governed — an alignment zone (Barcelona 13a, Murcia 5.5.3): the depth is the rule
//                          and there are NO per-class setbacks. The front edge states the offset
//                          (when derived) and that the depth is measured from it; every other
//                          classified edge states that NO setback is derived from it and why.
//   · not-derived        — the class is known but the pack produced no row for it (C58 §1.4: a gap
//                          in the pack, never "no setback").
//   · class-unknown      — nobody recorded which edge this is (C19 §10.1). Two spellings, because
//                          they are two facts: never recorded, vs recorded as `unclassified`.
//   · no-determination   — no envelope reached the model; the edges are still listed with what IS
//                          known about them (C58 §1.20: the absence is a state to render).
//   · refused            — the determination is a cited REFUSAL (C58 §1.13); no row carries a
//                          number, and every row says the refusal, not a dash.
//
// PURE: no DOM, no store, no THREE, no I/O. Total over the model; never throws. P6 — writes
// nothing. P8 — one span on the exported builder.

import { trace } from '@opentelemetry/api';
import type {
    ParcelLawEdge,
    ParcelLawModel,
    ParcelLawRule,
    ParcelLawSetbackConstraint,
} from './parcel/parcelLawModel';
import {
    describeEdgeHighlightAvailability,
    edgeHighlightSubject,
    type SiteHighlightAvailability,
    type SiteHighlightEdgeSubject,
} from './siteGeometryHighlight';

const _tracer = trace.getTracer('pryzm.site.setbackRegisterModel');

/** How an edge's class is known, or not. Closed. */
export type SetbackEdgeClass =
    | 'front'
    | 'side'
    | 'rear'
    /** C19 §2.3's in-band unknown: RECORDED, and it records that nobody decided. */
    | 'unclassified'
    /** Nothing was recorded for this edge at all (absent array, or the schema's `[]` default). */
    | 'not-recorded';

/** One arm per fact. `sentence` is always complete and always names the numbers it rests on. */
export type SetbackVerdict =
    | {
        readonly kind: 'applied';
        readonly constraint: ParcelLawSetbackConstraint;
        readonly valueM: number;
        /** The citation, or `null` when the trace holds the value without one — stated, not hidden. */
        readonly ordinanceRef: string | null;
        readonly provenance: string | null;
        readonly sentence: string;
    }
    | {
        readonly kind: 'alignment-governed';
        readonly depthM: number | null;
        readonly offsetM: number | null;
        readonly ordinanceRef: string | null;
        readonly sentence: string;
    }
    | { readonly kind: 'not-derived'; readonly constraint: ParcelLawSetbackConstraint; readonly sentence: string }
    | { readonly kind: 'class-unknown'; readonly sentence: string }
    | { readonly kind: 'no-determination'; readonly sentence: string }
    | { readonly kind: 'refused'; readonly sentence: string };

export interface SetbackRegisterRow {
    /** 0-based ring vertex index the edge starts at. */
    readonly index: number;
    /** `Edge 1` … — 1-based for the reader, matching `edgeHighlightMeaning`. */
    readonly label: string;
    readonly lengthM: number;
    readonly edgeClass: SetbackEdgeClass;
    /** The class in the reader's words — an unknown says WHICH unknown it is. */
    readonly classText: string;
    readonly verdict: SetbackVerdict;
    /** §26.6 rule 2 — the link that lights THIS edge on whichever view is open. */
    readonly highlightSubject: SiteHighlightEdgeSubject;
    readonly availability: SiteHighlightAvailability;
}

export type SetbackRegister =
    | {
        /** No committed ring could be read — there are no edges to list. */
        readonly kind: 'no-parcel';
        readonly sentence: string;
        readonly rows: readonly [];
    }
    | {
        readonly kind: 'rows';
        readonly rows: readonly SetbackRegisterRow[];
        /** For the collapsed `<summary>`: `4 edges · 3 classified · 1 not recorded`. */
        readonly summary: string;
        /** The register's own lede: what the rows are, and C19 §10.1 when any class is unknown. */
        readonly lede: string;
        /** `true` when at least one edge's class is unknown — the renderer prints the §10.1 note. */
        readonly anyClassUnknown: boolean;
    };

const NO_PARCEL_SENTENCE =
    'PRYZM could not read a committed parcel outline for this project, so there are no perimeter '
    + 'edges to list a setback against. This is a missing READ, not a finding that no setback applies.';

export const SETBACK_REGISTER_LEDE =
    'One row per edge of the committed ring, in ring order. Each row states the edge\'s recorded '
    + 'class, the constraint the rule pack derived for that class, and the rule that produced it '
    + '(C58 §1.3) — and lights that edge on the open view when you follow its link.';

export const SETBACK_CLASS_UNKNOWN_NOTE =
    'Edge classification has not been authored for this parcel (C19 §10.1 is pending), so PRYZM '
    + 'cannot say which rule applies to an edge whose class is unknown. It does not guess: a '
    + 'setback inferred from an edge\'s length or bearing would read exactly like a recorded one.';

const fmtM = (v: number): string => `${v.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;

function classOf(edge: ParcelLawEdge): SetbackEdgeClass {
    switch (edge.classification) {
        case 'front': return 'front';
        case 'side': return 'side';
        case 'rear': return 'rear';
        case 'unclassified': return 'unclassified';
        // `null` — never recorded. Any OTHER string is a label this register does not know; it is
        // reported as unrecorded rather than mapped to the nearest known class.
        default: return 'not-recorded';
    }
}

function classText(cls: SetbackEdgeClass): string {
    switch (cls) {
        case 'front': return 'front (street frontage)';
        case 'side': return 'side';
        case 'rear': return 'rear';
        case 'unclassified': return 'recorded as unclassified — nobody has decided which edge this is';
        case 'not-recorded': return 'not recorded — nobody has classified which edge this is';
    }
}

function constraintFor(cls: SetbackEdgeClass): ParcelLawSetbackConstraint | null {
    switch (cls) {
        case 'front': return 'setback.front';
        case 'side': return 'setback.side';
        case 'rear': return 'setback.rear';
        default: return null;
    }
}

const citeOf = (rule: ParcelLawRule | undefined): string =>
    rule?.ordinanceRef ? rule.ordinanceRef : 'no citation held in the derivation trace';

/**
 * THE register. Pure; total; never throws.
 *
 * ⚠ Every branch below is a DIFFERENT fact about the edge. Read the header before merging any two.
 */
export function buildSetbackRegister(model: ParcelLawModel): SetbackRegister {
    const span = _tracer.startSpan('pryzm.site.buildSetbackRegister');
    try {
        const geo = model.geometry;
        if (!geo) {
            span.setAttribute('pryzm.setbackRegister.kind', 'no-parcel');
            return { kind: 'no-parcel', sentence: NO_PARCEL_SENTENCE, rows: [] };
        }

        const ringLength = geo.edges.length;
        const rules = model.ordinance?.rules ?? {};
        const depthRule = rules['alignment.depth'];
        const offsetRule = rules['alignment.offset'];
        const hasClassSetbacks =
            rules['setback.front'] !== undefined || rules['setback.side'] !== undefined || rules['setback.rear'] !== undefined;
        // An alignment zone is one whose trace carries the depth and NO per-class setback rows —
        // the depth IS the rule (C58 §1.7 / ADR-0270 / §L-518c). Read, not inferred: both facts
        // are rows of the trace, or their absence.
        const alignmentGoverned = depthRule !== undefined && !hasClassSetbacks;

        const verdictFor = (cls: SetbackEdgeClass, label: string): SetbackVerdict => {
            if (model.envelopeState === 'refused') {
                return {
                    kind: 'refused',
                    sentence:
                        `${label}: no setback is stated. The determination for this parcel is a refusal`
                        + (model.refusal ? ` — ${model.refusal.headline}` : '')
                        + '. A refusal carries no numeric constraint by design (C58 §1.13).',
                };
            }
            if (model.envelopeState === 'absent') {
                return {
                    kind: 'no-determination',
                    sentence:
                        `${label}: no determination has been solved for this parcel yet, so no setback can be `
                        + 'stated against this edge. This is an absence, not a zero.',
                };
            }
            const constraint = constraintFor(cls);
            if (constraint === null) {
                return {
                    kind: 'class-unknown',
                    sentence:
                        `${label}: which rule applies depends on whether this edge is the front, a side or `
                        + `the rear, and that is ${cls === 'unclassified' ? 'recorded as undecided' : 'not recorded'}. `
                        + 'PRYZM will not infer it.',
                };
            }
            const rule = rules[constraint];
            if (rule !== undefined && rule.valueM !== null) {
                return {
                    kind: 'applied',
                    constraint,
                    valueM: rule.valueM,
                    ordinanceRef: rule.ordinanceRef,
                    provenance: rule.provenance,
                    sentence:
                        `${label} (${cls}): ${fmtM(rule.valueM)} setback applies — ${constraint} · `
                        + `${citeOf(rule)}${rule.provenance ? ` · ${rule.provenance}` : ''}.`,
                };
            }
            if (alignmentGoverned) {
                const depth = depthRule?.valueM ?? null;
                const offset = offsetRule?.valueM ?? null;
                const ref = depthRule?.ordinanceRef ?? offsetRule?.ordinanceRef ?? null;
                const depthText = depth !== null ? fmtM(depth) : 'a depth the pack did not put a number to';
                return {
                    kind: 'alignment-governed',
                    depthM: depth,
                    offsetM: offset,
                    ordinanceRef: ref,
                    sentence: cls === 'front'
                        ? `${label} (front): this zone is alignment-governed — the buildable depth of ${depthText} `
                          + `is measured from this edge`
                          + (offset !== null ? `, with an alignment offset of ${fmtM(offset)}` : ', and no numeric offset was derived')
                          + ` · ${ref ?? 'no citation held in the derivation trace'}.`
                        : `${label} (${cls}): no setback is derived from this edge. This zone is alignment-governed — `
                          + `the buildable depth of ${depthText} is measured from the front alignment, not from here `
                          + `· ${ref ?? 'no citation held in the derivation trace'}.`,
                };
            }
            return {
                kind: 'not-derived',
                constraint,
                sentence:
                    `${label} (${cls}): not derived — the rule pack produced no ${constraint} for this zone. `
                    + 'PRYZM does not infer one; an inferred setback would be indistinguishable from a derived one.',
            };
        };

        const rows: SetbackRegisterRow[] = geo.edges.map((edge): SetbackRegisterRow => {
            const cls = classOf(edge);
            const label = `Edge ${edge.index + 1}`;
            return {
                index: edge.index,
                label,
                lengthM: edge.lengthM,
                edgeClass: cls,
                classText: classText(cls),
                verdict: verdictFor(cls, label),
                highlightSubject: edgeHighlightSubject(edge.index),
                availability: describeEdgeHighlightAvailability(edge.index, ringLength),
            };
        });

        const classified = rows.filter((r) => r.edgeClass === 'front' || r.edgeClass === 'side' || r.edgeClass === 'rear').length;
        const unknown = rows.length - classified;
        const summary =
            `${rows.length} edge${rows.length === 1 ? '' : 's'} · ${classified} classified`
            + (unknown > 0 ? ` · ${unknown} class unknown` : '')
            + (model.envelopeState === 'refused' ? ' · determination refused'
                : model.envelopeState === 'absent' ? ' · no determination yet'
                : alignmentGoverned ? ' · alignment-governed zone' : '');

        span.setAttribute('pryzm.setbackRegister.kind', 'rows');
        span.setAttribute('pryzm.setbackRegister.edges', rows.length);
        span.setAttribute('pryzm.setbackRegister.classUnknown', unknown);
        return {
            kind: 'rows',
            rows: Object.freeze(rows),
            summary,
            lede: SETBACK_REGISTER_LEDE,
            anyClassUnknown: unknown > 0,
        };
    } finally {
        span.end();
    }
}
