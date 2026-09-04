// §NL-F1-GUARD (lane ENVELOPE-NLDK, 2026-09-04) — F1 may not be asserted until THREE layers were read.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE EXPENSIVE DIRECTION (founder review §8)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Phase 0 counted F1 ("a plan governs and serves NO envelope mechanism") at 26 land + 49 urban,
// concentrated in `wonen` (42, led by plain "Wonen" at 32) — precisely where people build. The
// founder asks two questions before any of that is called terminal:
//
//   1. Is the mechanism in the BRUIDSSCHAT rather than the plan? The bruidsschat (hoofdstuk 22 of
//      every omgevingsplan) arrived automatically in every gemeente on 2024-01-01 with building
//      rules of its own — arts. 22.27 and 22.36 per the founder. A "Wonen" bestemming with no
//      bouwvlak and no height may be governed by a NATIONAL rule identical everywhere.
//   2. Has a WIJZIGINGSBESLUIT added one? The same voorrangsregels point as `nlRegelingIdentity.ts`.
//
// If either holds, the F1 is really "mechanism present, in a layer we do not read yet" — which is
// `mechanism: 'unknown'` (about us), NOT `absent` (F1, a claim about the instrument). Since F1 is
// defined as a correct null, misclassifying here is the expensive direction: it tells an owner the
// plan has nothing to say when a rule exists one layer over.
//
// This module is a GATE, not a reader. It does not consult the bruidsschat or the LVBB; it refuses
// to let `absent` through until a caller attests that all three layers WERE consulted. The three
// booleans are honest inputs — a caller that has not built the bruidsschat leg passes `false` and
// gets `unknown`, which is the truth.
//
// ⚠ CITATIONS: the bruidsschat article numbers are the founder's (review §4/§8), sourced but NOT
// re-verified by this lane — the IPLO bruidsschat pages returned 404 on the paths tried
// (2026-09-04). They are carried as a constant with that status, never as verified law.
//
// PURE (C58 §1.9). Deterministic. Consumes and emits the shared `RuleState` vocabulary.

import type { RuleState } from '@pryzm/schemas';

/** The bruidsschat articles the founder names as carrying building rules. Status: not re-verified. */
export const NL_BRUIDSSCHAT_BUILDING_RULE_ARTICLES = Object.freeze({
    articles: ['22.27', '22.36'] as readonly string[],
    instrument: 'omgevingsplan hoofdstuk 22 (bruidsschat) — national, identical in every gemeente on 2024-01-01',
    citationStatus: 'founder-sourced-not-re-verified',
    servedVia: 'DSO / LVBB (Ozon) — key-gated (Presenteren v8 HTTP 401, 2026-09-04)',
} as const);

/** The three layers an NL envelope rule can live in. F1 needs ALL THREE read. */
export interface NlF1LayerChecks {
    /** The tijdelijk-deel plan (bestemmingsplan) text/geometry was read for this rule. */
    readonly tijdelijkDeelRead: boolean;
    /** The bruidsschat (hoofdstuk 22) was checked for a mechanism covering this rule at this location. */
    readonly bruidsschatChecked: boolean;
    /** The gemeente's wijzigingsbesluiten (LVBB) were checked for a voorrangsregel touching this rule. */
    readonly wijzigingsbesluitenChecked: boolean;
}

export type NlF1LayerName = 'tijdelijk-deel' | 'bruidsschat' | 'wijzigingsbesluiten';

/** Which layers were NOT consulted. Empty ⇒ F1 is assertable. */
export function nlUncheckedLayers(checks: NlF1LayerChecks): readonly NlF1LayerName[] {
    const out: NlF1LayerName[] = [];
    if (!checks.tijdelijkDeelRead) out.push('tijdelijk-deel');
    if (!checks.bruidsschatChecked) out.push('bruidsschat');
    if (!checks.wijzigingsbesluitenChecked) out.push('wijzigingsbesluiten');
    return Object.freeze(out);
}

export type NlF1Verdict = 'f1-assertable' | 'f1-withheld';

export function nlF1Verdict(checks: NlF1LayerChecks): NlF1Verdict {
    return nlUncheckedLayers(checks).length === 0 ? 'f1-assertable' : 'f1-withheld';
}

/**
 * Guard a rule state: an `unrecovered` state carrying `mechanism: 'absent'` (F1) is downgraded to
 * `mechanism: 'unknown'` unless all three layers were consulted. Every other state passes through
 * unchanged. Pure and total; never throws.
 *
 * The downgrade keeps the original `failure` label and PREPENDS the unchecked layers to `stoppedAt`,
 * so the trail says exactly which leg is missing rather than replacing the reader's own note.
 */
export function nlGuardF1(state: RuleState, checks: NlF1LayerChecks): RuleState {
    if (state.status !== 'unrecovered' || state.mechanism !== 'absent') return state;
    const unchecked = nlUncheckedLayers(checks);
    if (unchecked.length === 0) return state;
    const note =
        `F1 WITHHELD — mechanism may exist in an unread layer (${unchecked.join(', ')}); ` +
        'reported as unknown, not absent';
    return {
        ...state,
        mechanism: 'unknown',
        stoppedAt: state.stoppedAt ? `${note}. ${state.stoppedAt}` : note,
    };
}

/** Guard a whole set. Order-preserving. */
export function nlGuardF1All(states: readonly RuleState[], checks: NlF1LayerChecks): readonly RuleState[] {
    return Object.freeze(states.map((s) => nlGuardF1(s, checks)));
}
