// @pryzm/ordinance-extraction — the LEGAL ATTRIBUTION MODEL.
//
// The layer that decides WHICH correctly-read value binds.
//
// WHY THIS EXISTS
// ---------------
// Parsers read values correctly and packs are still wrong, because nothing decides
// which reading is authoritative. Berlin B-Plan 8-30 yields GRZ 0,3 · 0,39 · 0,4 ·
// 0,8 and EVERY ONE is a correct reading of its sentence — only 0,4 is the plan's
// binding Festsetzung (§9 BauGB). 0,3 is the 1958/60 Baunutzungsplan's *depiction*
// (`dargestellt`, §5 BauGB); taking 0,8 overstates buildable footprint 2×.
// (`de/findings/GERMANY-PDF-INGESTION-WP1-WP6.md` §4, VERIFIED over 209 pages.)
//
// THE CENTRAL CLAIM: legal status is a property of a STATEMENT, not of a document.
// One binding plan contains, in its own voice, a binding Festsetzung, a superseded
// instrument's depiction, a statutory overrun allowance, and a descriptive
// computation. A model that hangs `legalStatus` off the DOCUMENT cannot say that.
// This one hangs it off the EVIDENCE.
//
// Reference model: Denmark's `bygkunifelt`/`bygvejledende` state machine
// (`dk/findings/BYGGEFELT-BINDINGNESS-PROBE-2026-07-31.md` §4) — the one
// jurisdiction where the register publishes bindingness as a boolean. This module
// generalises that shape to jurisdictions that must derive it from plan text
// (Germany) or statute (Madrid), and to jurisdictions where it is simply not known
// (Paris) — which must resolve to a refusal, never to a guess.
//
// Vocabulary ratified in `standards/ENVELOPE-REPLICATION-STANDARD.md`
// §"Legal status is an evidence attribute, not a conclusion".
// Full design: `standards/LEGAL-ATTRIBUTION-MODEL.md`.
//
// Pure data + types: no I/O, no THREE, no DOM (P5-consistent; L2 leaf).

/**
 * WHICH KIND of legal instrument a statement belongs to.
 *
 * The load-bearing member is `depiction`. German planning law marks the difference
 * with legally exact verbs — `festgesetzt` (§9 BauGB: *this* plan binds) versus
 * `dargestellt` (§5 BauGB: a preparatory instrument merely *depicts*) — and that
 * distinction is what the Berlin regression turned on. Nothing else in the codebase
 * had an axis for "this document is describing ANOTHER instrument's content".
 *
 *   - `binding-plan`      — the instrument whose OWN determination this is
 *                           (B-Plan Festsetzung; PGOUM Norma Zonal; Lokalplan).
 *   - `superseded-plan`   — an instrument no longer in force for this parcel.
 *   - `depiction`         — THIS document describing another instrument's content.
 *   - `catalogue-overlay` — a catalogue / protection listing layered over a base
 *                           plan (Madrid Catálogos de Protección, Art. 8.0.6).
 *   - `special-plan`      — an area-specific regime that SUBSTITUTES for the base
 *                           plan (Madrid API / APE / APR — Art. 8.0.4 makes the área
 *                           classes mutually exclusive).
 *   - `statute`           — national/regional law applying above any plan
 *                           (BauNVO §19(4); BR18).
 *   - `unknown`           — could not classify. MANDATORY (see the enum note below).
 *
 * ⚠ `depiction` is ORTHOGONAL to whether the depicted instrument is in force.
 * Berlin 8-30 p8 says the Baunutzungsplan *"weiter gilt"* — still applies — and its
 * GRZ 0,3 still does not bind this parcel, because 8-30's own Festsetzung supersedes
 * it there. Such evidence carries `kind: 'depiction'` AND `legalStatus: 'superseded'`.
 * Two independent facts, both true.
 */
export type InstrumentKind =
    | 'binding-plan'
    | 'superseded-plan'
    | 'depiction'
    | 'catalogue-overlay'
    | 'special-plan'
    | 'statute'
    | 'unknown';

/** Every `InstrumentKind`, for exhaustiveness checks and the invariant-3 test. */
export const INSTRUMENT_KINDS: readonly InstrumentKind[] = [
    'binding-plan',
    'superseded-plan',
    'depiction',
    'catalogue-overlay',
    'special-plan',
    'statute',
    'unknown',
];

