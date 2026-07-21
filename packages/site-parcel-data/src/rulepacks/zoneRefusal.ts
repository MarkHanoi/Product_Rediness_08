// L-550 / Phase 0.3 of `BARCELONA-COMPLETE-COVERAGE-PLAN.md` — THE REFUSAL VOCABULARY.
//
// WHAT THIS EXISTS TO FIX
// -----------------------
// Until now the editor had exactly two outcomes for a parcel: a solved envelope, or
// `applyEstimatedZoning` — the generic estimated rule pack, which produces a front/side/rear
// setback triple for ANY polygon it is handed. That triple was therefore rendered, in the same
// purple volume and the same card, over:
//
//   • a Collserola forest reserve (clau 27/28/29 — *sòl no urbanitzable*),
//   • the Ronda de Dalt (clau SX1 — *sistema viari*),
//   • the Parc de la Ciutadella (clau 6a),
//   • and a clau 18 *volumetria específica* plot whose buildability the PGM explicitly delegates
//     to an approved volumetric ordering for that site (Art. 306).
//
// In each case the ORDINANCE ANSWERS THE QUESTION, and its answer is "not by a zone envelope".
// Rendering an estimate there is not a conservative approximation — it is a fabricated legal
// claim about land that cannot be developed at all, and it is indistinguishable on screen from
// a real determination. That is the L-459 defect class (a constructed number rendering as a
// surveyed one) and the §CONTEXT-DATA-HONESTY family (a REFUSAL and a FAILURE collapsing to the
// same value) meeting on the same card.
//
// WHY A REFUSAL IS A *POSITIVE* ANSWER, NOT A SHORTFALL
// ----------------------------------------------------
// "Complete Barcelona" cannot mean "every parcel gets a polygon" — §3.5 of the plan measured
// 22.5 % of the city's private buildable land on clau 18, where the PGM states no rule and
// points at a different document per site. For that land the legally correct output IS a
// reasoned, cited refusal. This module is what makes that output expressible, so the city can
// be 100 % HONESTLY TIERED (constructed / refused / certified) long before it is 100 %
// constructed.
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. A refusal is data.
//
// Strategic context — C58 §1.2/§1.3/§1.4, C23,
// docs/04-reference/spain/barcelona-catalonia/BARCELONA-COMPLETE-COVERAGE-PLAN.md §0.3/§1.1/§5.

import type { BuildableEnvelope, EnvelopeRefusal } from '@pryzm/schemas';

/**
 * Build the `BuildableEnvelope` that says "no private buildable envelope applies here, and here
 * is why".
 *
 * ⚠ EVERY numeric field is null/zero and `insetPolygon` is EMPTY, deliberately and permanently.
 * A refusal that carried a height or an area would be re-admitting the fabrication through the
 * back door — downstream consumers (`storeyCap`, the generators, the massing render) read those
 * fields and would happily extrude one. `status: 'not-applicable'` additionally makes
 * `dispatchEnvelope` CLEAR any previously-persisted `buildableRing` rather than leave a stale one
 * that still looks authoritative (C58 §1.7a, the L-445 lesson).
 *
 * `confidence: 'not-determined'` is the honest label: no determination was made. It is NOT a
 * weaker `estimated-ruleset`, and the UI must not badge it as an estimate.
 */
/**
 * §L-574 — the status a refusal carries. Defaults to `'not-applicable'` (the L-550 legal
 * refusal). Pass `'none'` for `source-data-unavailable`, where the ordinance DOES apply and we
 * simply could not fetch what it needs.
 *
 * ⚠ THE TWO ARE NOT INTERCHANGEABLE, and the schema says why (`EnvelopeStatus`):
 * `'not-applicable'` means the ordinance ANSWERED and its answer was "not by a zone envelope";
 * `'none'` means the determination was attempted and found no data. Stamping a Catastro outage
 * as `'not-applicable'` would assert a legal fact we have not established — about someone's
 * land — which is the failure/refusal collapse this project has paid for three times
 * (L-422/L-467/L-469). Both clear a stale `buildableRing` (`dispatchEnvelope` writes only on
 * `'ok'`), so the L-445 protection is unchanged either way.
 */
export function buildRefusedEnvelope(
    zoneCode: string,
    refusal: EnvelopeRefusal,
    status: 'not-applicable' | 'none' = 'not-applicable',
): BuildableEnvelope {
    return {
        insetPolygon: [],
        maxHeight_m: null,
        maxFloors: null,
        maxFAR: null,
        maxCoverage: null,
        maxVolumeM3: null,
        insetAreaM2: 0,
        permittedUse: [],
        confidence: 'not-determined',
        // The refusal is a statement about THIS parcel's zone — a parcel-level answer, even
        // though it is not a parcel-level *number*. Stamping `'unknown'` would imply we are
        // unsure what the statement is about, which we are not (C58 §1.11.4).
        granularity: 'parcel',
        status,
        zoneCode,
        // No derivation rows: there is no constraint to explain. The `refusal` field carries the
        // explanation, and the compliance report renders zero rows rather than an empty table of
        // dashes that would read as "not filled in yet".
        derivation: [],
        caveats: [refusal.headline, refusal.detail],
        refusal,
    };
}

/**
 * Is this envelope a refusal? The single predicate every consumer should branch on, so the
 * status never has to be string-matched at ten call sites (and so a future status does not
 * silently fall into an `ok` branch).
 *
 * §L-574 — this previously hard-coded `status === 'not-applicable'`, which silently excluded the
 * new `source-data-unavailable` refusal (status `'none'`): every consumer would have treated it
 * as an ordinary empty envelope and its card would never have rendered. Caught by test, not by
 * review — which is exactly why the accepted statuses are now a NAMED LIST rather than a literal
 * buried in an expression.
 *
 * ⚠ IT IS DELIBERATELY STILL AN ALLOW-LIST, not simply `refusal !== null`. A `degenerate`
 * envelope carrying a refusal object is a contradictory state (the constraints consumed the
 * parcel AND the ordinance declined), and classifying it as a refusal would let a producer bug
 * render as a polished explanation. Refusing to recognise the impossible combination is what
 * makes the bug surface. **A new refusal kind MUST add its status here.**
 */
const REFUSAL_STATUSES: ReadonlySet<BuildableEnvelope['status']> = new Set([
    'not-applicable', // L-550 — the ordinance grants no private envelope here (legal).
    'none',           // L-574 — attempted, but an input was unavailable (data path).
]);

export function isRefusedEnvelope(env: BuildableEnvelope | null | undefined): boolean {
    return !!env && env.refusal != null && REFUSAL_STATUSES.has(env.status);
}

/**
 * §L-574 — is this refusal about PRYZM's DATA PATH rather than the law or our coverage?
 *
 * The one refusal that is TRANSIENT, and therefore the only one where offering a RETRY is
 * honest. Exposed as a predicate so no surface has to string-match the code (the same reason
 * `isRefusedEnvelope` exists).
 */
export function isTransientRefusal(env: BuildableEnvelope | null | undefined): boolean {
    return isRefusedEnvelope(env) && env!.refusal!.code === 'source-data-unavailable';
}
