// §26.6 rule 3 (L-13046, founder 2026-09-07) — EVERY INTENT SITS BESIDE ITS CEILING, AND CAN NEVER
// EXCEED IT.
//
// Founder, verbatim: *"I ALWAYS HAVE A WAY TO CHECK AGAINST THE TOTAL … SAME PRINCIPLE SIDE BY SIDE
// — USER CAN SEE HOW MUCH IS TRYING TO BUILD AGAINST THE MAXIMUM … CAN NEVER GO BEYOND."* Then
// §26.6.3: *"3.1 — Levels and heights. Total height renders beside Maximum height, then a per-level
// breakdown beneath. 3.2 — Areas. Ground area I want, beside the Maximum implantation area; then
// per level, the same pairing."*
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⛔ "CAN NEVER GO BEYOND" IS A REFUSAL WITH BOTH NUMBERS, NEVER A CLAMP
// ═══════════════════════════════════════════════════════════════════════════════════════════
// C58 §1.13, C58 §1.19 clause 4 and the §RAC-HARD-STOPPERS doctrine, applied to every pair below:
// an intent that exceeds its ceiling is REFUSED in a sentence that states the intent, the ceiling
// and the difference, and the intent is left exactly as the user declared it. The sentence is the
// ONE producer `beyondCeilingStatement` (the founder's model sentence, generalised — §26.6.0 rule
// 3: *"generalise it, do not replace it"*). Nothing here writes the store and nothing here trims.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⛔ EVERY NUMBER ARRIVES; NONE IS DERIVED HERE
// ═══════════════════════════════════════════════════════════════════════════════════════════
//   · the INTENT — what is declared — is the `IntendedAreaSnapshot` (`collectIntendedAreas`, the
//     ONE producer of the per-storey level-envelope areas, now carrying each storey's height);
//   · the CEILINGS — Maximum height · Maximum levels · Maximum implantation area · Maximum
//     buildable area — are the `ParcelLawModel` (the ONE model) plus `resolveBrutAllowance`
//     (the ONE producer of the total BRUT, so the total here is the total question 4 prints).
// A ceiling the pack did not derive is `null`, and the pair renders as *"not derived — cannot be
// checked"*, never as a pass and never as a fail (C58 §1.4: unknown ≠ zero, and unknown ≠ fine).
//
// PURE: no DOM, no store, no I/O. Total; never throws. P8 — one span on the exported builder.

import { trace } from '@opentelemetry/api';
import { beyondCeilingStatement, resolveBrutAllowance } from './brutAreaAllocation';
import type { IntendedAreaSnapshot } from './intendedAreaChannel';
import type { ParcelLawModel } from './parcel/parcelLawModel';
import type { SiteHighlightFixedSubject } from './siteGeometryHighlight';

const _tracer = trace.getTracer('pryzm.site.intentAgainstCeilingModel');

/** How one pair stands. Closed. */
export type IntentVerdict =
    /** Both known; the intent is at or under the ceiling. */
    | { readonly kind: 'within'; readonly sentence: string }
    /** ⛔ Both known; the intent EXCEEDS the ceiling — refused with both numbers, never clamped. */
    | { readonly kind: 'exceeds'; readonly sentence: string }
    /** The ceiling was not derived — the pair cannot be checked, and says so. */
    | { readonly kind: 'ceiling-not-derived'; readonly sentence: string }
    /** Nothing is declared yet — a ceiling with no intent beside it. */
    | { readonly kind: 'no-intent'; readonly sentence: string }
    /** The intent could not be measured from what is declared (e.g. no heights). */
    | { readonly kind: 'intent-unmeasurable'; readonly sentence: string };

export interface IntentPair {
    /** Stable id: `levels` · `total-height` · `ground-area` · `total-area` · `level-area:<id>`. */
    readonly id: string;
    readonly label: string;
    readonly intent: number | null;
    readonly ceiling: number | null;
    readonly unit: string;
    readonly dp: number;
    /** The ceiling's name AS THE FOUNDER NAMES IT — the row the ceiling is owned by (§26.6.2). */
    readonly ceilingLabel: string;
    /** §26.6 rule 2 — the ceiling is rendered as a LINK to its owner: the subject it lights. */
    readonly ceilingSubject: SiteHighlightFixedSubject | null;
    readonly verdict: IntentVerdict;
}

