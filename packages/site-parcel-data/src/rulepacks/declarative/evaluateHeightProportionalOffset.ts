// ADR-0378 / §S1-HPO — THE TYPED EVALUATION of a `height-proportional-offset` rule
// (`HeightProportionalOffsetRuleSchema`, packages/schemas/src/site/GeometricRule.ts).
//
// THE RULE CLASS. Offset = factor × H, floored at a stated minimum — DE BauO NRW 2018 §6
// Abstandsflächen (0,4·H min 3 m), Porto PDM Art. 30.º n.º 1 d) afastamento (≥ H/2 min 3 m),
// Madrid NZ5 front-to-axis. The ordinance states a FORMULA over the building's own height, so a
// constant-setback seat cannot carry it (ADR-0271's "a scalar cannot encode a function", one
// rung up).
//
// ── NO CIRCULARITY: EVALUATION ORDER IS POST-HEIGHT-RESOLUTION, BY TYPE ──────────────────────
// The input H arrives as the EXISTING `EnvelopeSolidHeightCapVerdict` (evaluateDeclarative.ts) —
// the verdict the declarative pipeline produces AFTER resolving the governing height parameter.
// Reusing that type (never minting a rival height-resolution shape) makes the documented order
// impossible to skip: you cannot call this without first having run height resolution. At a
// RESOLVED H the Abstandsflächen inclined plane collapses to the closed-form pointwise offset
// `max(factor·H, min)` — the closed-form pointwise-min reading lane B proved; combining several
// co-applicable planes stays the kernel's pointwise-min job downstream.
//
// ── THE REFUSAL IS LOAD-BEARING (C58 §1.4) ───────────────────────────────────────────────────
// When H is unresolved this evaluation REFUSES. It never substitutes the minimum floor alone: an
// offset smaller than the law's `factor × H` erodes too little, which OVERSTATES the envelope —
// the one forbidden direction. And when the rule's own `heightDatum` is `unknown`, it refuses
// too: `factor × H` with an unresolved H-datum is a number measured from an assumed plane
// (ADR-0377; the schema already rejects `absolute-national` here at parse).
//
// OUTPUT: a RESOLVED offset spec — plain metres + the rule's own typed enums — which the kernel
// consumes as edge insets / half-plane clips. No kernel type is minted here (K1 boundary:
// agree by types only).
//
// PURE + deterministic (C58 §1.1). P8: OTel span on the exported entry point.

import { trace } from '@opentelemetry/api';
import type { HeightProportionalOffsetRule } from '@pryzm/schemas';
import type { EnvelopeSolidHeightCapVerdict } from './evaluateDeclarative.js';

const _tracer = trace.getTracer('pryzm.zoning.declarative');

/** The resolved offset spec the kernel consumes (numbers + the rule's typed enums, nothing new). */
export interface ResolvedHeightProportionalOffset {
    readonly ok: true;
    /** `max(heightFactor × H, minOffset_m)` — metres. */
    readonly offset_m: number;
    /** Which side of the `max` bound: the formula, or the stated floor. */
    readonly governedBy: 'height-proportional' | 'minimum-floor';
    /** The H the formula consumed (from the height-resolution verdict), metres. */
    readonly heightUsed_m: number;
    readonly appliesTo: HeightProportionalOffsetRule['appliesTo'];
    readonly measuredFrom: HeightProportionalOffsetRule['measuredFrom'];
    readonly appliesToStoreys: HeightProportionalOffsetRule['appliesToStoreys'];
    readonly direction: HeightProportionalOffsetRule['direction'];
}

export interface HeightProportionalOffsetRefusal {
    readonly ok: false;
    readonly code: 'height-unresolved' | 'height-datum-unresolved' | 'height-invalid';
    readonly detail: string;
}

export type HeightProportionalOffsetOutcome =
    | ResolvedHeightProportionalOffset
    | HeightProportionalOffsetRefusal;

/**
 * Evaluate one height-proportional-offset rule against an ALREADY-RESOLVED height verdict.
 * Deterministic; every defect is a typed refusal, never a defaulted offset.
 */
export function evaluateHeightProportionalOffset(
    rule: HeightProportionalOffsetRule,
    heightResolution: EnvelopeSolidHeightCapVerdict,
): HeightProportionalOffsetOutcome {
    const span = _tracer.startSpan('pryzm.zoning.declarative.evaluateHeightProportionalOffset');
    try {
        span.setAttribute('pryzm.heightFactor', rule.heightFactor);
        span.setAttribute('pryzm.heightDatum', rule.heightDatum.kind);

        if (rule.heightDatum.kind === 'unknown') {
            return {
                ok: false,
                code: 'height-datum-unresolved',
                detail:
                    'The rule does not resolve WHICH H its factor multiplies (heightDatum ' +
                    "'unknown' — e.g. the DE §6 H-measurement semantics pending their primary " +
                    'read). Refusing: an offset from an assumed H-datum is measured from the ' +
                    'wrong plane (ADR-0377/0378).',
            };
        }

        if (!heightResolution.ok) {
            return {
                ok: false,
                code: 'height-unresolved',
                detail:
                    `H itself is unresolved (${heightResolution.refusal}: ` +
                    `${heightResolution.detail}) — the offset is a function of H, so it cannot ` +
                    'resolve either. The minimum floor alone is NEVER substituted: a too-small ' +
                    'offset OVERSTATES the envelope, the one forbidden direction (C58 §1.4). ' +
                    'Evaluation order is post-height-resolution by contract (ADR-0378).',
            };
        }

        const h = heightResolution.maxHeightM;
        if (!Number.isFinite(h) || h <= 0) {
            return {
                ok: false,
                code: 'height-invalid',
                detail:
                    `Resolved height ${String(h)} m is not a positive finite building height — ` +
                    'refusing rather than computing an offset from a degenerate H (a 0/NaN H ' +
                    'would collapse the offset to the floor, or below it, silently).',
            };
        }

        const proportional = rule.heightFactor * h;
        const offset_m = Math.max(proportional, rule.minOffset_m);
        span.setAttribute('pryzm.offsetM', offset_m);
        return {
            ok: true,
            offset_m,
            governedBy: proportional >= rule.minOffset_m ? 'height-proportional' : 'minimum-floor',
            heightUsed_m: h,
            appliesTo: rule.appliesTo,
            measuredFrom: rule.measuredFrom,
            appliesToStoreys: rule.appliesToStoreys,
            direction: rule.direction,
        };
    } finally {
        span.end();
    }
}
