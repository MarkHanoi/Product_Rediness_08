// LANE DK-BINDING (2026-09-02) — the byggefelt BINDING-vs-MAXIMUM distinction, as an ENVELOPE
// contribution. The never-UNDERSTATE dual of the never-overstate machinery.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS — and why it is NOT already in the placement resolver
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A Danish byggefelt is a published buildable-field polygon. `evidence/byggefeltEvidence.ts` already
// classifies its LEGAL STATUS from the municipal flags, and `rulepacks/dkEnvelopePlacement.ts`
// already consumes a BINDING field AS GEOMETRY (the tier-1 explicit-area footprint). Both are
// LANDED. This module adds the ONE distinction those two do not draw: WHAT the field's geometry
// MEANS on the buildable-envelope axis.
//
//   • `bygkunifelt = true` ("byggeri kun i felt" — build ONLY within the field) is not merely a cap
//     on WHERE you may build. The census (2026-09-02, feature 1214869 / Lokalplan 593 "Lindgreens
//     Allé II") re-proved it as a MANDATORY placement: the building MUST occupy the field. That is a
//     MIN obligation — a never-UNDERSTATE fact.
//   • `bygkunifelt = false` (advisory `bygvejledende=true`, or an undeclared field) is the other
//     reading: the field geometry is a buildable-area MAXIMUM — an UPPER BOUND you may build up to
//     but need not fill. This is the schema's existing `footprintIsUpperBound` semantics.
//
// The failure this module exists to name: drawing a binding (`bygkunifelt=true`) field as merely
// "permitted up to this shape" UNDERSTATES the obligation. A maximum and a mandatory placement can
// be the SAME polygon and mean OPPOSITE things — one says "no more than this", the other "no less
// than this". Collapsing them is the never-UNDERSTATE mirror of the §CONTEXT-DATA-HONESTY
// overstatement class (memory: envelope-solid-overstates-partial-data), and it is the E5/reconcile
// axis this lane opens.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §OBLIGATION-SEMANTICS-OWED — the honest debt, recorded BY NAME, never faked
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `BuildableEnvelope` (packages/schemas/src/site/zoning/BuildableEnvelope.ts, C58 §2.4) carries
// `footprintIsUpperBound: boolean` — the MAX side — and NOTHING on the MIN/obligation side. There is
// no `footprintIsRequired`. The schema is FROZEN this lane, so the obligation half of a binding
// field is NOT representable in the shipped envelope shape. Per the lane's honesty rule we do NOT
// invent a schema field and we do NOT fake the semantics: we
//   1. type the distinction correctly HERE, in this package-local contribution (`footprintIsRequired`
//      is a field of THIS type, not of the L0 schema);
//   2. record the debt by name in `DK_BYGGEFELT_OBLIGATION_OWED`; and
//   3. ship a binding field down the SAME geometry (explicit-area / maximum) path the envelope
//      already has, carrying a typed caveat that says exactly what is shown and what is owed.
// So a binding field is never rendered as a solved permission; it is rendered as its geometry with
// the obligation stated in prose and OWED in the type system, until a superseding ADR grows the
// schema a real MIN flag.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MODULE IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// NOT a re-classifier. Bindingness comes from the ONE classifier `classifyByggefeltLegalStatus`
// (§DO-NOT-TEXT-CLASSIFY-THE-ADVISORY-SET, §NULL-IS-NOT-FALSE both apply and are inherited, not
// re-decided). NOT a geometry solver — the parcel∩footprint clip that makes the field never
// OVER-state stays in `geometry/explicitArea.ts::solveExplicitArea`; this module decides the
// SEMANTIC TYPE of the contribution, and the height/storeys ride through the L-449 signed numeric
// mapping `resolveDkPlanEnvelope` unchanged (so a real Copenhagen point flows through
// dkPlandataEnvelope, not a twin).
//
// PURE (C58 §1.9) — no I/O, no THREE, no DOM, no clock, no RNG. Total functions + data.
//
// Strategic context — census `audit/envelope-geometry-census/2026-09-02/` (DK Type-A exemplar),
// STR-EUROPEAN-ENVELOPE-SOURCES.md §8, ADR-0279 §2/§6, C58 §1.4/§1.6/§2.4, L-449, L-616, L-619.

