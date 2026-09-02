// @pryzm/ordinance-extraction — THE FIRST `AI_EXTRACTED` PRODUCER.
//
// Measured 2026-09-01 (lane E8-SCOUT §1.5): producers emitting
// `derivation: 'AI_EXTRACTED'` in this repository — **ZERO**. The one hit,
// `evaluateDeclarative.ts:242`, is a CONSUMER: a `switch` arm that already knows
// what to do with one. **The seat was built and empty.** This file fills it.
//
// It does exactly one job: turn a verified reading into a `RuleProvenance` record
// at tier 4, through the single constructor in `tierLock.ts` and no other path. It
// contains no parsing, no geometry, no country knowledge and no confidence
// arithmetic — the tier is a constant, by design, because a tier this code could
// COMPUTE is a tier this code could get wrong.
//
// Pure: no I/O.

import { type LandBasis, type RuleSourceRef } from '@pryzm/schemas';
import { type ExtractableField, type GateResult } from '../types.js';
import { type HeightMeasurement } from '../textExtract/types.js';
import { buildExtractionProvenance } from './tierLock.js';
import {
    type ClaimEvidence,
    type ClaimValidity,
    type ExtractedClaim,
    type ZoneContext,
} from './types.js';

/**
 * `ExtractableField` → the canonical `RuleProvenance.parameter` spelling and unit.
 *
 * ⚠ THE COUPLING IS DELIBERATE AND IT IS ONE-WAY. The owner seat for these
 * spellings is `DECLARATIVE_PARAMETERS` in `@pryzm/site-parcel-data`
 * (`rulepacks/declarative/factVocabulary.ts`) — "one parameter, one spelling". That
 * package sits ABOVE this one and imports it, so this L2 leaf cannot import the
 * table back without a cycle. The names below are therefore MIRRORED, and the
 * mirror is stated here rather than left to be discovered:
 *
 *   maxHeight_m       → `maxHeight_m`      unit `m`         ← canonical seat, identical
 *   maxFloors         → `maxFloors`        unit null        ← canonical seat, identical
 *   maxFAR            → `plotRatioFAR`     unit `m²st/m²s`  ← canonical seat, same concept
 *   setback.front     → `setback.front_m`  unit `m`         ← canonical seat
 *   setback.side      → `setback.side_m`   unit `m`         ← canonical seat
 *   setback.rear      → `setback.rear_m`   unit `m`         ← canonical seat
 *   maxCoverage       → `maxCoverage`      unit null        ← ⚠ NO identical seat
 *   minParcelArea_m2  → `minParcelArea_m2` unit `m²`        ← ⚠ NO seat at all
 *
 * ⭐ DISCOVERY, RECORDED AND NOT ACTED ON (control 10). The canonical vocabulary's
 * coverage seat is `maxCoveragePercent` (unit `%`), and the ordinances this spine
 * reads print coverage as a FRACTION (Luzern's Überbauungsziffer `0.15`). Emitting
 * `maxCoveragePercent: 15` would make the claim's value differ from the verbatim
 * span a reviewer is asked to check, which is a review hazard for the sake of a
 * name. So the fraction is emitted under its own name and the mismatch is
 * REPORTED — extending the canonical vocabulary is that vocabulary's owner's
 * decision, not this lane's (no scope expansion on a discovery).
 */
const PARAMETER_NAMES: Readonly<
    Record<ExtractableField, { readonly parameter: string; readonly unit: string | null }>
> = Object.freeze({
    maxHeight_m: { parameter: 'maxHeight_m', unit: 'm' },
    maxFloors: { parameter: 'maxFloors', unit: null },
    maxFAR: { parameter: 'plotRatioFAR', unit: 'm²st/m²s' },
    maxCoverage: { parameter: 'maxCoverage', unit: null },
    minParcelArea_m2: { parameter: 'minParcelArea_m2', unit: 'm²' },
    'setback.front': { parameter: 'setback.front_m', unit: 'm' },
    'setback.side': { parameter: 'setback.side_m', unit: 'm' },
    'setback.rear': { parameter: 'setback.rear_m', unit: 'm' },
});

/**
 * Which direction each field BOUNDS in — the input to the qualifier gate's polarity
 * check. A setback is a MINIMUM distance, so it bounds `min` even though nothing in
 * its name says so; the four `max*` fields bound `max`; `minParcelArea_m2` bounds
 * `min`.
 *
 * ⭐ This table exists because a real Berlin document published a MINIMUM as a
 * MAXIMUM (`maxHeight_m = 19` from "Mindestbauhöhe … 19,0 m"). Country-agnostic
 * (control 5): the polarity of `maxHeight_m` is a property of PRYZM's parameter,
 * not of Germany.
 */