export type IntentAgainstCeiling =
    | {
        readonly readable: false;
        readonly reason: 'no-store' | 'store-threw';
        /** The channel's own sentence, verbatim. */
        readonly text: string;
    }
    | {
        readonly readable: true;
        /** 3.1 — levels and heights: the count pair, the total-height pair, then one row per storey. */
        readonly levels: IntentPair;
        readonly totalHeight: IntentPair;
        readonly heightsPerLevel: readonly { readonly levelId: string; readonly name: string | null; readonly elevation: number | null; readonly heightM: number | null }[];
        /** 3.2 — areas: the ground pair, then one pair per storey against the implantation ceiling, then the total. */
        readonly groundArea: IntentPair;
        readonly areasPerLevel: readonly IntentPair[];
        readonly totalArea: IntentPair;
        /** How the total height was measured, in words — an assumption is stated, never silent. */
        readonly totalHeightBasis: string | null;
    };

export const CEILING_LABEL = Object.freeze({
    levels: 'Maximum levels',
    height: 'Maximum height',
    implantation: 'Maximum implantation area (ground, plan)',
    buildable: 'Maximum buildable area (all floors, GFA)',
});

const NOT_DERIVED_CLAUSE = 'was not derived by the rule pack for this zone, so this cannot be checked. PRYZM does not infer a ceiling.';

function pair(
    id: string,
    label: string,
    intent: number | null,
    ceiling: number | null,
    unit: string,
    dp: number,
    ceilingLabel: string,
    ceilingSubject: SiteHighlightFixedSubject | null,
    clauses: { readonly ceilingClause: string; readonly consequence: string; readonly noIntent: string; readonly unmeasurable?: string },
): IntentPair {
    const f = (n: number): string => `${n.toFixed(dp)} ${unit}`;
    let verdict: IntentVerdict;
    if (intent === null) {
        verdict = clauses.unmeasurable
            ? { kind: 'intent-unmeasurable', sentence: `${label}: ${clauses.unmeasurable}` }
            : { kind: 'no-intent', sentence: `${label}: ${clauses.noIntent}` };
    } else if (ceiling === null) {
        verdict = {
            kind: 'ceiling-not-derived',
            sentence: `${label}: you asked for ${f(intent)}; the ${ceilingLabel} ${NOT_DERIVED_CLAUSE}`,
        };
    } else if (intent > ceiling + 1e-6) {
        verdict = {
            kind: 'exceeds',
            sentence: beyondCeilingStatement({
                label, asked: intent, ceiling, unit, dp,
                ceilingClause: clauses.ceilingClause, consequence: clauses.consequence,
            }),
        };
    } else {
        verdict = {
            kind: 'within',
            sentence: `${label}: ${f(intent)} of the ${f(ceiling)} ${ceilingLabel.toLowerCase()} — ${f(ceiling - intent)} in hand.`,
        };
    }
    return { id, label, intent, ceiling, unit, dp, ceilingLabel, ceilingSubject, verdict };
}

/** The consequence every INTENT refusal carries: the figure is not touched, and the user is told. */
export const INTENT_REFUSAL_CONSEQUENCE =
    'Nothing was trimmed: the envelopes stand as you declared them, and PRYZM will not clamp them — reduce it yourself.';

/**
 * THE model. Pure; total; never throws.
 *
 * @param snapshot the declared intent — `collectIntendedAreas`, the ONE producer (heights included)
 * @param law      the ONE `ParcelLawModel` — the ceilings, `null` where the pack derived none
 */
