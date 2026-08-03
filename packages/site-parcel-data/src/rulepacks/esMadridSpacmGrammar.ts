// THE GRAMMAR CLASSIFIER — which geometric OPERATION governs this zone, or none.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE ONE RULE: NEVER FORCE A GRAMMAR
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A grammar is a KIND, not a number (ADR-0270). Erode-inward-from-every-edge and
// project-a-band-of-depth-D-from-one-edge are different OPERATIONS on the parcel, and coercing an
// *alineación a vial* zone into `front_m: 0` does not approximate it — it loses *profundidad
// edificable* entirely and yields an envelope covering the WHOLE PLOT DEPTH. That is a confidently
// wrong buildable area on precisely the dense parcels where land value is highest.
//
// So `unknown` is a first-class return, and it is the correct one whenever the published
// parameters do not determine an operation. A forced grammar is not a rough envelope; it is a
// precise envelope of the wrong shape.
//
// ⭐ NO NEW GEOMETRY ENGINE. Each grammar maps to a `GeometricRule` kind that ALREADY EXISTS in
// `@pryzm/schemas`, and `requiresBlockRing()` already dispatches on the zone's own rule. This file
// classifies; it does not solve.
//
// PURE. No I/O, no clock. Total, never throws.

// §MADRID-SPACM-PORT (L-681) — ported VERBATIM from `tools/madrid-envelope-engine/grammar.ts`.
// The move added OTel spans (P8) and changed no classification. See `esMadridSpacmSchema.ts`
// §MADRID-SPACM-P8.

import { trace } from '@opentelemetry/api';
import type { EnvelopeGrammar, EnvelopeRules, Parameter } from './esMadridSpacmSchema.js';
import { isKnown } from './esMadridSpacmSchema.js';

const _tracer = trace.getTracer('pryzm.zoning');

/**
 * Ordinance-name lexemes that mark land the general plan reserves for PUBLIC use.
 *
 * ⚠ These are matched on `DS_NOMB_ORD`, the ordinance's own designation, and they are matched
 * BEFORE any parameter is read — a *red viaria* row that happens to carry a stray height must not
 * become a buildable envelope on the strength of it. Measured on the Boadilla fixture: `ZONAS
 * VERDES` (269), `RED VIARIA` (268), `SERVICIOS URBANOS E INFRAESTRUCTURAS` (202), `EQUIPAMIENTO`
 * (92), `DEPORTIVAS` (24), `ESPACIOS DE TRANSICIÓN` (269) — **1,124 of 1,958 rows, 57 %.**
 *
 * ⚠⚠ THIS IS A LEGALLY-GROUNDED REFUSAL, NOT A COVERAGE GAP. The ordinance genuinely grants no
 * private envelope here, so the card must say so — telling the owner of a *zona verde* that PRYZM
 * "has not encoded this zone yet" would misstate the law in the other direction.
 */
const PUBLIC_SYSTEM_LEXEMES = [
    'zonas verdes', 'zona verde', 'espacios libres', 'red viaria', 'viario',
    'equipamiento', 'dotacional', 'servicios urbanos', 'infraestructura',
    'deportiv', 'espacios de transicion', 'espacios de transición',
    'sistema general', 'via publica', 'vía pública', 'parque',
];

/** Ordinance-name lexemes that mark INDUSTRIAL fabric. */
const INDUSTRIAL_LEXEMES = ['industrial', 'industria', 'poligono', 'polígono', 'logistic', 'almacen'];

