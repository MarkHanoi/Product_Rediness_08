// @pryzm/ordinance-extraction — `resolveParameter`: which correctly-read value binds.
//
// The resolver is the SAME for every jurisdiction. Everything country-specific lives
// in the `InstrumentPriorityTable` DATA (`priority.ts`) and in whatever producer
// stamped `legalStatus` (metadata for Denmark, plan text for Germany, statute for
// Madrid). The resolver never learns WHY a statement binds — that is what lets a new
// country be added as a producer rather than as new resolver logic.
//
// THE STAGES, IN ORDER (each is a test in `__tests__/attribution/`):
//
//   0  no candidates                        → unknown('no-candidates')
//   1  EVERY candidate legalStatus unknown  → unknown — INVARIANT 2: a resolver
//                                             cannot manufacture certainty from a set
//                                             of uncertainties
//   2  `supersededBy` pointer               → demote to superseded
//   3  drop superseded + illustrative       → if none survive, unknown
//   4  drop unknown-status candidates       → (≥1 known-binding candidate exists)
//   5  drop null values                     → if none survive, unknown naming the
//                                             ruleKind. NEVER 0, NEVER a default
//   6  all surviving values equal           → resolved by corroboration, no table
//   7  no table                             → conflicted('no-priority-table')  [Paris]
//   8  a survivor's kind is UNRANKED        → conflicted('unrankable-instrument-kind')
//   9  ≥2 survivors tie on the MINIMUM rank → conflicted('tie-on-authority')  [Madrid]
//                                             INVARIANT 1 — never pick on a tie
//  10  otherwise                            → resolved  [Berlin]
//
// STAGE 8 IS THE SAFE DIRECTION, AND IT IS DELIBERATE. An unranked kind does NOT mean
// "the ranked one wins". It means the table has nothing to say about this comparison,
// so the resolver refuses. That is what keeps Madrid's Art. 8.0.6 narrow instead of
// letting a catalogue listing quietly beat a Norma Zonal on FAR.
//
// A `conflicted` or `unknown` result carries NO `value` KEY AT ALL — not `null`, not
// `undefined` — so `'value' in resolution` is a sound test and a careless
// `resolution.value ?? 0` cannot type-check (L-616: unknown ≠ 0 ≠ permissive default).
//
// One OTel span wraps the entry point (P8). Pure otherwise: no I/O.
// Full design: `standards/LEGAL-ATTRIBUTION-MODEL.md` §2.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { type InstrumentPriorityTable, instrumentRank } from './priority.js';
import {
    type ConflictedAttribution,
    type ParameterEvidence,
    type RejectedEvidence,
    type Resolution,
    type ResolvedAttribution,
    type UnknownAttribution,
} from './types.js';

const tracer = trace.getTracer('pryzm.ordinance-extraction');

/** Options — all optional, all narrowing, none inventing values. */
export interface ResolveOptions<T> {
    /**
     * Are two candidate values "the same value"? Defaults to float-tolerant equality
     * for numbers and `Object.is` otherwise. Supply one for structured values (a
     * polygon, a tiered table) so corroboration is not missed on object identity.
     */
    readonly sameValue?: (a: T, b: T) => boolean;
}

/** Default equality: float-tolerant for numbers, identity otherwise. */
function defaultSameValue<T>(a: T, b: T): boolean {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9;
    return Object.is(a, b);
}

/** A candidate with a non-null value — the only kind that can win. */
interface Valued<T> {
    readonly evidence: ParameterEvidence<T>;
    readonly value: T;
}

function reject<T>(
    evidence: ParameterEvidence<T>,
    reason: RejectedEvidence<T>['reason'],
    detail: string,
): RejectedEvidence<T> {
    return { evidence, reason, detail };
}

function describe<T>(e: ParameterEvidence<T>): string {
    const article = e.citation.article ? ` art. ${e.citation.article}` : '';
    return `${e.instrument.id} (${e.instrument.kind})${article}`;
}

