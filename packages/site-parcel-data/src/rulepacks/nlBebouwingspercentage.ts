// §NL-BEBPCT-DENOMINATOR (lane ENVELOPE-NLDK, 2026-09-04) — the denominator is a REQUIRED field.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE FOUNDER'S INSTRUCTION, AND WHY IT IS A TYPE RATHER THAN A DEFAULT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `NL-FOUNDER-BLOCKER-REVIEW.md` §7: *"make the denominator a REQUIRED field on the parameter,
// with NO DEFAULT. A `bebouwingspercentage` without a resolved denominator is `unrecovered`, never
// silently applied against the parcel."*
//
// A Dutch `maximum bebouwingspercentage (%)` is a fraction OF SOMETHING, and the plan's own
// begripsbepaling says of what: the `bouwvlak`, the `bouwperceel`, or the `bestemmingsvlak`. Where
// the bouwvlak is a fraction of the perceel, choosing wrong scales the footprint by that fraction.
// Phase 0 §1.1 already showed NL hides its errors in denominators (bouwvlak coverage 11.2 % or
// 36.7 % depending on which denominator you quote). This module makes the wrong choice
// UNREPRESENTABLE: `resolveNlBebouwingspercentage` takes an `NlDenominatorResolution`, not an
// optional string, and the only arm that yields a footprint is the one where the denominator is
// RESOLVED and its area is HELD.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE CORPUS SAYS (nl-inhoud-probe.json, 2026-09-04 — 73 plan texts, 6 definitions captured)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The six verbatim begripsbepalingen split: bouwvlak 2 · bouwperceel 1 · BOTH bouwvlak and
// bouwperceel 2 · neither ("een bepaald gebied") 1. And the wider Phase 0 keyword census over 66
// plans: of the 17 that mention `bebouwingspercentage`, 7 mention BOTH bouwvlak and perceel within
// 120 characters. So a keyword match does not settle the denominator on roughly a third of plans —
// which is exactly why this resolver has an `alternative` arm and no default.
//
// The classifier below is TRANSCRIBED from the probe (`classifyBebpctDenominator`), so the audit's
// histogram and the runtime speak one vocabulary. Fixtures in the test file are QUOTED from the
// probe's stored definitions, never written by the regex's author (lane rule).
//
// PURE (C58 §1.9). Deterministic (C58 §1.1). No I/O, no THREE, no DOM. C58 §1.3/§1.4, C63 (the
// denominator IS data), C74/C75. Emits the shared `RuleState` vocabulary against **C4**.

import type { RuleState } from '@pryzm/schemas';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The denominators
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The three things a Dutch bebouwingspercentage can be a fraction OF. Closed. */
export type NlBebouwingspercentageDenominator = 'bouwvlak' | 'bouwperceel' | 'bestemmingsvlak';

/**
 * The classifier's output vocabulary — the three denominators plus two honest non-answers.
 * `perceel-unqualified`: the definition says "perceel" without "bouw", which may mean the
 * bouwperceel (a PLAN concept that can span several kadastrale percelen) or the kadastraal perceel;
 * a regex cannot tell. `unclassified`: none of the three words appears ("een bepaald gebied").
 */
export type NlBebouwingspercentageDenominatorClass =
    | NlBebouwingspercentageDenominator
    | 'perceel-unqualified'
    | 'unclassified';

export const NL_BEBPCT_DENOMINATORS: readonly NlBebouwingspercentageDenominator[] = Object.freeze([
    'bouwvlak',
    'bouwperceel',
    'bestemmingsvlak',
] as const);

/**
 * Classify a verbatim `bebouwingspercentage` begripsbepaling into the denominators it names.
 * RETURNS A SET — a definition may name two ("de grootte van het bouwvlak en/of bouwperceel").
 * Transcribed from the probe harness; keep identical or the census stops describing the runtime.
 */