/**
 * Whether this STATEMENT binds. Ratified in ENVELOPE-REPLICATION-STANDARD.md;
 * `superseded` is the fourth member, because superseded / illustrative / absent /
 * errored are FOUR different results and collapsing them is the `failure ≠ absence`
 * family (L-422/457/467/469).
 *
 *   - `binding`      — this statement determines the parameter.
 *   - `illustrative` — descriptive/advisory: DK `bygvejledende`, or Berlin 8-30's
 *                      *"rechnerische GRZ von 0,39"* — a figure the plan's own author
 *                      COMPUTED to describe existing building.
 *   - `superseded`   — was a determination, is not one now (for this parcel).
 *   - `unknown`      — could not establish. MANDATORY.
 */
export type LegalStatus = 'binding' | 'illustrative' | 'superseded' | 'unknown';

/** Every `LegalStatus`. */
export const LEGAL_STATUSES: readonly LegalStatus[] = [
    'binding',
    'illustrative',
    'superseded',
    'unknown',
];

/**
 * HOW we know the legal status. The resolver NEVER reads this — that is precisely
 * what lets a new country be added as a PRODUCER rather than as new resolver logic
 * (DK probe §6).
 *
 *   - `metadata`   — the register publishes it (Denmark: `bygkunifelt` boolean).
 *   - `plan_text`  — the plan's own wording decides (Germany: `festgesetzt` vs
 *                    `dargestellt`).
 *   - `statute`    — a statute decides (Madrid: the PGOUM determines legal force).
 *   - `unresolved` — not established. MANDATORY, and the Paris answer today.
 */
export type LegalStatusSource = 'metadata' | 'plan_text' | 'statute' | 'unresolved';

/** Every `LegalStatusSource`. */
export const LEGAL_STATUS_SOURCES: readonly LegalStatusSource[] = [
    'metadata',
    'plan_text',
    'statute',
    'unresolved',
];

/**
 * What SHAPE the rule is — i.e. can it become a number at all.
 *
 * Deliberately NOT an input to ranking (`resolve.ts` ranks by instrument only). Its
 * one job is to make a null value SAY WHY, so a downstream consumer never turns
 * "the value lives on the drawing" into 0 (L-616: unknown ≠ 0 ≠ permissive default).
 *
 *   - `numeric`       — a stored number.
 *   - `formula`       — computed from other parameters (Barcelona Art. 242.2 is an
 *                       ALGORITHM, not a lookup — ADR-0271).
 *   - `graphical`     — the value lives on a drawing ("ergibt sich aus der
 *                       Planzeichnung", "segons plànol O 1.2").
 *   - `conditional`   — binds only under a stated condition (BauNVO §19(4): the 0,8
 *                       ceiling applies to Garagen und Nebenanlagen, not the base).
 *   - `reference`     — defers to another instrument.
 *   - `prohibited`    — the use/works are forbidden. A POSITIVE answer, not an absence.
 *   - `discretionary` — a named authority decides case-by-case (Madrid NZ 1 grados
 *                       1–5 height is CPPHAN-discretionary, Art. 8.1.15.1).
 *   - `unknown`       — could not classify.
 *
 * ⚠ `discretionary` is a POSITIVE LEGAL CLAIM and must never stand in for "could not
 * classify". France's first taxonomy dropped `unknown` and thereby forced every
 * unclassifiable rule into a positive claim. Every enum in this module carries
 * `unknown` for exactly that reason.
 */
export type RuleKind =
    | 'numeric'
    | 'formula'
    | 'graphical'
    | 'conditional'
    | 'reference'
    | 'prohibited'
    | 'discretionary'
    | 'unknown';

/** Every `RuleKind`. */
export const RULE_KINDS: readonly RuleKind[] = [
    'numeric',
    'formula',
    'graphical',
    'conditional',
    'reference',
    'prohibited',
    'discretionary',
    'unknown',
];

/**
 * How sure we are we READ AND ATTRIBUTED this statement correctly. Ordered.
 *
 * ⚠ This is NOT `EnvelopeConfidence` (`@pryzm/schemas`). Two different axes, kept
 * apart on purpose:
 *   - `EnvelopeConfidence` is the HUMAN-VERIFICATION TIER. Machine output is always
 *     `pipeline-extracted-unverified`; the only door up is a recorded sign-off
 *     (`confidence.ts` LOCK 3 / L-449). This module does not touch it.
 *   - `EvidenceConfidence` is READ/ATTRIBUTION certainty, and the resolver is
 *     MONOTONE in it: a resolution can never be more confident than its winner.
 */