/**
 * Decide which of several correctly-read candidate values BINDS.
 *
 * @param candidates every reading found for ONE parameter of ONE parcel/zone. The
 *   caller owns grouping — this resolver assumes the candidates genuinely compete.
 *   Two values from two DIFFERENT zones are not a conflict and must not be grouped.
 * @param table the jurisdiction's priority table, or `undefined` when none is known.
 *   `undefined` is honest and produces `conflicted`, never a guess.
 *
 * Guarantees (each is a test with a mutation-style twin):
 *   - never picks when candidates tie on authority — `conflicted`, no value;
 *   - never increases confidence — a resolution's `confidence` IS its winner's, and
 *     an all-`unknown`-status candidate set resolves to `unknown`;
 *   - superseded / illustrative / absent / errored stay four distinguishable results;
 *   - never synthesises a missing constraint — a null value never becomes 0;
 *   - resolves PER PARAMETER, so a special plan can override height but not coverage.
 */
export function resolveParameter<T>(
    candidates: readonly ParameterEvidence<T>[],
    table?: InstrumentPriorityTable,
    options: ResolveOptions<T> = {},
): Resolution<T> {
    const span = tracer.startSpan('pryzm.ordinance-extraction.resolveParameter');
    try {
        const parameter = candidates[0]?.parameter ?? '(none)';
        span.setAttribute('pryzm.parameter', parameter);
        span.setAttribute('pryzm.candidates', candidates.length);
        if (table) span.setAttribute('pryzm.jurisdiction', table.jurisdiction);

        const result = resolveInner(parameter, candidates, table, options);
        span.setAttribute('pryzm.resolution', result.status);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
    } catch (err) {
        // A contained failure is `unknown`, never a silent value and never a throw —
        // and it carries its OWN reason code. "We errored" and "we looked and could not
        // establish the legal status" are different results (invariant 4).
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        return {
            status: 'unknown',
            parameter: candidates[0]?.parameter ?? '(none)',
            rejected: [],
            reasonCode: 'internal-error',
            reason: `Contained error while resolving: ${(err as Error).message}`,
        };
    } finally {
        span.end();
    }
}

