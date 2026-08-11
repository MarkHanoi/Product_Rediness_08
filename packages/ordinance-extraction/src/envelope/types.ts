// @pryzm/ordinance-extraction — the TYPED ENVELOPE PARAMETER output shape.
//
// The last stage of the born-digital text path: cited `ExtractedRule[]` (many, in
// document order, possibly repeated and possibly contradictory) → ONE typed
// parameter set a downstream envelope solver can consume.
//
// This is the "rule mapper → { GRZ, GFZ, Z, Höhe } typed output shape" of
// GERMANY-CITY-ADAPTER-CONTRACT.md §3/§6, which that contract ranks as **100%
// reusable** across cities ("national output contract"). It is deliberately NOT
// German: it speaks the pan-jurisdiction C58 §2.2 field vocabulary, so the Spanish
// and Danish grammars land in the same shape.
//
// THE CENTRAL DESIGN DECISION — three outcomes, never two.
// A parameter is `resolved`, `conflicted`, or `unknown`. The middle one is the
// point. A 215-page Begründung states GRZ many times, and different Baugebiete
// (WA 1 / WA 2) inside ONE plan carry DIFFERENT values. This text-parse core reads
// a document, not a parcel — it has no zone attribution, so when two distinct
// values appear for one parameter it has NO basis to choose. Picking the first, or
// the max, or the modal value would be a confident-wrong answer of exactly the kind
// L-590g measured as the dominant risk (the "parcel-binding gap"). So it returns
// BOTH, cited, as a `conflicted` outcome carrying no value at all.
//
// Pure data + types: no I/O, no THREE, no DOM (P5-consistent; L2 leaf).

import {
    type DomainConfidence,
    type EnvelopeConfidence,
    type FieldProvenance,
    type LandBasis,
    type LandBasisRefusal,
} from '@pryzm/schemas';
import {
    type ExtractableField,
    type GateResult,
    type NonNumericRule,
} from '../types.js';
import {
    type FieldUnknownReason,
    type HeightMeasurement,
    type RejectedMatch,
    type RuleCitation,
    type RuleUnit,
} from '../textExtract/types.js';

/**
 * The identity of ONE envelope parameter.
 *
 * For most fields this is just the field name. For HEIGHTS it is `field@datum` —
 * a Traufhöhe of 12,5 m and a Firsthöhe of 15,0 m in the same plan are two
 * DIFFERENT parameters, not a contradiction, and merging them by field name would
 * manufacture a conflict that does not exist (or, worse, silently drop the ridge).
 * The datum is load-bearing; the key says so (memory §TERRAIN-RASANT).
 */
export type ParameterKey = string;

/** Build the key for a parameter. Heights are keyed by their datum, others by field. */
export function parameterKey(
    field: ExtractableField,
    measurement?: HeightMeasurement,
): ParameterKey {
    return field === 'maxHeight_m' ? `${field}@${measurement ?? 'unknown'}` : field;
}

/**
 * A `GateResult` from a whole-envelope coherence check, which may additionally have REFUSED
 * on the DENOMINATOR (W5-2).
 *
 * ⚠ WHY THE REFUSAL IS A SEPARATE FIELD AND NOT A FOURTH `GateVerdict`. `verdict` is read by
 * every gate consumer (`flags = gates.filter(g => g.verdict === 'flag')`); adding a member
 * would make each of those silently ignore the new state — the widening-a-union-breaks-the-
 * exhaustive-readers trap. Instead the verdict stays honest in the existing vocabulary
 * (`flag` when the bases genuinely disagree — a positive finding routed to a human;
 * `not-applicable` when a denominator is unknown or undeclared, so the check could not run)
 * and `denominator` carries the CODE and the REASON alongside it. A refusal reduced to a bare
 * `not-applicable` would be indistinguishable from "a parameter did not resolve", which is the
 * §CONTEXT-DATA-HONESTY collapse this whole module exists to prevent.
 */
export interface CoherenceGateResult extends GateResult {
    /** Present IFF the check refused on the denominator. Absent on a real pass/flag. */
    readonly denominator?: LandBasisRefusal;
}

/** ONE candidate value for a parameter, with the citation that produced it. */
export interface ParameterCandidate {
    readonly value: number;
    readonly citation: RuleCitation;
    readonly rawText: string;
    readonly matcherId: string;
    /**
     * How many DISTINCT cited sentences in this document stated this exact value.
     *
     * ⚠ An audit signal ONLY. It does NOT and must never raise the confidence
     * tier — repetition inside one document is not independent corroboration, and
     * the only door out of `pipeline-extracted-unverified` is a recorded human
     * sign-off (`confidence.ts` `canGraduateTier`, LOCK 3 / L-449).
     */
    readonly corroborations: number;
}

