// ADR-0379 / §S1-CTXAGG — THE TYPED EVALUATION of a `context-aggregate` rule
// (`ContextAggregateRuleSchema`, packages/schemas/src/site/GeometricRule.ts) — the
// `fabricDerivedHeight` seat Porto's gate blocker 4 named.
//
// THE RULE CLASS. The value is a STATISTIC over the existing built context. Driving citation:
// Porto PDM Art. 3.º o) *moda da cércea* — "the cércea with the greatest extent along a built
// urban frontage" — over the *frente urbana* of Art. 3.º l), governing FUC tipo I heights
// (Art. 24.º n.º 1 e)) and overriding the 21 m cap in tipo II (Art. 27.º n.º 2 b)). Same family:
// Paris `plub_filet` code M ("same as existing façade").
//
// ── AGGREGATION SEMANTICS (stated once, here) ────────────────────────────────────────────────
//   • `mode`   — EXTENT-WEIGHTED: the member VALUE whose summed frontage extent is greatest.
//                The article says "com maior extensão" — greatest EXTENT, not most buildings; a
//                count-mode would let five narrow houses outvote one long block front, which is
//                not what the definition states. A tie in total extent between different values
//                REFUSES — never pick on a tie (the attribution layer's invariant 1, honoured by
//                the declarative evaluator's rank logic too).
//   • `median` — EXTENT-WEIGHTED median (smallest value whose cumulative extent reaches half the
//                total). Robust-peer discipline: aggregate by median, never MIN (memory
//                `corpus-never-jittered-min-over-peers`).
//   • `max`    — the largest member value (the "unless the existing cércea is higher"
//                comparison class, Art. 27.º n.º 2 b)).
//
// ── THE HONEST REFUSALS ARE PART OF THE KIND ─────────────────────────────────────────────────
// A fabric statistic EXISTS only where the fabric does. UNAVAILABLE set (not built, not
// extracted, not held) and EMPTY set (extracted, zero members) are DIFFERENT facts and refuse
// under different codes (§CONTEXT-DATA-HONESTY: failure ≠ empty). A poisoned member (non-finite
// value, non-positive extent) refuses the WHOLE evaluation rather than silently dropping the
// member — dropping could flip the mode, which is a wrong number wearing a citation.
//
// ⚠ THIS MODULE DOES NOT CONSTRUCT THE CONTEXT SET. Frontage extraction is adapter/kernel work
// (lane A row 1); members are INJECTED. And per §PORTO-SIGN-OFF, this lane does NOT wire Porto's
// pack or flip its gate — the orchestrator does, citing that block.
//
// PURE + deterministic (C58 §1.1). P8: OTel span on the exported entry point.

import { trace } from '@opentelemetry/api';
import type { ContextAggregateRule } from '@pryzm/schemas';

const _tracer = trace.getTracer('pryzm.zoning.declarative');

/** Compile-time exhaustiveness guard (the answerabilityClass.ts idiom). */
function assertNever(x: never, context: string): never {
    throw new Error(`[evaluateContextAggregate] unhandled ${context}: ${String(x)}`);
}

/**
 * One member of the declared context set — e.g. one stretch of the frente urbana sharing one
 * cércea. `value_m` is the aggregated attribute (measured from the rule's `heightDatum`);
 * `extent_m` is the frontage length that carries it (the article's own weight).
 */
export interface ContextFabricMember {
    readonly value_m: number;
    readonly extent_m: number;
    /** Optional stable id of the source building/front, for the evidence trail. */
    readonly sourceId?: string;
}

/**
 * The injected context set. UNAVAILABLE ≠ EMPTY (§CONTEXT-DATA-HONESTY): `unavailable` = the set
 * could not be constructed (no extractor, no data, a failed fetch — `why` says which);
 * `available` with zero members = the extractor ran and the frontage genuinely has no measured
 * built fabric.
 */
export type ContextSetInput =
    | { readonly status: 'available'; readonly members: readonly ContextFabricMember[] }
    | { readonly status: 'unavailable'; readonly why: string };

export interface ResolvedContextAggregate {
    readonly ok: true;
    /** The aggregated value, metres, measured from the rule's `heightDatum`. */
    readonly value_m: number;
    readonly aggregate: ContextAggregateRule['aggregate'];
    /** Members consumed (all of them — no silent drops). */
    readonly memberCount: number;
    /** Total frontage extent of the set, metres. */
    readonly totalExtent_m: number;
    /** For `mode`: the summed extent carrying the winning value; else the total extent. */
    readonly supportExtent_m: number;
    /**
     * Honest qualifications (e.g. granularity: a frontage statistic is FRONTAGE-granularity —
     * C58 §1.11). Empty is a real value.
     */
    readonly caveats: readonly string[];
}

export interface ContextAggregateRefusal {
    readonly ok: false;
    readonly code:
        | 'context-set-unavailable'
        | 'context-set-empty'
        | 'aggregate-tie'
        | 'invalid-member';
    readonly detail: string;
}

export type ContextAggregateOutcome = ResolvedContextAggregate | ContextAggregateRefusal;

const EPS = 1e-9;