const norm = (s: string | null | undefined): string =>
    (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Does the ordinance name mark land reserved for a public system?
 * P8 — emits `pryzm.zoning.madridSpacm.isPublicSystemOrdinance`.
 */
export function isPublicSystemOrdinance(ordinanceName: string | null | undefined): boolean {
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.isPublicSystemOrdinance');
    try {
        const n = norm(ordinanceName);
        const hit = n !== '' && PUBLIC_SYSTEM_LEXEMES.some((l) => n.includes(norm(l)));
        span.setAttribute('publicSystem', hit);
        return hit;
    } finally {
        span.end();
    }
}

/**
 * Does the ordinance name mark industrial fabric?
 * P8 — emits `pryzm.zoning.madridSpacm.isIndustrialOrdinance`.
 */
export function isIndustrialOrdinance(ordinanceName: string | null | undefined): boolean {
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.isIndustrialOrdinance');
    try {
        const n = norm(ordinanceName);
        const hit = n !== '' && INDUSTRIAL_LEXEMES.some((l) => n.includes(norm(l)));
        span.setAttribute('industrial', hit);
        return hit;
    } finally {
        span.end();
    }
}

/** The classifier's full answer — the grammar plus WHY, because "unknown" needs a reason. */
export interface GrammarClassification {
    readonly grammar: EnvelopeGrammar;
    /** The parameters that decided it, by field name. Empty when `unknown`. */
    readonly decidedBy: readonly string[];
    /** For `unknown`: what was missing. For the rest: what the operation will be. */
    readonly rationale: string;
    /** Parameters this grammar REQUIRES that are not known. Non-empty ⇒ cannot solve. */
    readonly missingRequired: readonly string[];
}

/** Does a height exist in EITHER form? Storeys alone still bound a solid, via a storey module. */
function hasAnyVerticalLimit(rules: EnvelopeRules): boolean {
    return isKnown(rules.height_m) || isKnown(rules.storeys);
}

function verticalFields(rules: EnvelopeRules): string[] {
    const out: string[] = [];
    if (isKnown(rules.height_m)) out.push('NM_ALTURA');
    if (isKnown(rules.storeys)) out.push('NM_N_PLTA');
    return out;
}

/**
 * Classify a zone's envelope grammar from its published parameters and its ordinance name.
 *
 * ⚠⚠ **A VERTICAL LIMIT IS REQUIRED BY EVERY GRAMMAR, AND THAT IS NOT A DESIGN CHOICE — IT IS WHAT
 * "ENVELOPE" MEANS.** Setbacks alone give a footprint; a footprint is not a solid. Publishing a
 * footprint as an envelope with an unstated height is exactly the L-616 mechanism: a missing
 * constraint OVERSTATES. So a zone with a full `NM_RTR_*` triple and no height classifies as
 * `unknown`, and the record refuses with `required-parameter-unknown`.
 *
 * ⭐ PRECEDENCE, and it is deliberate — **the more SPECIFIC operation wins**:
 *   1. INDUSTRIAL is checked first, on the ordinance NAME, because industrial parameter sets are
 *      systematically thinner and must be visible as a distinct class rather than degrading into
 *      `unknown` where nobody counts them.
 *   2. SETBACK before ALIGNMENT: a published `NM_RTR_*` triple is a POSITIVE statement that the
 *      building is set back from every boundary, which is incompatible with a façade on the street
 *      line. Where a row carries both a setback triple and a depth, the setbacks govern the shape
 *      and the depth is an additional cap — but that combination is not modelled by any shipped
 *      `GeometricRule` kind, so it is reported and the row stays on `setback` with the depth
 *      recorded in the rules. ⚠ Recorded as a KNOWN LIMIT, not silently dropped.
 *   3. ALIGNMENT requires `NM_FDO_MX_ED` POSITIVELY. It is NEVER reached by the ABSENCE of
 *      setbacks — 7,225 zero `NM_RTR_FRNT` values are sentinels, and inferring alignment from them
 *      would put an ensanche grammar on 7,225 suburban plots.
 *   4. OCCUPATION is the weakest: a coverage cap plus a height. It bounds a VOLUME but does not
 *      determine a FOOTPRINT SHAPE, so it is last and is reported as the cap it is.
 */
export function classifyGrammar(
    rules: EnvelopeRules,
    ordinanceName: string | null | undefined,
): GrammarClassification {
    // P8 — emits `pryzm.zoning.madridSpacm.classifyGrammar`. Wraps the untouched port so the
    // five-branch precedence ladder below stays verbatim and diff-clean.
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.classifyGrammar');
    try {
        const out = classifyGrammarImpl(rules, ordinanceName);
        span.setAttribute('grammar', out.grammar);
        span.setAttribute('missingRequiredCount', out.missingRequired.length);
        return out;
    } finally {
        span.end();
    }
}

function classifyGrammarImpl(
    rules: EnvelopeRules,
    ordinanceName: string | null | undefined,
): GrammarClassification {
    // ── 1 · INDUSTRIAL — on the NAME, before any parameter is read. ──────────────────────────
    if (isIndustrialOrdinance(ordinanceName)) {
        const missing = hasAnyVerticalLimit(rules) ? [] : ['NM_ALTURA|NM_N_PLTA'];
        return {
            grammar: 'industrial',
            decidedBy: ['DS_NOMB_ORD', ...verticalFields(rules)],
            rationale: 'the ordinance designation marks industrial fabric; its parameter set is '
                + 'systematically thinner than residential and is classified separately so it is '
                + 'counted rather than absorbed into `unknown`',
            missingRequired: missing,
        };
    }

    const vertical = verticalFields(rules);
    const hasVertical = vertical.length > 0;

    const setbacks = [rules.setbackFront_m, rules.setbackSide_m, rules.setbackRear_m];
    const knownSetbacks = setbacks.filter(isKnown).length;

    // ── 2 · SETBACK — a triple plus a vertical limit. ────────────────────────────────────────
    // ⚠ ALL THREE are required. A partial triple is not a rule: the shipped `SetbackRuleSchema`
    // demands `front_m`, `side_m` and `rear_m`, and defaulting the missing one to 0 would erode
    // nothing on that edge — publishing MORE buildable area than the ordinance grants.
    if (knownSetbacks === 3) {
        return {
            grammar: 'setback',
            decidedBy: ['NM_RTR_FRNT', 'NM_RTR_LATL', 'NM_RTR_POST', ...vertical],
            rationale: hasVertical
                ? 'a complete published setback triple plus a vertical limit — solves as the shipped '
                  + "`kind: 'setback'` inset (§L-591), eroding inward from every edge"
                : 'a complete published setback triple, but NO vertical limit — the inset yields a '
                  + 'FOOTPRINT, and a footprint published as an envelope understates nothing and '
                  + 'overstates the height entirely (L-616)',
            missingRequired: hasVertical ? [] : ['NM_ALTURA|NM_N_PLTA'],
        };
    }

    // ── 3 · ALIGNMENT — reached ONLY by a POSITIVE depth. ────────────────────────────────────
    if (isKnown(rules.depth_m)) {
        return {
            grammar: 'alignment',
            decidedBy: ['NM_FDO_MX_ED', ...vertical],
            rationale: hasVertical
                ? 'a published *profundidad edificable* plus a vertical limit — the façade sits ON '
                  + 'the alignment and the buildable band projects inward by that depth; solves as '
                  + "the shipped `kind: 'alignment'`, an inset THEN a half-plane clip"
                : 'a published *profundidad edificable* but NO vertical limit',
            missingRequired: hasVertical ? [] : ['NM_ALTURA|NM_N_PLTA'],
        };
    }

    // ── 4 · OCCUPATION — the weakest determination. ──────────────────────────────────────────
    if (isKnown(rules.occupationPct)) {
        return {
            grammar: 'occupation',
            decidedBy: ['NM_OCP_MX', ...vertical],
            rationale: hasVertical
                ? 'a published maximum plot coverage plus a vertical limit. ⚠ This bounds a VOLUME '
                  + 'but does not determine a FOOTPRINT SHAPE — the ordinance says how much of the '
                  + 'plot may be built on, not where. It is a cap, and it must be presented as one'
                : 'a published maximum plot coverage but NO vertical limit — bounds nothing solid',
            missingRequired: hasVertical ? [] : ['NM_ALTURA|NM_N_PLTA'],
        };
    }

    // ── 5 · UNKNOWN — the honest answer, and a common one. ───────────────────────────────────
    const absent: string[] = [];
    if (knownSetbacks > 0 && knownSetbacks < 3) {
        absent.push(`NM_RTR_* incomplete (${knownSetbacks} of 3 published)`);
    } else if (knownSetbacks === 0) {
        absent.push('NM_RTR_FRNT/LATL/POST');
    }
    absent.push('NM_FDO_MX_ED', 'NM_OCP_MX');
    return {
        grammar: 'unknown',
        decidedBy: [],
        rationale: 'no published parameter set determines a geometric operation for this zone. '
            + '⛔ A grammar is NOT forced: coercing this into a setback triple would erode the '
            + 'parcel by distances the ordinance never states, and coercing it into an alignment '
            + 'would grant the whole plot depth. Missing: ' + absent.join(', '),
        missingRequired: absent,
    };
}

/**
 * The parameters a grammar REQUIRES before the shipped engine can solve it.
 * Exported so the adapter and the tests agree on one definition rather than each restating it.
 */
export function requiredParameters(grammar: EnvelopeGrammar): readonly (keyof EnvelopeRules)[] {
    // P8 — emits `pryzm.zoning.madridSpacm.requiredParameters`.
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.requiredParameters');
    try {
        const out = requiredParametersImpl(grammar);
        span.setAttribute('grammar', grammar);
        span.setAttribute('requiredCount', out.length);
        return out;
    } finally {
        span.end();
    }
}

function requiredParametersImpl(grammar: EnvelopeGrammar): readonly (keyof EnvelopeRules)[] {
    switch (grammar) {
        case 'setback':
            return ['setbackFront_m', 'setbackSide_m', 'setbackRear_m'];
        case 'alignment':
            return ['depth_m'];
        case 'occupation':
            return ['occupationPct'];
        case 'industrial':
            // ⚠ Industrial is a CLASSIFICATION, not an operation — it still needs one of the three
            // parameter sets to solve, which is checked by the adapter, not enumerated here.
            return [];
        case 'unknown':
            return [];
    }
}

/**
 * Is a vertical limit present in either form? Exported so the adapter's check is this one.
 * P8 — emits `pryzm.zoning.madridSpacm.hasVerticalLimit`.
 */
export function hasVerticalLimit(height: Parameter, storeys: Parameter): boolean {
    const span = _tracer.startSpan('pryzm.zoning.madridSpacm.hasVerticalLimit');
    try {
        const has = isKnown(height) || isKnown(storeys);
        span.setAttribute('hasVerticalLimit', has);
        return has;
    } finally {
        span.end();
    }
}