export type EvidenceConfidence = 'unknown' | 'low' | 'medium' | 'high';

/** Every `EvidenceConfidence`, weakest first — the order IS the ranking. */
export const EVIDENCE_CONFIDENCES: readonly EvidenceConfidence[] = [
    'unknown',
    'low',
    'medium',
    'high',
];

/** Ordinal of an `EvidenceConfidence` (higher = more confident). */
export function evidenceConfidenceRank(c: EvidenceConfidence): number {
    return EVIDENCE_CONFIDENCES.indexOf(c);
}

/** WHICH legal instrument a statement belongs to. */
export interface InstrumentRef {
    /** Stable id: `'B-Plan 8-30'`, `'PGOUM-97 Compendio 2025 (24-09-2025)'`, `'Lokalplan 274'`. */
    readonly id: string;
    readonly kind: InstrumentKind;
    /** ISO date the instrument took effect, when known. Carried, NOT yet used to rank. */
    readonly effectiveFrom?: string;
    /**
     * The id of the instrument that superseded this one, when known. A STRUCTURAL
     * demotion signal: evidence carrying it is treated as `superseded` regardless of
     * its declared `legalStatus`, because a pointer to a successor is harder evidence
     * than a status field a producer may have defaulted.
     */
    readonly supersededBy?: string;
}

/**
 * A RESOLVED citation — the honesty invariant, mirroring `textExtract/types.ts`
 * `RuleCitation`: a value that cannot point at an exact passage in an exact document
 * is never emitted. `document` and `verbatim` are always present.
 */
export interface EvidenceCitation {
    /** The source document id / title (never empty). */
    readonly document: string;
    /** The governing article (`'8.7.20'`, `'§ 19 Abs. 2 BauNVO'`), when known. */
    readonly article?: string;
    /** The apartado / Absatz within the article, when known. */
    readonly paragraph?: string;
    /** Page index if the source knew it. */
    readonly page?: number;
    /** The EXACT text the value was read from — the evidence a human reviews. */
    readonly verbatim: string;
}

/**
 * ONE candidate reading of ONE parameter, carrying its provenance and its authority.
 *
 * ⚠ `parameter` is a `string`, NOT the `ExtractableField` enum — on purpose. Madrid's
 * only EXPRESS precedence clause (Art. 8.0.6) governs `worksRegime` and
 * `hospedajeUseConditions`; neither is a buildable-envelope field, and both are
 * load-bearing for the Spanish priority table. Narrowing the type would make the one
 * real Spanish precedence rule inexpressible. The attribution layer takes the
 * caller's parameter vocabulary and never rewrites it.
 *
 * ⚠ `value: null` is LEGITIMATE and carries meaning via `ruleKind` — `prohibited`
 * (a positive answer), `graphical` (the number is on the drawing), `unknown` (could
 * not read). It must NEVER become 0 or a permissive default (L-616).
 */
export interface ParameterEvidence<T> {
    /** `'maxHeight_m'` | `'farRatio'` | `'buildableDepth_m'` | `'worksRegime'` … */
    readonly parameter: string;
    readonly value: T | null;
    /** Free-text unit as the source states it (`'m'`, `'m²/m²'`, `'%'`). NOT checked here. */
    readonly unit?: string;
    readonly instrument: InstrumentRef;
    readonly legalStatus: LegalStatus;
    readonly legalStatusSource: LegalStatusSource;
    readonly ruleKind: RuleKind;
    readonly citation: EvidenceCitation;
    readonly confidence: EvidenceConfidence;
    /** One line a human reads: anything the other fields cannot carry. */
    readonly note?: string;
}

/**
 * WHY a candidate lost. Every rejection is recorded — a resolver that silently drops
 * evidence is indistinguishable from one that never saw it.
 */
export type RejectionReason =
    /** `legalStatus: 'superseded'`, or an `instrument.supersededBy` pointer. */
    | 'superseded'
    /** `legalStatus: 'illustrative'` — descriptive/advisory, never a determination. */
    | 'illustrative'
    /** `legalStatus: 'unknown'` while a known-binding candidate exists. */
    | 'unestablished-legal-status'
    /** `value === null` — carries no value to resolve to. */
    | 'no-value'
    /** Outranked by a stronger instrument under the jurisdiction's priority table. */
    | 'outranked';