function resolveInner<T>(
    parameter: string,
    candidates: readonly ParameterEvidence<T>[],
    table: InstrumentPriorityTable | undefined,
    options: ResolveOptions<T>,
): Resolution<T> {
    const same = options.sameValue ?? defaultSameValue;
    const rejected: RejectedEvidence<T>[] = [];

    // ── STAGE 0 — nothing supplied.
    if (candidates.length === 0) {
        return unknown(parameter, rejected, 'no-candidates', 'No candidate evidence was supplied.');
    }

    // ── STAGE 1 — INVARIANT 2. If not one candidate has an established legal status,
    // the result is `unknown`. A resolver cannot manufacture certainty out of a set of
    // uncertainties, however many of them there are — and however confident each one's
    // `EvidenceConfidence` claims to be, since that measures READING certainty, not
    // legal force.
    if (candidates.every((c) => c.legalStatus === 'unknown')) {
        return unknown(
            parameter,
            candidates.map((c) =>
                reject(
                    c,
                    'unestablished-legal-status',
                    `${describe(c)} has legalStatus 'unknown' (source: ${c.legalStatusSource}).`,
                ),
            ),
            'no-candidate-has-established-legal-status',
            `All ${candidates.length} candidates for ${parameter} have legalStatus 'unknown'. ` +
                'A resolver cannot manufacture certainty from a set of uncertainties: none of ' +
                'these is known to bind, so none may be selected.',
        );
    }

    // ── STAGES 2–4 — status filtering, every drop recorded.
    const binding: ParameterEvidence<T>[] = [];
    for (const c of candidates) {
        // STAGE 2 — a `supersededBy` pointer is HARDER evidence than a status field a
        // producer may simply have defaulted, so it demotes regardless of `legalStatus`.
        if (c.instrument.supersededBy !== undefined) {
            rejected.push(
                reject(
                    c,
                    'superseded',
                    `${describe(c)} declares supersededBy='${c.instrument.supersededBy}'.`,
                ),
            );
            continue;
        }
        // STAGE 3.
        if (c.legalStatus === 'superseded') {
            rejected.push(
                reject(
                    c,
                    'superseded',
                    `${describe(c)} is superseded — it was a determination and is not one now. ` +
                        `(legalStatusSource: ${c.legalStatusSource})`,
                ),
            );
            continue;
        }
        if (c.legalStatus === 'illustrative') {
            rejected.push(
                reject(
                    c,
                    'illustrative',
                    `${describe(c)} is illustrative — descriptive or advisory, never a ` +
                        `determination. (legalStatusSource: ${c.legalStatusSource})`,
                ),
            );
            continue;
        }
        // STAGE 4 — an unknown status loses to a known-binding one, but only because
        // stage 1 has already proved at least one binding candidate exists.
        if (c.legalStatus === 'unknown') {
            rejected.push(
                reject(
                    c,
                    'unestablished-legal-status',
                    `${describe(c)} has legalStatus 'unknown' while a known-binding candidate ` +
                        'exists for the same parameter.',
                ),
            );
            continue;
        }
        binding.push(c);
    }

    if (binding.length === 0) {
        return unknown(
            parameter,
            rejected,
            'all-candidates-non-binding',
            `Every candidate for ${parameter} is superseded and/or illustrative. The parameter ` +
                'is NOT absent — the evidence exists and none of it binds. See `rejected` for ' +
                'the full trail.',
        );
    }

    // ── STAGE 5 — a null value cannot be resolved to. It is NOT zero and NOT a
    // permissive default (L-616). When every binding candidate is valueless, the
    // `ruleKind` is the answer: the number is on a drawing, is a formula, or the use
    // is prohibited.
    const valued: Valued<T>[] = [];
    for (const c of binding) {
        if (c.value === null) {
            rejected.push(
                reject(
                    c,
                    'no-value',
                    `${describe(c)} binds but carries no value (ruleKind: ${c.ruleKind}). ` +
                        'This is NOT zero and NOT a permissive default.',
                ),
            );
            continue;
        }
        valued.push({ evidence: c, value: c.value });
    }

    if (valued.length === 0) {
        const kinds = [...new Set(binding.map((c) => c.ruleKind))].join(', ');
        return unknown(
            parameter,
            rejected,
            'binding-candidate-carries-no-value',
            `A binding determination for ${parameter} EXISTS but states no number ` +
                `(ruleKind: ${kinds}). The constraint is real and its value must be sought ` +
                'elsewhere — it must never be synthesised as 0 or as a permissive default.',
        );
    }

    // ── STAGE 6 — unanimity needs no table. Repetition of the SAME value is
    // corroboration, not a conflict.
    const first = valued[0]!;
    if (valued.every((v) => same(v.value, first.value))) {
        return resolved(
            parameter,
            first,
            valued.slice(1).map((v) =>
                reject(
                    v.evidence,
                    'outranked',
                    `${describe(v.evidence)} states the same value — corroboration, not conflict.`,
                ),
            ),
            rejected,
            `${valued.length} binding candidate(s) agree on the value for ${parameter}. ` +
                'No priority table was needed.',
        );
    }

    // ── STAGE 7 — no table means no basis. Paris: `plub_filet` / `plub_hauteur` /
    // `plub_hmc` precedence is genuinely unknown, so the honest answer is a refusal
    // that produces a data-sourcing question rather than a silent wrong number.
    if (!table) {
        return conflicted(
            parameter,
            valued.map((v) => v.evidence),
            rejected,
            'no-priority-table',
            `${valued.length} binding candidates state different values for ${parameter} and ` +
                'NO instrument priority table is registered for this jurisdiction. Precedence ' +
                'is unknown, so no value is selected.',
        );
    }

    // ── STAGE 8 — an unranked kind is UNRANKABLE, not weakest.
    const ranked: { v: Valued<T>; rank: number }[] = [];
    for (const v of valued) {
        const rank = instrumentRank(table, parameter, v.evidence.instrument.kind);
        if (rank === null) {
            return conflicted(
                parameter,
                valued.map((x) => x.evidence),
                rejected,
                'unrankable-instrument-kind',
                `${table.displayName} has no rank for instrument kind ` +
                    `'${v.evidence.instrument.kind}' on parameter '${parameter}'. An unranked ` +
                    'kind is UNRANKABLE, not weakest — the table has nothing to say about this ' +
                    'comparison, so no value is selected.',
            );
        }
        ranked.push({ v, rank });
    }

    // ── STAGE 9 — INVARIANT 1. Never pick when candidates tie on authority.
    const best = Math.min(...ranked.map((r) => r.rank));
    const strongest = ranked.filter((r) => r.rank === best);
    const distinct = strongest.filter(
        (r, i) => strongest.findIndex((o) => same(o.v.value, r.v.value)) === i,
    );
    if (distinct.length > 1) {
        return conflicted(
            parameter,
            strongest.map((r) => r.v.evidence),
            [
                ...rejected,
                ...ranked
                    .filter((r) => r.rank !== best)
                    .map((r) =>
                        reject(
                            r.v.evidence,
                            'outranked',
                            `${describe(r.v.evidence)} ranks ${r.rank} — weaker than ${best}.`,
                        ),
                    ),
            ],
            'tie-on-authority',
            `${strongest.length} candidates for ${parameter} share the strongest authority ` +
                `(rank ${best}) under ${table.displayName} and state DIFFERENT values ` +
                `(${strongest.map((r) => String(r.v.value)).join(', ')}). The resolver has no ` +
                'basis to choose and will not invent one. Resolution needs a sourced precedence ' +
                'rule or a human.',
        );
    }

    // ── STAGE 10 — a unique strongest candidate.
    const winner = strongest[0]!;
    return resolved(
        parameter,
        winner.v,
        ranked
            .filter((r) => r.v !== winner.v)
            .map((r) =>
                reject(
                    r.v.evidence,
                    'outranked',
                    `${describe(r.v.evidence)} ranks ${r.rank}; the winner ranks ${best}. ` +
                        `Its stated value ${String(r.v.value)} is a correct reading and still ` +
                        'does not bind this parameter.',
                ),
            ),
        rejected,
        `${describe(winner.v.evidence)} ranks ${best} under ${table.displayName} — strictly ` +
            `stronger than every other binding candidate for ${parameter} (${table.citation}).`,
    );
}

