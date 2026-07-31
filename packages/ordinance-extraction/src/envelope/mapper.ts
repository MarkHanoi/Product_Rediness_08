// @pryzm/ordinance-extraction — cited rules → TYPED ENVELOPE PARAMETERS.
//
// The final stage of the born-digital text path and the `legalRuleMapper` slot of
// GERMANY-CITY-ADAPTER-CONTRACT.md §2. Jurisdiction-agnostic: it consumes whatever
// `extractRules` produced under whatever grammar, so the German, Spanish and Danish
// grammars all land in one output shape (the contract's "100% reusable national
// output contract", §6).
//
// WHAT IT ADDS OVER THE RAW RULE LIST
//   1. GROUPING — many cited rules collapse to one parameter per key.
//   2. CONFLICT DETECTION — distinct values for one key are surfaced as a conflict
//      carrying NO value, never silently reconciled (see `types.ts` header).
//   3. GATING — the per-value gates of `ORDINANCE-EXTRACTION-PIPELINE.md` §2
//      Stage 4 (locale + range) plus whole-envelope coherence.
//   4. HONEST UNKNOWNS — every field the grammar sought but did not yield appears
//      with its reason, so an absent parameter is never merely a missing key.
//
// A REFUSAL PASSES STRAIGHT THROUGH. `toEnvelopeParameters` takes the extractor's
// OUTCOME, not its success branch, so "the extractor refused" cannot decay into
// "the envelope has no parameters" anywhere along the chain (L-422/457/467/469).
//
// One OTel span wraps the entry point (P8). Pure otherwise: no I/O.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { type GateResult, type ExtractableField } from '../types.js';
import { localeGate } from '../gates/localeGate.js';
import { rangeSanityGate, type FieldBounds } from '../gates/rangeSanityGate.js';
import { type RegimeGateResult } from '../gates/regimeGate.js';
import {
    type ExtractedRule,
    type FieldOutcome,
    type TextExtractionOutcome,
    type TextExtractionSuccess,
    type ExtractionRefusal,
} from '../textExtract/types.js';
import { envelopeCoherence } from './coherence.js';
import {
    type ConflictedParameter,
    type EnvelopeExtraction,
    type EnvelopeParameterOutcome,
    type ParameterCandidate,
    type ParameterKey,
    type ResolvedParameter,
    type UnknownParameter,
    parameterKey,
} from './types.js';

const tracer = trace.getTracer('pryzm.ordinance-extraction');

/** Options for the mapping — all optional, all narrowing, none inventing values. */
export interface EnvelopeMappingOptions {
    /**
     * Per-field plausibility-band overrides for the range gate (a city with
     * genuinely taller stock widens `maxHeight_m`). Defaults are per-field.
     */
    readonly bounds?: Partial<Record<ExtractableField, FieldBounds>>;
    /**
     * The parcel's legal-regime verdict (`gates/regimeGate.ts`), when the caller has
     * classified it. Supplying it makes the regime binding here:
     *   - a regime that defines NO numeric envelope (German §34/§35) turns the whole
     *     mapping into a `regime-forbids-extraction` refusal carrying the cited
     *     positive answer — never an envelope full of unknowns, which would read as
     *     "we could not find the numbers" rather than "the law sets none";
     *   - a `conditional` regime's caveat is stamped on every resolved value and
     *     clears its auto-acceptance (mirrors the supersession caveat in
     *     `pipeline.ts`).
     * Omitting it leaves the mapping regime-blind — the caller is then responsible
     * for having gated upstream.
     */
    readonly regime?: RegimeGateResult;
}

/** The mapper's outcome — the envelope, or the extractor's refusal, verbatim. */
export type EnvelopeMappingOutcome = EnvelopeExtraction | ExtractionRefusal;

/** Two values are "the same value" within float noise. */
function sameValue(a: number, b: number): boolean {
    return Math.abs(a - b) <= 1e-9;
}

/** Group the cited rules by parameter key, preserving document order. */
function groupByKey(rules: readonly ExtractedRule[]): Map<ParameterKey, ExtractedRule[]> {
    const groups = new Map<ParameterKey, ExtractedRule[]>();
    for (const rule of rules) {
        const key = parameterKey(rule.field, rule.measurement);
        const bucket = groups.get(key);
        if (bucket) bucket.push(rule);
        else groups.set(key, [rule]);
    }
    return groups;
}