import {
    classifyByggefeltLegalStatus,
    type DkByggefeltClassification,
    type DkByggefeltProperties,
} from '../evidence/byggefeltEvidence.js';
import type {
    EvidenceCitation,
    LegalStatus,
    LegalStatusUnknownCause,
} from '../evidence/placementEvidence.js';
import { resolveDkPlanEnvelope } from './dkPlandataEnvelope.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// §OBLIGATION-SEMANTICS-OWED — the schema debt, named so it is auditable and never silently faked.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The named record of the obligation-representation debt this lane surfaces but does NOT close (the
 * schema is frozen). Asserted PRESENT by the fixture arms: a binding field must carry this marker,
 * proving the MIN-occupancy semantics were recorded owed rather than dropped or fabricated.
 */
export const DK_BYGGEFELT_OBLIGATION_OWED = Object.freeze({
    id: 'OBLIGATION-SEMANTICS-OWED',
    what:
        'BuildableEnvelope has no obligation (MIN/required-placement) representation. It carries ' +
        '`footprintIsUpperBound` (the MAX side) but no `footprintIsRequired` — so a mandatory ' +
        'byggefelt placement cannot be encoded on the shipped envelope.',
    proposedField:
        'BuildableEnvelope.footprintIsRequired: z.boolean().default(false) — the never-UNDERSTATE ' +
        'dual of footprintIsUpperBound: TRUE when the footprint is a MANDATORY placement the ' +
        'building must occupy (a bygkunifelt=true byggefelt), not merely a shape it may fill.',
    interimBehaviour:
        'A binding (bygkunifelt=true) field is shipped down the SAME geometry/maximum path as any ' +
        'other explicit-area footprint, with the typed caveat "this is a REQUIRED field, shown as ' +
        'its geometry; obligation semantics owed". Never drawn as a solved permission.',
    owedAgainst:
        'a superseding ADR over C58 §2.4 / packages/schemas/src/site/zoning/BuildableEnvelope.ts.',
} as const);

/** The exact caveat string a binding contribution must surface (asserted verbatim by the arms). */
export const DK_BYGGEFELT_REQUIRED_FIELD_CAVEAT =
    'This is a REQUIRED field, shown as its geometry; obligation semantics owed.';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE CONTRIBUTION TYPE
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * WHAT a byggefelt's geometry MEANS on the buildable-envelope axis. A CLOSED union — these are
 * legally different statements about the same polygon and must never blur.
 */
export type DkByggefeltEnvelopeSemantics =
    /** `bygkunifelt=false` (advisory or undeclared): the field is a buildable-area UPPER BOUND — the
     *  current `footprintIsUpperBound` behaviour. You may build up to it; you need not fill it. */
    | 'maximum'
    /** `bygkunifelt=true` (binding): the field is a MANDATORY placement — the building MUST occupy
     *  it (a MIN obligation). The never-UNDERSTATE case; obligation semantics OWED. */
    | 'binding-obligation'
    /** The metadata is self-contradictory or unpublished (null): the field cannot be typed as
     *  either without inventing a determination — so it types as NEITHER (§NULL-IS-NOT-FALSE,
     *  §DO-NOT-RECLASSIFY-ADVISORY). It contributes no envelope geometry. */
    | 'not-placeable';

/** How the obligation half of this contribution is carried. */
export type DkByggefeltObligationRepresentation =
    /** Fully representable in the frozen schema (`footprintIsUpperBound`). The `maximum` case. */
    | 'schema-native'
    /** The MIN/required-placement half is NOT representable in the frozen schema — recorded OWED
     *  (`DK_BYGGEFELT_OBLIGATION_OWED`) and carried in this package-local type only. */
    | 'owed';

/**
 * One byggefelt's contribution to the DK buildable envelope, TYPED by what its geometry means.
 *
 * The `footprintIsUpperBound` field maps 1:1 onto the schema field of the same name (schema-native).
 * The `footprintIsRequired` field is the OWED dual: it lives ONLY here, because the schema has no
 * home for it (§OBLIGATION-SEMANTICS-OWED). A consumer wiring this into a `BuildableEnvelope` today
 * can set `footprintIsUpperBound` from this record; it must read `footprintIsRequired` /
 * `obligationRepresentation` / `caveats` to learn what it CANNOT yet encode.
 */