/** A parameter the document states exactly one value for. */
export interface ResolvedParameter {
    readonly status: 'resolved';
    readonly key: ParameterKey;
    readonly field: ExtractableField;
    readonly value: number;
    readonly unit: RuleUnit;
    /**
     * For a RATIO field: WHICH LAND the denominator is (L0 {@link LandBasis}). Carried through
     * from the extracted rule so the whole-envelope coherence gate can REFUSE to relate two
     * ratios over different land instead of silently asserting an identity over an unmodelled
     * denominator (W5-2; C63 §3.2 / L-656; the L-616 over-statement class).
     */
    readonly landBasis?: LandBasis;
    /** For a height field: the datum the metres measure to. */
    readonly measurement?: HeightMeasurement;
    /** The citation of the FIRST sentence stating this value (the review locator). */
    readonly citation: RuleCitation;
    readonly rawText: string;
    readonly matcherId: string;
    /** See {@link ParameterCandidate.corroborations} — audit only, never a tier. */
    readonly corroborations: number;
    /** ALWAYS `pipeline-extracted-unverified`. */
    readonly confidence: EnvelopeConfidence;
    /** ALWAYS `pipeline-extracted`. */
    readonly fieldProvenance: FieldProvenance;
    readonly domainConfidence: DomainConfidence;
    /** Every gate that ran on this value, in order. */
    readonly gates: readonly GateResult[];
    /**
     * `true` only when NO gate flagged. `false` does NOT drop the value — it is
     * still carried so a human reviewer sees a pre-fill — but it must not ship
     * un-reviewed (same semantics as `ExtractedField.autoAccepted`).
     */
    readonly autoAccepted: boolean;
    /** The flagged gates' details (empty when auto-accepted). */
    readonly flags: readonly string[];
}

/**
 * The document states MORE THAN ONE distinct value for this parameter and the
 * text-parse core has no basis to choose between them (no zone attribution). It
 * carries NO value — deliberately. Resolving this needs either zone-scoped
 * extraction or a human, and both are downstream of here.
 */
export interface ConflictedParameter {
    readonly status: 'conflicted';
    readonly key: ParameterKey;
    readonly field: ExtractableField;
    /** Every distinct value found, each cited. Never collapsed to one. */
    readonly candidates: readonly ParameterCandidate[];
    readonly detail: string;
}

/** The document yields no value for this parameter — with the honest reason why. */
export interface UnknownParameter {
    readonly status: 'unknown';
    readonly key: ParameterKey;
    readonly field: ExtractableField;
    readonly reason: FieldUnknownReason;
    /** Present IFF the text pointed at a rule/drawing rather than a number. */
    readonly rule?: NonNumericRule;
    readonly detail: string;
}

/** One parameter's outcome — resolved, conflicted, or unknown. Never silent. */
export type EnvelopeParameterOutcome =
    | ResolvedParameter
    | ConflictedParameter
    | UnknownParameter;

/** Counts a caller can log/assert without walking the outcome list. */
export interface EnvelopeSummary {
    readonly resolved: number;
    /** Of the resolved, how many passed every gate. */
    readonly autoAccepted: number;
    readonly conflicted: number;
    readonly unknown: number;
}

/**
 * The typed envelope parameters read out of ONE document.
 *
 * ⚠ This is a DOCUMENT-level result, not a PARCEL-level one. It says what the
 * ordinance text states; it does not say which parcel those statements bind. The
 * parcel binding (which Baugebiet a Flurstück falls in) is a GIS join that happens
 * downstream — see `conflicted` above.
 */
export interface EnvelopeExtraction {
    readonly ok: true;
    readonly jurisdiction: string;
    readonly document: string;
    readonly outcomes: readonly EnvelopeParameterOutcome[];
    /**
     * Whole-envelope consistency checks between parameters (e.g. FAR ≤ coverage ×
     * floors). Empty means none was APPLICABLE (too few parameters resolved), which
     * is not the same as "all checks passed" — each check reports its own
     * `not-applicable` verdict rather than being omitted.
     */
    readonly coherence: readonly CoherenceGateResult[];
    /** Matches dropped by a reject pattern (audit trail, carried through). */
    readonly rejected: readonly RejectedMatch[];
    readonly summary: EnvelopeSummary;
}