export function buildIntentAgainstCeiling(
    snapshot: IntendedAreaSnapshot,
    law: ParcelLawModel,
): IntentAgainstCeiling {
    const span = _tracer.startSpan('pryzm.site.buildIntentAgainstCeiling');
    try {
        if (!snapshot.readable) {
            span.setAttribute('pryzm.intentCeiling.arm', snapshot.reason);
            return { readable: false, reason: snapshot.reason, text: snapshot.text };
        }
        const maxLevels = law.ordinance?.maxFloors ?? null;
        const maxHeight = law.ordinance?.maxHeightM ?? null;
        const implantation = law.massing?.footprintM2 ?? null;
        // The total buildable (BRUT) is the ONE producer's answer, so this row and question 4's
        // ledger cannot disagree about the total.
        const allowance = resolveBrutAllowance({
            permittedFootprintM2: implantation,
            maxFAR: law.ordinance?.maxFAR ?? null,
            parcelAreaM2: law.geometry?.areaM2 ?? null,
            maxFloors: maxLevels,
        });
        const totalBuildable = allowance.totalBrutM2;

        const declared = snapshot.byLevel;
        const anyDeclared = declared.length > 0;

        // ── 3.1 LEVELS ──
        const levels = pair(
            'levels', 'Levels', anyDeclared ? declared.length : null, maxLevels, 'storeys', 0,
            CEILING_LABEL.levels, null,
            {
                ceilingClause: 'no building may have more storeys than the maximum levels',
                consequence: INTENT_REFUSAL_CONSEQUENCE,
                noIntent: 'no level envelope is declared yet, so there is no storey count to set beside the maximum.',
            },
        );

        // ── 3.1 TOTAL HEIGHT — measured from the declared envelopes, and the basis is STATED. ──
        let totalHeight: number | null = null;
        let basis: string | null = null;
        if (anyDeclared) {
            const allHeights = declared.every((l) => l.heightM !== null);
            const allElev = declared.every((l) => l.elevation !== null);
            if (allHeights && allElev) {
                const tops = declared.map((l) => l.elevation! + (l.baseOffsetM ?? 0) + l.heightM!);
                const bases = declared.map((l) => l.elevation! + (l.baseOffsetM ?? 0));
                totalHeight = Math.max(...tops) - Math.min(...bases);
                basis = 'From the top of the highest declared level envelope to the base of the lowest, using each storey\'s recorded elevation.';
            } else if (allHeights) {
                totalHeight = declared.reduce((s, l) => s + l.heightM!, 0);
                basis = 'The declared level heights added up, because at least one storey carries no recorded elevation — an assumption that the storeys stack without gaps.';
            }
        }
        const totalHeightPair = pair(
            'total-height', 'Total height', totalHeight, maxHeight, 'm', 1,
            CEILING_LABEL.height, 'height',
            {
                ceilingClause: 'no building may rise above the maximum height',
                consequence: INTENT_REFUSAL_CONSEQUENCE,
                noIntent: 'no level envelope is declared yet, so there is no height to set beside the maximum.',
                unmeasurable: anyDeclared && totalHeight === null
                    ? 'the declared level envelopes carry no usable height, so the total cannot be measured. It is not assumed.'
                    : undefined,
            },
        );

        // ── 3.2 AREAS — ground beside implantation, each storey beside implantation, total beside GFA. ──
        const ground = declared[0] ?? null;
        const groundArea = pair(
            'ground-area', ground ? `Ground (${ground.name ?? ground.levelId})` : 'Ground',
            ground ? ground.intendedAreaM2 : null, implantation, 'm²', 0,
            CEILING_LABEL.implantation, 'footprint',
            {
                ceilingClause: 'no storey may overhang the buildable footprint',
                consequence: INTENT_REFUSAL_CONSEQUENCE,
                noIntent: 'no level envelope is declared on any storey yet, so there is no ground area to set beside the maximum implantation area.',
            },
        );
        const areasPerLevel = declared.map((l) => pair(
            `level-area:${l.levelId}`, l.name ?? `Storey ${l.levelId}`, l.intendedAreaM2, implantation, 'm²', 0,
            CEILING_LABEL.implantation, 'footprint',
            {
                ceilingClause: 'no storey may overhang the buildable footprint',
                consequence: INTENT_REFUSAL_CONSEQUENCE,
                noIntent: 'nothing declared.',
            },
        ));
        const totalArea = pair(
            'total-area', 'All levels', snapshot.totalIntendedM2, totalBuildable, 'm²', 0,
            CEILING_LABEL.buildable, 'gfa',
            {
                ceilingClause: 'the floor area of all storeys added up may not exceed the maximum buildable area',
                consequence: INTENT_REFUSAL_CONSEQUENCE,
                noIntent: 'no level envelope is declared yet, so there is no total to set beside the maximum buildable area.',
            },
        );

        span.setAttribute('pryzm.intentCeiling.levels', declared.length);
        span.setAttribute('pryzm.intentCeiling.exceeds',
            [levels, totalHeightPair, groundArea, totalArea, ...areasPerLevel].filter((p) => p.verdict.kind === 'exceeds').length);
        return {
            readable: true,
            levels,
            totalHeight: totalHeightPair,
            heightsPerLevel: declared.map((l) => ({ levelId: l.levelId, name: l.name, elevation: l.elevation, heightM: l.heightM })),
            groundArea,
            areasPerLevel,
            totalArea,
            totalHeightBasis: basis,
        };
    } finally {
        span.end();
    }
}