export interface DkByggefeltEnvelopeContribution {
    readonly semantics: DkByggefeltEnvelopeSemantics;
    /** Schema-native (MAX side). TRUE for `maximum`; FALSE for `binding-obligation`. `false` for the
     *  binding case because a mandatory placement is NOT an upper bound. Meaningless for
     *  `not-placeable` (no geometry contributed) — reported `false`. */
    readonly footprintIsUpperBound: boolean;
    /** OWED (MIN side). TRUE iff `binding-obligation`. NOT a schema field — see the type header. */
    readonly footprintIsRequired: boolean;
    readonly obligationRepresentation: DkByggefeltObligationRepresentation;
    /** The inherited legal status from the single classifier — never re-decided here. */
    readonly legalStatus: LegalStatus;
    /** The `unknown` cause, when the classifier could not determine bindingness. */
    readonly unknownCause: LegalStatusUnknownCause | null;
    /** The raw coerced flags, carried so a reader sees exactly what the municipality published. */
    readonly bygkunifelt: boolean | null;
    readonly bygvejledende: boolean | null;
    /** maks. bygningshøjde (m), via the L-449 signed mapping (`resolveDkPlanEnvelope`). */
    readonly maxHeightM: number | null;
    /** maks. antal etager (floored int), via the same signed mapping. */
    readonly maxStoreys: number | null;
    /** `eareal` — the published max GFA (m²) for the field, when present. A FACT, never a default. */
    readonly maxGfaM2: number | null;
    /** The governing lokalplan citation, built from the feature's own plan fields. Never fabricated. */
    readonly citation: EvidenceCitation;
    /** What the source said and what was concluded — the audit line. */
    readonly determination: string;
    /** Caveats a consumer MUST surface with the contribution. */
    readonly caveats: readonly string[];
    /** The OWED debt marker, present iff `obligationRepresentation === 'owed'`; else null. */
    readonly obligationOwed: typeof DK_BYGGEFELT_OBLIGATION_OWED | null;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// CITATION — built from the feature's own plan fields, never invented
// ──────────────────────────────────────────────────────────────────────────────────────────────

function str(v: unknown): string | null {
    if (typeof v === 'string') {
        const t = v.trim();
        return t.length > 0 ? t : null;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

/** Build the lokalplan citation from `lp_plannr` / `lp_plannavn` / `kommunenavn` / `doklink`. */
export function dkByggefeltCitation(props: DkByggefeltProperties): EvidenceCitation {
    const plannr = str(props.lp_plannr);
    const plannavn = str(props.lp_plannavn);
    const kommune = str(props.kommunenavn);
    const doklink = str(props.doklink);
    const documentParts: string[] = [];
    documentParts.push(plannr !== null ? `Lokalplan ${plannr}` : 'Lokalplan (nr. unpublished)');
    if (kommune !== null) documentParts.push(`(${kommune})`);
    let document = documentParts.join(' ');
    if (plannavn !== null) document += ` — ${plannavn}`;
    const citation: EvidenceCitation = { document };
    return doklink !== null ? { ...citation, url: doklink } : citation;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// THE RESOLVER
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Type a byggefelt's ENVELOPE contribution as MAXIMUM vs BINDING-OBLIGATION vs NOT-PLACEABLE.
 *
 * Bindingness is read from the single classifier `classifyByggefeltLegalStatus` — NOT re-decided.
 * The mapping from legal status to envelope semantics:
 *
 *   legalStatus 'binding'  (bygkunifelt=true, bygvejledende=false) → 'binding-obligation'  (MIN, OWED)
 *   legalStatus 'illustrative' (bygvejledende=true)               → 'maximum'  (upper bound)
 *   legalStatus 'unknown' / not-declared (both false)             → 'maximum'  (upper bound; G5 text)
 *   legalStatus 'unknown' / metadata-conflict (both true)         → 'not-placeable'
 *   legalStatus 'unknown' / metadata-unavailable (null flag)      → 'not-placeable'  (§NULL-IS-NOT-FALSE)
 *
 * The two `not-placeable` causes are kept distinct via `unknownCause`: a conflict is routed to QA,
 * an unavailable flag is retryable — a maximum footprint may be drawn from NEITHER, because a
 * self-contradictory or unpublished record is not a basis for any placement (§CONTEXT-DATA-HONESTY).
 *
 * PURE, total, never throws.
 */
export function resolveDkByggefeltEnvelopeContribution(
    props: DkByggefeltProperties,
): DkByggefeltEnvelopeContribution {
    const classification: DkByggefeltClassification = classifyByggefeltLegalStatus(props);
    // Height + storeys ride through the L-449 signed numeric mapping (dkPlandataEnvelope). The
    // byggefelt carries no bebyggelsesprocent (that lives on the ramme), so FAR is honestly absent.
    const numeric = resolveDkPlanEnvelope({
        maxHeightM: props.maxbygnhjd as number | string | null | undefined,
        maxStoreys: props.maxetager as number | string | null | undefined,
        doklink: str(props.doklink),
    });
    const maxGfaM2 = posNumberOrNull(props.eareal);
    const citation = dkByggefeltCitation(props);

    const base = {
        legalStatus: classification.legalStatus,
        unknownCause: classification.unknownCause,
        bygkunifelt: classification.bygkunifelt,
        bygvejledende: classification.bygvejledende,
        maxHeightM: numeric.maxHeightM,
        maxStoreys: numeric.maxStoreys,
        maxGfaM2,
        citation,
    } as const;

    // ── BINDING OBLIGATION — the never-UNDERSTATE case. ──────────────────────────────────────
    if (classification.legalStatus === 'binding') {
        return {
            ...base,
            semantics: 'binding-obligation',
            footprintIsUpperBound: false,
            footprintIsRequired: true,
            obligationRepresentation: 'owed',
            determination:
                'BINDING OBLIGATION: bygkunifelt=true ("byggeri kun i felt" — build ONLY within the ' +
                'field). The field is a MANDATORY placement (a MIN obligation — the building MUST ' +
                'occupy it), NOT a maximum. ' +
                classification.determination,
            caveats: [
                DK_BYGGEFELT_REQUIRED_FIELD_CAVEAT,
                'Obligation semantics OWED: BuildableEnvelope has no footprintIsRequired flag ' +
                    '(schema frozen). The MIN/required-placement half is recorded owed ' +
                    '(DK_BYGGEFELT_OBLIGATION_OWED), not encoded. Drawing this field as merely ' +
                    'permitted/maximum would UNDERSTATE the obligation (never-UNDERSTATE axis).',
            ],
            obligationOwed: DK_BYGGEFELT_OBLIGATION_OWED,
        };
    }

    // ── MAXIMUM — the current, fully schema-native behaviour. ────────────────────────────────
    if (classification.legalStatus === 'illustrative') {
        return {
            ...base,
            semantics: 'maximum',
            footprintIsUpperBound: true,
            footprintIsRequired: false,
            obligationRepresentation: 'schema-native',
            determination:
                'MAXIMUM (advisory field): the field geometry is a buildable-area UPPER BOUND — ' +
                'render as a study, never a solved footprint. ' +
                classification.determination,
            caveats: [
                'Advisory byggefelt (bygvejledende=true): shown as a buildable-area upper bound ' +
                    '(footprintIsUpperBound=true). It may NOT place a definitive footprint ' +
                    '(§BYGGEFELT-BINDING-GATE); it is not an obligation.',
            ],
            obligationOwed: null,
        };
    }
    if (classification.legalStatus === 'unknown' && classification.unknownCause === 'not-declared') {
        return {
            ...base,
            semantics: 'maximum',
            footprintIsUpperBound: true,
            footprintIsRequired: false,
            obligationRepresentation: 'schema-native',
            determination:
                'MAXIMUM (bindingness not declared): both flags false. The field geometry is treated ' +
                'as a buildable-area UPPER BOUND; the lokalplan text is the remaining source (G5). ' +
                classification.determination,
            caveats: [
                'Byggefelt with no bindingness declared (bygkunifelt=false, bygvejledende=false): ' +
                    'shown as a buildable-area upper bound; not an obligation. The lokalplan text is ' +
                    'the correctly-scoped source to confirm either reading (DK gap G5).',
            ],
            obligationOwed: null,
        };
    }

    // ── NOT PLACEABLE — conflict or unavailable. Types as NEITHER. ────────────────────────────
    return {
        ...base,
        semantics: 'not-placeable',
        footprintIsUpperBound: false,
        footprintIsRequired: false,
        obligationRepresentation: 'schema-native',
        determination:
            'NOT PLACEABLE: the metadata cannot be typed as maximum OR obligation without inventing ' +
            'a determination. ' +
            classification.determination,
        caveats: [
            classification.unknownCause === 'metadata-conflict'
                ? 'CONTRADICTORY metadata (bygkunifelt AND bygvejledende both true): routed to QA, ' +
                  'resolved by the municipality — never inferred. Contributes no envelope geometry.'
                : 'Bindingness flag NULL/unpublished (§NULL-IS-NOT-FALSE): null is not false, so the ' +
                  'field is not a declared maximum either. Retryable (ingestion/publication gap). ' +
                  'Contributes no envelope geometry until re-fetched.',
        ],
        obligationOwed: null,
    };
}

/** Coerce a raw WFS value to a positive finite number, else null (honest absence). Mirrors the DK
 *  numeric coercion; kept local so this pure module has no cross-import for one predicate. */
function posNumberOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}