/**
 * Collapse a key's rules into distinct candidates. Two rules stating 0,3 in two
 * different sentences are ONE candidate with `corroborations: 2` — repetition is
 * agreement, not disagreement. Two rules stating 0,3 and 0,4 are TWO candidates,
 * which is a conflict.
 */
function toCandidates(rules: readonly ExtractedRule[]): ParameterCandidate[] {
    const candidates: { first: ExtractedRule; count: number }[] = [];
    for (const rule of rules) {
        const existing = candidates.find((c) => sameValue(c.first.value, rule.value));
        if (existing) existing.count += 1;
        else candidates.push({ first: rule, count: 1 });
    }
    return candidates.map(({ first, count }) => ({
        value: first.value,
        citation: first.citation,
        rawText: first.rawText,
        matcherId: first.matcherId,
        corroborations: count,
    }));
}

/** Run the per-value gates (Stage 4) on one candidate rule. */
function gateValue(
    rule: ExtractedRule,
    locale: TextExtractionSuccess['locale'],
    bounds: EnvelopeMappingOptions['bounds'],
): GateResult[] {
    return [
        // Did the raw string parse under the SOURCE locale, not the anglophone one?
        localeGate(rule.rawText, rule.value, locale),
        // Is the number plausible for this field at all (a gross units/OCR shift)?
        rangeSanityGate(rule.field, rule.value, bounds),
    ];
    // NOTE — two of the adapter contract's four qualityControl items are enforced
    // STRUCTURALLY rather than by a gate, which is stronger than a check that could
    // be forgotten:
    //   • "citation-attached" — `ExtractedRule.citation` is non-optional and the
    //     extractor cannot construct a rule without a document + sentence.
    //   • "height-unit-present" — the German height matchers require a literal `m`
    //     in the pattern, so a bare number never becomes a height.
    // A gate that can never flag is noise in the audit trail; a type that cannot be
    // constructed wrongly is an invariant.
}

/** Build the resolved outcome for a key with exactly one distinct value. */
function resolveOne(
    key: ParameterKey,
    rules: readonly ExtractedRule[],
    candidate: ParameterCandidate,
    locale: TextExtractionSuccess['locale'],
    bounds: EnvelopeMappingOptions['bounds'],
): ResolvedParameter {
    const first = rules[0]!;
    const gates = gateValue(first, locale, bounds);
    const flags = gates.filter((g) => g.verdict === 'flag').map((g) => g.detail);
    return {
        status: 'resolved',
        key,
        field: first.field,
        value: candidate.value,
        unit: first.unit,
        ...(first.densityScope !== undefined ? { densityScope: first.densityScope } : {}),
        ...(first.measurement !== undefined ? { measurement: first.measurement } : {}),
        citation: candidate.citation,
        rawText: candidate.rawText,
        matcherId: candidate.matcherId,
        corroborations: candidate.corroborations,
        confidence: first.confidence,
        fieldProvenance: first.fieldProvenance,
        domainConfidence: first.domainConfidence,
        gates,
        autoAccepted: flags.length === 0,
        flags,
    };
}

/**
 * Stamp a regime caveat onto a resolved parameter. A caveated value can NEVER
 * auto-accept: the caveat is precisely the statement that a human must look at it
 * (e.g. the Berlin Baunutzungsplan's funktionslos voidance risk).
 */
function caveated(param: ResolvedParameter, caveat: string | null): ResolvedParameter {
    if (caveat === null) return param;
    return { ...param, flags: [...param.flags, caveat], autoAccepted: false };
}

/** Build the conflicted outcome for a key with several distinct values. */
function conflict(
    key: ParameterKey,
    field: ExtractableField,
    candidates: readonly ParameterCandidate[],
): ConflictedParameter {
    const values = candidates.map((c) => c.value).join(', ');
    return {
        status: 'conflicted',
        key,
        field,
        candidates,
        detail:
            `The document states ${candidates.length} distinct values for ${key} (${values}). ` +
            'This core reads a DOCUMENT, not a parcel — it has no zone attribution and therefore ' +
            'no basis to choose. Both are cited; resolution needs zone-scoped extraction or a human.',
    };
}