export function classifyNlBebouwingspercentageDenominator(
    definitionText: string | null | undefined,
): readonly NlBebouwingspercentageDenominatorClass[] {
    if (typeof definitionText !== 'string' || definitionText.trim() === '') return Object.freeze(['unclassified']);
    const s = definitionText.toLowerCase();
    const hits: NlBebouwingspercentageDenominatorClass[] = [];
    if (/\bbouwvlak(ken)?\b/.test(s)) hits.push('bouwvlak');
    if (/\bbouwperce(e)?l(en)?\b/.test(s)) hits.push('bouwperceel');
    if (/\bbestemmingsvlak(ken)?\b/.test(s)) hits.push('bestemmingsvlak');
    if (/\bperce(e)?l\b/.test(s) && !hits.includes('bouwperceel')) hits.push('perceel-unqualified');
    if (hits.length === 0) hits.push('unclassified');
    return Object.freeze(hits);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The denominator resolution — the REQUIRED input
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type NlDenominatorResolution =
    /** ONE denominator, from the begripsbepaling or a human signature. The only arm that applies. */
    | {
          readonly kind: 'resolved';
          readonly denominator: NlBebouwingspercentageDenominator;
          readonly basis: 'begripsbepaling' | 'human-signed';
          readonly definitionVerbatim: string | null;
      }
    /** The definition names SEVERAL denominators and a regex cannot pick. A human must. */
    | {
          readonly kind: 'alternative';
          readonly candidates: readonly NlBebouwingspercentageDenominator[];
          readonly definitionVerbatim: string;
      }
    /** No denominator could be read. ⚠ NOT a default — the percentage must not be applied. */
    | {
          readonly kind: 'unresolved';
          readonly reason: string;
          readonly definitionVerbatim: string | null;
      };

/**
 * Derive the denominator resolution from a plan's begripsbepaling text. Pure and total.
 *
 * `perceel-unqualified` is deliberately NOT promoted to `bouwperceel`: a bouwperceel is a plan
 * concept ("een aaneengesloten stuk grond waarop … bij elkaar behorende bebouwing is toegelaten")
 * and may span several kadastrale percelen, so the two words name different areas.
 */
export function resolveNlDenominatorFromDefinition(
    definitionText: string | null | undefined,
): NlDenominatorResolution {
    const text = typeof definitionText === 'string' ? definitionText.trim() : '';
    if (text === '') {
        return {
            kind: 'unresolved',
            reason: 'no `bebouwingspercentage` begripsbepaling was recovered from the plan text',
            definitionVerbatim: null,
        };
    }
    const classes = classifyNlBebouwingspercentageDenominator(text);
    const real = classes.filter((c): c is NlBebouwingspercentageDenominator =>
        c === 'bouwvlak' || c === 'bouwperceel' || c === 'bestemmingsvlak',
    );
    if (real.length === 1) {
        return { kind: 'resolved', denominator: real[0]!, basis: 'begripsbepaling', definitionVerbatim: text };
    }
    if (real.length > 1) {
        return { kind: 'alternative', candidates: Object.freeze([...real]), definitionVerbatim: text };
    }
    if (classes.includes('perceel-unqualified')) {
        return {
            kind: 'unresolved',
            reason:
                'the definition says "perceel" without "bouw" — it may mean the bouwperceel (a plan ' +
                'concept that can span several kadastrale percelen) or the kadastraal perceel; a ' +
                'human must read it',
            definitionVerbatim: text,
        };
    }
    return {
        kind: 'unresolved',
        reason: 'the definition names none of bouwvlak / bouwperceel / bestemmingsvlak',
        definitionVerbatim: text,
    };
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Applying the percentage — only ever against a RESOLVED denominator whose area is HELD
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** The areas the caller holds, in m². `null`/absent = not held. Never a fabricated 0. */
export interface NlDenominatorAreasM2 {
    readonly bouwvlak?: number | null;
    readonly bouwperceel?: number | null;
    readonly bestemmingsvlak?: number | null;
}

export interface NlBebouwingspercentageInputs {
    /** The published percentage as published, 0 < p ≤ 100 (SVBP2012 "maximum bebouwingspercentage (%)"). */
    readonly percentage: number;
    /** ⚠ REQUIRED. Not optional, no default. This field's absence is a compile error by design. */
    readonly denominator: NlDenominatorResolution;
    readonly areasM2: NlDenominatorAreasM2;
}

export type NlBebouwingspercentageResolution =
    /** 🟢 denominator resolved AND its area held → a footprint bound in m². */
    | {
          readonly kind: 'footprint-resolved';
          readonly denominator: NlBebouwingspercentageDenominator;
          readonly denominatorAreaM2: number;
          readonly ratio: number;
          readonly maxFootprintM2: number;
      }
    /** 🟡 several candidate denominators — every candidate footprint is shown, none is picked. */
    | {
          readonly kind: 'denominator-alternative';
          readonly candidates: readonly NlBebouwingspercentageDenominator[];
          readonly ratio: number;
          /** Candidate → footprint m² where the area is held; a candidate whose area is not held is absent. */
          readonly footprintsByCandidateM2: Readonly<Partial<Record<NlBebouwingspercentageDenominator, number>>>;
      }
    /** 🟡 denominator resolved, its area not held. Actionable: go measure THIS area. */
    | {
          readonly kind: 'denominator-identified-area-unknown';
          readonly denominator: NlBebouwingspercentageDenominator;
          readonly ratio: number;
          readonly requiredEvidence: string;
      }
    /** 🔴 no denominator — the percentage is a fact and is NOT applied. */
    | {
          readonly kind: 'denominator-unresolved';
          readonly ratio: number;
          readonly reason: string;
      }
    /** ⚫ the percentage itself is not a percentage (≤ 0, > 100, non-finite). */
    | { readonly kind: 'percentage-invalid'; readonly raw: number };

const areaOf = (a: NlDenominatorAreasM2, d: NlBebouwingspercentageDenominator): number | null => {
    const v = a[d];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
};

/**
 * Resolve the footprint bound a bebouwingspercentage imposes. Pure and total.
 *
 * ⚠ THERE IS NO PATH FROM AN UNRESOLVED DENOMINATOR TO A NUMBER. If the founder's example holds —
 * bouwvlak 200 m² inside a perceel of 600 m², percentage 50 — the two readings are 100 m² and
 * 300 m², a 3× error. This function returns neither until told which.
 */
export function resolveNlBebouwingspercentage(input: NlBebouwingspercentageInputs): NlBebouwingspercentageResolution {
    const p = input.percentage;
    if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p > 100) {
        return { kind: 'percentage-invalid', raw: p };
    }
    const ratio = p / 100;
    const d = input.denominator;
    switch (d.kind) {
        case 'unresolved':
            return { kind: 'denominator-unresolved', ratio, reason: d.reason };
        case 'alternative': {
            const footprints: Partial<Record<NlBebouwingspercentageDenominator, number>> = {};
            for (const c of d.candidates) {
                const a = areaOf(input.areasM2, c);
                if (a !== null) footprints[c] = a * ratio;
            }
            return {
                kind: 'denominator-alternative',
                candidates: d.candidates,
                ratio,
                footprintsByCandidateM2: Object.freeze(footprints),
            };
        }
        case 'resolved': {
            const a = areaOf(input.areasM2, d.denominator);
            if (a === null) {
                return {
                    kind: 'denominator-identified-area-unknown',
                    denominator: d.denominator,
                    ratio,
                    requiredEvidence: `the area (m²) of the ${d.denominator} this plan measures the percentage against`,
                };
            }
            return {
                kind: 'footprint-resolved',
                denominator: d.denominator,
                denominatorAreaM2: a,
                ratio,
                maxFootprintM2: a * ratio,
            };
        }
    }
}

/**
 * Project onto the shared `RuleState` vocabulary — parameter **C4 (footprint limit)**.
 *
 *   footprint-resolved                 → `resolved`, unit `m2`, reachability `derivable`
 *                                        (a published ratio × a held area — computed, not read)
 *   denominator-alternative            → `alternative` — each candidate is a distinct legal reading;
 *                                        NEVER averaged, never the smallest silently
 *   denominator-identified-area-unknown→ `unrecovered` / `semantic` / mechanism `present`
 *   denominator-unresolved             → `unrecovered` / `semantic` / mechanism `present`
 *                                        (⚠ PRESENT: the plan publishes a percentage, so the
 *                                        mechanism exists; what is unsettled is its meaning)
 *   percentage-invalid                 → `unrecovered` / `semantic` / mechanism `unknown`
 */
export function nlBebouwingspercentageToRuleState(
    r: NlBebouwingspercentageResolution,
    ref: RuleState['ref'],
): RuleState {
    switch (r.kind) {
        case 'footprint-resolved':
            return {
                rule: 'C4',
                status: 'resolved',
                reachability: 'derivable',
                value: r.maxFootprintM2,
                unit: 'm2',
                datum: null,
                provenance: 'pipeline-extracted',
                ref,
            };
        case 'denominator-alternative': {
            const alts = r.candidates.map((c) => {
                const fp = r.footprintsByCandidateM2[c];
                return fp !== undefined
                    ? `${Math.round(r.ratio * 100)} % of the ${c} = ${fp} m²`
                    : `${Math.round(r.ratio * 100)} % of the ${c} (area not held)`;
            });
            return { rule: 'C4', status: 'alternative', reachability: 'interpretive', alternatives: alts, ref };
        }
        case 'denominator-identified-area-unknown':
            return {
                rule: 'C4',
                status: 'unrecovered',
                partial: null,
                reachability: 'derivable',
                failure: 'semantic',
                mechanism: 'present',
                stoppedAt: r.requiredEvidence,
                ref,
            };
        case 'denominator-unresolved':
            return {
                rule: 'C4',
                status: 'unrecovered',
                partial: null,
                reachability: 'extractable',
                failure: 'semantic',
                mechanism: 'present',
                stoppedAt:
                    `bebouwingspercentage ${Math.round(r.ratio * 100)} % recovered but its denominator is ` +
                    `unresolved (${r.reason}) — NOT applied to the parcel`,
                ref,
            };
        case 'percentage-invalid':
            return {
                rule: 'C4',
                status: 'unrecovered',
                partial: null,
                reachability: 'extractable',
                failure: 'semantic',
                mechanism: 'unknown',
                stoppedAt: `published bebouwingspercentage "${String(r.raw)}" is not a percentage in (0, 100]`,
                ref,
            };
    }
}