function resolved<T>(
    parameter: string,
    winner: Valued<T>,
    outranked: readonly RejectedEvidence<T>[],
    earlier: readonly RejectedEvidence<T>[],
    reason: string,
): ResolvedAttribution<T> {
    return {
        status: 'resolved',
        parameter,
        value: winner.value,
        winner: winner.evidence,
        rejected: [...earlier, ...outranked],
        reason,
        // INVARIANT 2 — copied, never computed upward. There is no arithmetic here on
        // purpose: agreement between candidates is NOT independent corroboration and
        // must never raise a tier (`confidence.ts` LOCK 3 / L-449).
        confidence: winner.evidence.confidence,
    };
}

function conflicted<T>(
    parameter: string,
    candidates: readonly ParameterEvidence<T>[],
    rejected: readonly RejectedEvidence<T>[],
    reasonCode: ConflictedAttribution<T>['reasonCode'],
    reason: string,
): ConflictedAttribution<T> {
    return { status: 'conflicted', parameter, candidates, rejected, reasonCode, reason };
}

function unknown<T>(
    parameter: string,
    rejected: readonly RejectedEvidence<T>[],
    reasonCode: UnknownAttribution<T>['reasonCode'],
    reason: string,
): UnknownAttribution<T> {
    return { status: 'unknown', parameter, rejected, reasonCode, reason };
}