/** Turn a text-extraction FieldOutcome into an unknown parameter outcome. */
function toUnknown(outcome: FieldOutcome): UnknownParameter {
    return {
        status: 'unknown',
        // An unknown height has no known datum, so it is keyed by bare field.
        key: outcome.field,
        field: outcome.field,
        reason: outcome.reason,
        ...(outcome.rule !== undefined ? { rule: outcome.rule } : {}),
        detail: outcome.detail,
    };
}

/**
 * Map cited extraction rules into typed envelope parameters.
 *
 * Guarantees (each is a test):
 *   - an extractor REFUSAL is returned unchanged — it never becomes an empty
 *     envelope;
 *   - a parameter with two distinct stated values is `conflicted` and carries NO
 *     value;
 *   - repetition of the SAME value corroborates (a count) but never raises the
 *     confidence tier;
 *   - every resolved value keeps its citation and its `pipeline-extracted-
 *     unverified` tier, and records which gates ran;
 *   - a gate flag does not delete the value, it clears `autoAccepted`;
 *   - every field the grammar sought but did not yield appears as an `unknown`
 *     with its reason.
 */
export function toEnvelopeParameters(
    extraction: TextExtractionOutcome,
    options: EnvelopeMappingOptions = {},
): EnvelopeMappingOutcome {
    // A refusal is a refusal all the way down — never flattened to "no parameters".
    if (!extraction.ok) return extraction;

    // ── Regime FIRST (the contract's Stage -1). A parcel whose legal basis defines
    // no numeric envelope must answer with the cited refusal, not with an envelope
    // of unknowns — "the law sets no number here" and "we could not find the number"
    // are different answers to the user.
    const regime = options.regime;
    if (regime && !regime.shouldExtract) {
        return {
            ok: false,
            reason: 'regime-forbids-extraction',
            detail: regime.refusal ?? regime.gate.detail,
        };
    }

    const span = tracer.startSpan('pryzm.ordinance-extraction.toEnvelopeParameters');
    try {
        span.setAttribute('pryzm.jurisdiction', extraction.jurisdiction);
        if (regime?.regime) span.setAttribute('pryzm.regime', regime.regime.id);

        const outcomes: EnvelopeParameterOutcome[] = [];
        const resolved: ResolvedParameter[] = [];

        for (const [key, rules] of groupByKey(extraction.rules)) {
            const candidates = toCandidates(rules);
            if (candidates.length === 1) {
                const one = caveated(
                    resolveOne(key, rules, candidates[0]!, extraction.locale, options.bounds),
                    regime?.caveat ?? null,
                );
                resolved.push(one);
                outcomes.push(one);
            } else {
                outcomes.push(conflict(key, rules[0]!.field, candidates));
            }
        }

        for (const unknown of extraction.unknowns) outcomes.push(toUnknown(unknown));

        const coherence = envelopeCoherence(resolved);
        const autoAccepted = resolved.filter((r) => r.autoAccepted).length;
        const conflicted = outcomes.filter((o) => o.status === 'conflicted').length;
        const unknown = outcomes.filter((o) => o.status === 'unknown').length;

        span.setAttribute('pryzm.resolved', resolved.length);
        span.setAttribute('pryzm.conflicted', conflicted);
        span.setAttribute('pryzm.unknown', unknown);
        span.setStatus({ code: SpanStatusCode.OK });

        return {
            ok: true,
            jurisdiction: extraction.jurisdiction,
            document: extraction.document,
            outcomes,
            coherence,
            rejected: extraction.rejected,
            summary: { resolved: resolved.length, autoAccepted, conflicted, unknown },
        };
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        return {
            ok: false,
            reason: 'internal-error',
            detail: `Contained error while mapping envelope parameters: ${(err as Error).message}`,
        };
    } finally {
        span.end();
    }
}

/**
 * Look up ONE parameter by key. Returns the outcome — resolved, conflicted or
 * unknown — or `null` if the grammar never sought that parameter at all.
 *
 * ⚠ Deliberately NOT a `getValue()`. A caller must confront the three-way outcome:
 * a helper returning `number | null` would erase the difference between "the plan
 * says 0,3", "the plan says two different things" and "the plan is silent", which
 * is the entire failure mode this module exists to prevent.
 */
export function findParameter(
    envelope: EnvelopeExtraction,
    key: ParameterKey,
): EnvelopeParameterOutcome | null {
    return envelope.outcomes.find((o) => o.key === key) ?? null;
}
