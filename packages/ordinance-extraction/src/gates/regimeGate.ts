// GATE — legal-regime classifier. Runs FIRST, before any numeric extraction is
// even attempted (GERMANY-CITY-ADAPTER-CONTRACT.md §3; Berlin EXTRACTION-PIPELINE.md
// §2: "A per-parcel / per-plan classification. Numeric extraction is only
// *attempted* for the regimes that produce numbers by law.").
//
// WHY IT IS A GATE AND NOT A LOOKUP. Some legal regimes define no numeric building
// envelope AT ALL. For a German §34 BauGB parcel (unplanned interior area) there is
// no GRZ, no GFZ and no height to find — buildability is assessed case-by-case
// against the surrounding built form. An extractor pointed at such a parcel will
// either return nothing (indistinguishable from a broken pipeline) or, far worse,
// scrape a number out of some neighbouring plan. Both are wrong. The right answer
// is a REFUSAL WITH A CITED REASON, and the contract is explicit that this is a
// POSITIVE product answer rather than a data gap:
//
//   "This parcel lies in an unplanned interior area (§34 BauGB). No numeric
//    building envelope is defined — buildability is assessed case-by-case."
//
// Germany's human-review ceiling is ~65–70% precisely because of this permanent
// ~30% §34/§35 discretionary floor (de/COUNTRY-DATA-STRATEGY.md). Modelling that
// floor as refusals rather than as missing data is what keeps the coverage
// denominator honest.
//
// Jurisdiction-agnostic: the regime TABLE is data supplied per country (see
// `grammars/germanRegimes.ts`). Spain's sòl urbà consolidat / no consolidat split
// and Denmark's lokalplan / kommuneplan-ramme split are the same shape.
//
// Pure: ids + table in, verdict out. Never throws.

import { type EnvelopeConfidence } from '@pryzm/schemas';
import { type GateResult } from '../types.js';

/**
 * How a regime treats numeric extraction (the contract's
 * `numericExtractionAllowed` column, kept as its three literal states rather than
 * collapsed to a boolean, because `conditional` is a genuinely different thing:
 * extract, but never let the value reach the top of the ladder):
 *   - `allowed`     — the regime produces numbers by law; extract normally.
 *   - `refused`     — the regime defines no numeric envelope; NEVER extract.
 *   - `conditional` — extract, but the value is permanently capped and caveated.
 */
export type NumericExtractionMode = 'allowed' | 'refused' | 'conditional';

/** ONE legal planning regime a parcel/plan can fall under. */
export interface PlanningRegime {
    /** Stable id, e.g. `de-bplan-30`, `de-unplanned-34`. */
    readonly id: string;
    /** Human label, e.g. `Qualifizierter B-Plan (§ 30 BauGB)`. */
    readonly displayName: string;
    /** The primary legal instrument, cited — e.g. `BauGB § 30`. */
    readonly legalBasis: string;
    /** Whether numeric extraction may be attempted at all. */
    readonly numericExtraction: NumericExtractionMode;
    /**
     * The CITED, POSITIVE product answer shown when `numericExtraction` is
     * `refused` — the sentence a user reads instead of an empty envelope. Required
     * for a refusing regime: a refusal with no explanation is a silent empty.
     */
    readonly refusal?: string;
    /**
     * A caveat attached to EVERY value extracted under this regime (mirrors the
     * supersession caveat in `pipeline.ts`). A caveated value never auto-accepts.
     */
    readonly caveat?: string;
    /**
     * Tiers a value from this regime may NEVER reach — even after a human signs
     * off. Distinct from the `pipeline-extracted-unverified` lock, which a human
     * CAN lift; this is a permanent legal ceiling on the instrument itself.
     */
    readonly forbiddenTiers?: readonly EnvelopeConfidence[];
}

/** A regime table — the per-jurisdiction data this gate is parameterised by. */
export type RegimeTable = readonly PlanningRegime[];

/** The gate's verdict on one parcel/plan's regime. */
export interface RegimeGateResult {
    /** The matched regime, or null when the id was not in the table. */
    readonly regime: PlanningRegime | null;
    /** Gate the whole extraction: false ⇒ never fetch, never parse. */
    readonly shouldExtract: boolean;
    /** The gate result for the audit trail / `crossChecks` provenance. */
    readonly gate: GateResult;
    /** The cited positive answer when the regime defines no numeric envelope. */
    readonly refusal: string | null;
    /** Caveat to attach to every value extracted under this regime. */
    readonly caveat: string | null;
    /** Tiers no value from this regime may ever reach. */
    readonly forbiddenTiers: readonly EnvelopeConfidence[];
}

/** Look up a regime by id in a table. */
export function findRegime(table: RegimeTable, regimeId: string): PlanningRegime | null {
    return table.find((r) => r.id === regimeId) ?? null;
}

/**
 * Classify a parcel/plan's legal regime and decide whether numeric extraction may
 * be attempted at all.
 *
 * ⚠ AN UNCLASSIFIED REGIME NEVER DEFAULTS TO "ALLOWED". If the id is not in the
 * table the gate FLAGS and refuses. Extracting numbers for a parcel whose legal
 * basis is unknown produces a value with no instrument behind it — the same
 * doubly-wrong citation the supersession gate exists to prevent, arrived at from
 * the other direction.
 *
 * Verdicts:
 *   - `pass`           — the regime produces numbers by law; extract.
 *   - `not-applicable` — the regime defines no numeric envelope; the CITED REFUSAL
 *                        is the answer. Not a flag: nothing went wrong, the law
 *                        simply sets no number here.
 *   - `flag`           — `conditional` (extract but cap/caveat), or an
 *                        unclassified regime (do not extract).
 */
export function regimeGate(regimeId: string, table: RegimeTable): RegimeGateResult {
    const regime = findRegime(table, regimeId);

    if (regime === null) {
        return {
            regime: null,
            shouldExtract: false,
            gate: {
                gate: 'regime',
                verdict: 'flag',
                detail: `Regime "${regimeId}" is not in the jurisdiction's regime table — the legal basis is unclassified, so no numeric extraction may be attempted.`,
                token: 'regime:flag-unclassified',
            },
            refusal: null,
            caveat: null,
            forbiddenTiers: [],
        };
    }

    const common = {
        regime,
        refusal: regime.refusal ?? null,
        caveat: regime.caveat ?? null,
        forbiddenTiers: regime.forbiddenTiers ?? [],
    };

    if (regime.numericExtraction === 'refused') {
        return {
            ...common,
            shouldExtract: false,
            gate: {
                gate: 'regime',
                verdict: 'not-applicable',
                // "Nothing to extract" here is the ANSWER, not a failure.
                detail: `${regime.displayName} (${regime.legalBasis}) defines no numeric building envelope. ${regime.refusal ?? ''}`.trim(),
                token: 'regime:not-applicable-no-numeric-envelope',
            },
        };
    }

    if (regime.numericExtraction === 'conditional') {
        return {
            ...common,
            shouldExtract: true,
            gate: {
                gate: 'regime',
                verdict: 'flag',
                detail: `${regime.displayName} (${regime.legalBasis}) permits extraction only conditionally. ${regime.caveat ?? ''}`.trim(),
                token: 'regime:flag-conditional',
            },
        };
    }

    return {
        ...common,
        shouldExtract: true,
        gate: {
            gate: 'regime',
            verdict: 'pass',
            detail: `${regime.displayName} (${regime.legalBasis}) sets numeric Festsetzungen by law — extraction is in scope.`,
            token: 'regime:pass',
        },
    };
}