const PARAMETER_POLARITY: Readonly<Record<ExtractableField, 'min' | 'max'>> = Object.freeze({
    maxHeight_m: 'max',
    maxFloors: 'max',
    maxFAR: 'max',
    maxCoverage: 'max',
    minParcelArea_m2: 'min',
    'setback.front': 'min',
    'setback.side': 'min',
    'setback.rear': 'min',
});

/** The bound direction of a field — see {@link PARAMETER_POLARITY}. */
export function parameterPolarityFor(field: ExtractableField): 'min' | 'max' {
    return PARAMETER_POLARITY[field];
}

/** The canonical parameter name for a field — exported so callers agree with the claim. */
export function parameterNameFor(field: ExtractableField): string {
    return PARAMETER_NAMES[field].parameter;
}

/** Everything one claim needs. Assembled by the spine; never by a country adapter. */
export interface ProduceClaimInput {
    readonly field: ExtractableField;
    readonly value: number;
    /** Unit the READER believes it read; overrides the parameter's default when given. */
    readonly unit: string | null;
    readonly zone: ZoneContext;
    readonly evidence: ClaimEvidence;
    readonly validity: ClaimValidity;
    readonly gates: readonly GateResult[];
    /**
     * The VERBATIM source text the value was read from — the table cell as printed
     * ("35 (höchstens)"), or the cited sentence. Copied into `confidence.note`, so a
     * qualifier that sits in the value's own text travels INSIDE the frozen record
     * and not merely in the human-facing evidence. Omit only when the raw text is
     * the bare number.
     */
    readonly verbatim?: string;
    /** R5, mirrored verbatim from the source. Never harmonised, never inferred. */
    readonly normativeForce: string | null;
    /** R2, carried verbatim as `{scheme, code}`. */
    readonly valueBasis?: { readonly scheme: string; readonly code: string };
    /** The height datum, when the source states one — a load-bearing qualifier. */
    readonly measurement?: HeightMeasurement;
    /** The ratio's denominator, when the source states one — control 8. */
    readonly landBasis?: LandBasis;
}

/**
 * Produce ONE tier-4 claim.
 *
 * ⛔ `autoAccepted` is computed here and it is NOT a licence to publish. It means
 * "no gate objected", and the claim still ships at tier 4 with
 * `validationState: 'not-checked'`. The only door above tier 4 is a RECORDED human
 * validation event, and neither this function nor anything downstream of it can
 * open that door (spec §20 · C58 L-449 · the L0 `superRefine`).
 */
export function produceClaim(input: ProduceClaimInput): ExtractedClaim {
    const spec = PARAMETER_NAMES[input.field];
    const source: RuleSourceRef = {
        country: input.zone.country,
        authority: input.zone.authority,
        dataset: input.zone.dataset,
        plan_id: input.zone.planId,
        object_id: input.zone.zoneLabel ?? input.zone.zoneKey,
        document: input.evidence.documentId,
        // The heading where the structure layer found one, else the cell address:
        // "§ 13 Bauweise" beats "page 47" for a human verifying a value (L-449).
        article: input.evidence.section ?? input.evidence.cell,
        page: input.evidence.page,
    };

    // Qualifiers that must survive into the record itself, not merely into prose.
    const notes: string[] = [];
    if (input.measurement !== undefined && input.measurement !== 'unknown') {
        notes.push(`height datum: ${input.measurement}`);
    }
    if (input.landBasis !== undefined) notes.push(`denominator (LandBasis): ${input.landBasis}`);
    if (input.evidence.cell !== null) notes.push(`source cell: ${input.evidence.cell}`);
    if (input.verbatim !== undefined && input.verbatim.trim() !== String(input.value)) {
        notes.push(`verbatim source text: "${input.verbatim.trim()}"`);
    }

    const provenance = buildExtractionProvenance({
        parameter: spec.parameter,
        value: input.value,
        unit: input.unit ?? spec.unit,
        source,
        validity: input.validity,
        method: input.evidence.method,
        normativeForce: input.normativeForce,
        ...(input.valueBasis !== undefined ? { valueBasis: input.valueBasis } : {}),
        ...(notes.length > 0 ? { note: notes.join('; ') } : {}),
    });

    const flags = input.gates.filter((g) => g.verdict === 'flag').map((g) => g.detail);
    return {
        parameter: spec.parameter,
        field: input.field,
        value: input.value,
        unit: input.unit ?? spec.unit,
        zoneKey: input.zone.zoneKey,
        evidence: input.evidence,
        provenance,
        validationState: 'not-checked',
        gates: input.gates,
        autoAccepted: flags.length === 0,
        flags,
    };
}