/** Group members by value (exact within EPS) and sum extents. Deterministic: sorted by value. */
function groupByValue(
    members: readonly ContextFabricMember[],
): { value_m: number; extent_m: number }[] {
    const sorted = [...members].sort((a, b) => a.value_m - b.value_m);
    const groups: { value_m: number; extent_m: number }[] = [];
    for (const m of sorted) {
        const last = groups[groups.length - 1];
        if (last && Math.abs(last.value_m - m.value_m) < EPS) last.extent_m += m.extent_m;
        else groups.push({ value_m: m.value_m, extent_m: m.extent_m });
    }
    return groups;
}

/**
 * Evaluate one context-aggregate rule over an injected context set. Deterministic; every defect
 * is a typed refusal — an absent fabric never yields a number, and a tie never picks.
 */
export function evaluateContextAggregate(
    rule: ContextAggregateRule,
    context: ContextSetInput,
): ContextAggregateOutcome {
    const span = _tracer.startSpan('pryzm.zoning.declarative.evaluateContextAggregate');
    try {
        span.setAttribute('pryzm.aggregate', rule.aggregate);
        span.setAttribute('pryzm.contextSet', rule.contextSet);
        span.setAttribute('pryzm.attribute', rule.attribute);

        if (context.status === 'unavailable') {
            return {
                ok: false,
                code: 'context-set-unavailable',
                detail:
                    `The declared context set '${rule.contextSet}' could not be constructed: ` +
                    `${context.why}. A fabric-derived value exists only where the fabric is ` +
                    'measured — refusing; substituting any scalar (e.g. a cap the article ' +
                    'subordinates to this statistic) would overstate or understate by parcel ' +
                    '(ptPortoPdmDraft.ts blocker 4, ADR-0379).',
            };
        }

        const members = context.members;
        span.setAttribute('pryzm.memberCount', members.length);
        if (members.length === 0) {
            return {
                ok: false,
                code: 'context-set-empty',
                detail:
                    `The context set '${rule.contextSet}' was constructed and holds ZERO ` +
                    'members — an unbuilt or unmeasured frontage has no ' +
                    `${rule.attribute} statistic. Empty is a different fact from unavailable ` +
                    '(§CONTEXT-DATA-HONESTY) and both refuse (ADR-0379).',
            };
        }

        for (const m of members) {
            if (!Number.isFinite(m.value_m) || m.value_m < 0 || !Number.isFinite(m.extent_m) || m.extent_m <= 0) {
                return {
                    ok: false,
                    code: 'invalid-member',
                    detail:
                        `Context member ${m.sourceId ?? '(unnamed)'} is invalid ` +
                        `(value_m=${String(m.value_m)}, extent_m=${String(m.extent_m)}) — ` +
                        'refusing the whole evaluation rather than silently dropping it: a ' +
                        'dropped member can flip the mode (ADR-0379).',
                };
            }
        }

        const totalExtent = members.reduce((s, m) => s + m.extent_m, 0);
        const base = {
            aggregate: rule.aggregate,
            memberCount: members.length,
            totalExtent_m: totalExtent,
            caveats: [
                `Granularity: a '${rule.contextSet}' statistic is frontage-granularity — parcels ` +
                    'on the same frontage share it; it is not a parcel-specific figure ' +
                    '(C58 §1.11).',
            ],
        } as const;

        switch (rule.aggregate) {
            case 'mode': {
                const groups = groupByValue(members);
                let best = groups[0]!;
                for (const g of groups) if (g.extent_m > best.extent_m + EPS) best = g;
                const rivals = groups.filter(
                    (g) => Math.abs(g.extent_m - best.extent_m) <= EPS && Math.abs(g.value_m - best.value_m) >= EPS,
                );
                if (rivals.length > 0) {
                    return {
                        ok: false,
                        code: 'aggregate-tie',
                        detail:
                            `Mode tie: values ${[best, ...rivals].map((g) => `${g.value_m} m`).join(' and ')} ` +
                            `each carry ${best.extent_m} m of frontage extent — the article picks ` +
                            'the value "com maior extensão"; when extents tie the definition ' +
                            'picks nothing, and neither do we (never pick on a tie — attribution ' +
                            'invariant 1; ADR-0379).',
                    };
                }
                return { ok: true, value_m: best.value_m, supportExtent_m: best.extent_m, ...base };
            }
            case 'median': {
                const groups = groupByValue(members);
                const half = totalExtent / 2;
                let cum = 0;
                for (const g of groups) {
                    cum += g.extent_m;
                    if (cum >= half - EPS) {
                        return { ok: true, value_m: g.value_m, supportExtent_m: totalExtent, ...base };
                    }
                }
                // Unreachable with positive extents; refuse rather than fall through silently.
                return {
                    ok: false,
                    code: 'invalid-member',
                    detail: 'extent accumulation never reached the half-total — degenerate set.',
                };
            }
            case 'max': {
                let best = members[0]!;
                for (const m of members) if (m.value_m > best.value_m) best = m;
                return { ok: true, value_m: best.value_m, supportExtent_m: totalExtent, ...base };
            }
            default:
                return assertNever(rule.aggregate, 'ContextAggregateRule.aggregate');
        }
    } finally {
        span.end();
    }
}