/** One rejected candidate, with the reason and a human-readable detail. */
export interface RejectedEvidence<T> {
    readonly evidence: ParameterEvidence<T>;
    readonly reason: RejectionReason;
    readonly detail: string;
}

/**
 * WHY a parameter is `unknown`. Distinct codes for distinct situations — invariant 4
 * (superseded / illustrative / absent / errored are four different results).
 */
export type AttributionUnknownReason =
    /** Nothing was supplied. */
    | 'no-candidates'
    /**
     * EVERY candidate's `legalStatus` is `unknown`. A resolver cannot manufacture
     * certainty from a set of uncertainties — INVARIANT 2.
     */
    | 'no-candidate-has-established-legal-status'
    /** Candidates exist but every one is superseded and/or illustrative. */
    | 'all-candidates-non-binding'
    /**
     * A binding candidate survives but carries no value — the number is on a drawing,
     * is a formula, or the use is prohibited. `detail` names the `ruleKind`. NEVER 0.
     */
    | 'binding-candidate-carries-no-value'
    /**
     * The resolver itself threw and the failure was contained.
     *
     * ⚠ ITS OWN CODE, on purpose. "We errored" and "we looked and could not establish
     * the legal status" are DIFFERENT RESULTS — collapsing them is the `failure ≠
     * absence` family (L-422/457/467/469), and it is the exact mistake this code was
     * added to fix: the first draft of `resolveParameter` reused
     * `no-candidate-has-established-legal-status` for its catch block, which would have
     * made a crash indistinguishable from an honest un-established status.
     */
    | 'internal-error';

/** Every `AttributionUnknownReason`. */
export const ATTRIBUTION_UNKNOWN_REASONS: readonly AttributionUnknownReason[] = [
    'no-candidates',
    'no-candidate-has-established-legal-status',
    'all-candidates-non-binding',
    'binding-candidate-carries-no-value',
    'internal-error',
];

/** WHY the resolver refused to pick. */
export type ConflictReason =
    /** No priority table is registered for this jurisdiction — Paris. */
    | 'no-priority-table'
    /** A surviving candidate's `InstrumentKind` has no rank in the table. */
    | 'unrankable-instrument-kind'
    /**
     * ≥2 candidates share the STRONGEST rank and state DIFFERENT values —
     * INVARIANT 1. Madrid NZ 7.2.e. Carries no value, ever.
     */
    | 'tie-on-authority';

/** Every `ConflictReason`. */
export const CONFLICT_REASONS: readonly ConflictReason[] = [
    'no-priority-table',
    'unrankable-instrument-kind',
    'tie-on-authority',
];

/**
 * Exactly one candidate binds. `confidence` is COPIED from the winner and is never
 * computed upward (invariant 2).
 */
export interface ResolvedAttribution<T> {
    readonly status: 'resolved';
    readonly parameter: string;
    readonly value: T;
    readonly winner: ParameterEvidence<T>;
    readonly rejected: readonly RejectedEvidence<T>[];
    readonly reason: string;
    /** Always `winner.confidence`. Never higher. */
    readonly confidence: EvidenceConfidence;
}

/**
 * The resolver has NO BASIS to choose. Carries NO `value` key AT ALL — not
 * `value: null`, not `value: undefined` — so `'value' in resolution` is a sound test
 * and a careless `resolution.value ?? 0` cannot compile past a type check.
 */
export interface ConflictedAttribution<T> {
    readonly status: 'conflicted';
    readonly parameter: string;
    /** Every candidate still standing when the tie was found. Never collapsed. */
    readonly candidates: readonly ParameterEvidence<T>[];
    /** Candidates already dropped before the tie (superseded, illustrative, …). */
    readonly rejected: readonly RejectedEvidence<T>[];
    readonly reasonCode: ConflictReason;
    readonly reason: string;
}

/** No value, with the honest reason. Carries no `value` key. */
export interface UnknownAttribution<T> {
    readonly status: 'unknown';
    readonly parameter: string;
    readonly rejected: readonly RejectedEvidence<T>[];
    readonly reasonCode: AttributionUnknownReason;
    readonly reason: string;
}

/**
 * The resolver's outcome — resolved, conflicted, or unknown. Mirrors
 * `envelope/types.ts` `EnvelopeParameterOutcome` exactly: this layer EXTENDS the
 * package's three-outcome contract, it does not replace it.
 */
export type Resolution<T> =
    | ResolvedAttribution<T>
    | ConflictedAttribution<T>
    | UnknownAttribution<T>;
