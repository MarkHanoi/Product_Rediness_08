// §NSW-CITATION-STATE — what PRYZM emits for a value whose clause is ABSENT.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE FINDING THAT FORCED THIS FILE, AND WHY IT IS A FOUNDER DECISION AND NOT A LOCAL ONE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `NSW-ENVELOPE-BUILD-PROMPT.md` §1.2: *"Every value carries its clause. The layers serve
// `LEGIS_REF_CLAUSE` and `LEGIS_REF_VALUE`. A value in our output without them is a bug, not a
// style choice."* And §13: *"CI: no value without a clause citation."*
//
// Phase 0 measured the premise and **it is false for the layers that matter**
// (`docs/04-reference/jurisdictions/au/nsw/phase0-transcripts/PHASE0-REPORT.md` §M1.3):
//
//     Principal/14  Height of Buildings ............ LEGIS_REF_CLAUSE 94.8% populated
//     10 of the 12 vertical OVERLAY layers ......... LEGIS_REF_CLAUSE  0.0% populated
//     LEGIS_REF_VALUE (state-wide) ................. 2.5% LocalProvisions / 0.0% SEPP,
//                                                    and where non-null it holds the LEP
//                                                    map-symbol code ("N1"), not a number.
//
// So the founder's §13 assertion, read literally as "no emitted value lacks a populated
// `LEGIS_REF_CLAUSE`", is **unsatisfiable** — and §UNSATISFIABLE-GATE-DECOMPOSITION-IS-THE-FIX
// (L-716) says the fix for an unsatisfiable gate is to DECOMPOSE it, never to relax it and never
// to leave it red forever. This file is that decomposition.
//
// ⛔ THE ONE FORBIDDEN ANSWER — silently dropping the citation requirement. The founder's §14 is
// explicit that per-parameter clause citation with typed refusal IS the differentiator:
// *"Nothing in Archistar's public material claims per-parameter clause citation with typed
// refusal. Build that or do not enter."* An uncited value must therefore be a TYPED, VISIBLE
// state — never a clean number.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE DECOMPOSITION — three assertions where the brief had one
// ══════════════════════════════════════════════════════════════════════════════════════════════
// **A · LEGAL ADDRESS — hard-0, achievable TODAY, and it holds.** Every emitted `RuleState`
//   carries a `RuleSourceRef` whose `country`/`authority`/`dataset` are populated. The layer
//   identity is always known, so this never fails; a value with no legal address at all is
//   unshippable and always was.
//
// **B · CITATION STATE — hard-0, achievable TODAY, and it is the real invariant.** Every value
//   carries a `NswCitationState` — a CLOSED enum, never a nullable string — and
//   **no control in state `absent` may contribute a number to the envelope.** An uncited control
//   is reported, named, and NOT applied.
//
//   ⭐ THIS IS WHY THE MEASUREMENT IS SURVIVABLE. The 10 uncited overlay layers are *already*
//   unapplied, for an independent reason: with no clause there is no registry ruling, so their
//   legal role is `UNRESOLVED`, and `resolveNswVerticalPrecedence` never applies an unresolved
//   role. **The citation gap and the role gap are the same gap.** Arm B does not ask the engine
//   to do anything it does not already do — it makes the property CHECKABLE instead of emergent,
//   which is the difference between an invariant and a coincidence.
//
// **C · UNCITED COUNT — a shrink-only ratchet, and the number the founder actually wants at 0.**
//   How many NSW controls PRYZM can see and cannot cite. It falls only when signed registry rows
//   are added (`nswClauseRegistry.ts`). It is a ratchet and not a hard-0 because no code change
//   moves it: only legal reading does. ⛔ Per §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7 / L-836) a
//   breach of this ratchet is fixed by citing the control, never by raising the ceiling.
//
// ⚠ WHAT B DOES **NOT** SAY, stated so nobody reads a stronger claim into a green gate: it does
// not say NSW envelopes are fully cited. It says an uncited control never silently becomes a
// number. The uncited controls are still there, still uncited, and still counted by C.
//
// P5-adjacent purity: pure data + pure total functions. No I/O, no clock, no RNG.
// Contracts: C58 §1.2/§1.3/§1.4 (never overstate; a refusal owes a citation; refuse rather than
// fabricate), C62 (authority), C63 (denominator honesty), C74 §0, C75 (provenance).

import type { RuleSourceRef } from '@pryzm/schemas';

import { nswLayerName, NSW_LAYER } from './nswPortalLayers.js';
import { isNswRulingSigned, type NswControlRuling } from './nswClauseRegistry.js';

/**
 * §CITATION-STATE — WHERE a control's clause came from, as a closed enum.
 *
 * ⛔ A CLOSED ENUM, NOT A NULLABLE STRING, AND THAT IS THE WHOLE POINT. `clause: string | null`
 * has exactly one way to say "no clause" and no way at all to say WHY, which is the shape
 * `RuleState.ts`'s own header condemns: *"A nullable numeric field can express exactly one
 * absence."* These four states are four different facts with four different remedies.
 *
 *  - `served`            — 🟢 the feature itself carried `LEGIS_REF_CLAUSE`. The government cited
 *                          its own control. Measured 94.8% on Principal/14; 0.0% on ten overlays.
 *  - `registry-signed`   — 🟢 no served clause, and a `nswClauseRegistry` row supplies one that a
 *                          NAMED HUMAN verified against the instrument. Publishable: build prompt
 *                          §1.4 makes a named signer the condition for status A.
 *  - `registry-unsigned` — 🟠 a registry row supplies a clause and **nobody has signed it.**
 *                          Usable in development, NEVER in a published envelope. It is a claim
 *                          about someone's land with no human behind it.
 *  - `absent`            — 🔴 no clause anywhere. **The control is reported and NOT applied.**
 *                          This is not a failure of the pipeline; it is the pipeline declining to
 *                          turn an uncited polygon into an entitlement.
 */
export type NswCitationState = 'served' | 'registry-signed' | 'registry-unsigned' | 'absent';

/** The states in which a control may contribute a number. `absent` is deliberately not among them. */
export const NSW_CITABLE_STATES: readonly NswCitationState[] = Object.freeze([
    'served',
    'registry-signed',
    'registry-unsigned',
]);

/** The states in which a control may reach a PUBLISHED envelope (build prompt §1.4: a signer). */
export const NSW_PUBLISHABLE_STATES: readonly NswCitationState[] = Object.freeze([
    'served',
    'registry-signed',
]);

/** ARM B, as one predicate. ⛔ The only sanctioned way to ask "may this control produce a number?" */
export function nswMayContributeValue(state: NswCitationState): boolean {
    return NSW_CITABLE_STATES.includes(state);
}

/** ARM B's publication half. `registry-unsigned` is deliberately excluded — see the enum doc. */
export function nswMayPublish(state: NswCitationState): boolean {
    return NSW_PUBLISHABLE_STATES.includes(state);
}

/** A citation, resolved: the state, the text (when there is any), and where it came from. */
export interface NswCitation {
    readonly state: NswCitationState;
    /** The clause text. `null` exactly when `state === 'absent'` — the two agree by construction. */
    readonly clause: string | null;
    /** The signer's name, when `state === 'registry-signed'`. */
    readonly signedBy: string | null;
    /**
     * One line the reader sees when the clause is absent, naming what is missing and what would
     * close it. ⛔ Populated for `absent` ALWAYS — an uncited control owes the reader a reason,
     * exactly as an unapplied uplift does (C58 §1.3).
     */
    readonly absenceReason: string | null;
}

/**
 * Resolve one control's citation. **Total** — every input maps to a state, and `absent` is a
 * legitimate outcome rather than an error.
 *
 * Precedence: a clause the government served on the feature beats a registry row, always. The
 * publisher is accountable for theirs; we are accountable for ours. (Same ordering, same reason,
 * as `RULE_REACHABILITY_ORDER` putting `source-complete` above `derivable`.)
 */
export function nswResolveCitation(
    servedClause: string | null,
    ruling: NswControlRuling | null,
    layerId: number,
): NswCitation {
    if (servedClause && servedClause.trim().length > 0) {
        return { state: 'served', clause: servedClause.trim(), signedBy: null, absenceReason: null };
    }
    const registryClause = ruling?.clause?.trim();
    if (registryClause) {
        return isNswRulingSigned(ruling)
            ? {
                  state: 'registry-signed',
                  clause: registryClause,
                  signedBy: ruling!.signedBy,
                  absenceReason: null,
              }
            : {
                  state: 'registry-unsigned',
                  clause: registryClause,
                  signedBy: null,
                  absenceReason: null,
              };
    }
    return {
        state: 'absent',
        clause: null,
        signedBy: null,
        absenceReason: nswAbsenceReason(layerId),
    };
}

/**
 * The reader-facing sentence for an uncited control, per layer where the measurement is specific.
 *
 * ⚠ The numbers here are MEASURED (PHASE0-REPORT §M1.3), and they are in a user-visible string on
 * purpose: *"the government does not cite this layer"* is a fact about the source, and saying so
 * plainly is the difference between a typed refusal and an apology.
 */
export function nswAbsenceReason(layerId: number): string {
    const name = nswLayerName(layerId);
    if (layerId === NSW_LAYER.HEIGHT_OF_BUILDINGS) {
        return (
            `${name} carries no LEGIS_REF_CLAUSE on this feature (the layer serves one on 94.8% of ` +
            'features state-wide). No signed registry ruling covers this instrument either, so the ' +
            'control is reported without a citation and is not applied.'
        );
    }
    return (
        `${name} serves no LEGIS_REF_CLAUSE — measured 0.0% populated on this layer family, so the ` +
        'absence is the service\'s, not this parcel\'s. Which clause makes this control bind, and ' +
        'whether it replaces, supplements or caps the base height, is not established. The control ' +
        'is reported and NOT applied; a signed entry in the NSW clause registry is what closes it.'
    );
}

/** The publishing authority for every NSW ePlanning control. One spelling, used everywhere. */
export const NSW_AUTHORITY = 'NSW Department of Planning, Housing and Infrastructure' as const;

/**
 * Build the shared `RuleSourceRef` (the E1a legal address) for one NSW control.
 *
 * ARM A lives here: `country`/`authority`/`dataset` are ALWAYS populated, because the layer
 * identity is always known even when the clause is not. `article` carries the clause and is
 * `null` exactly when the citation state is `absent` — so `ref.article === null` and
 * `citation.state === 'absent'` can never disagree.
 *
 * ⚠ `article` alone is NOT the invariant. A consumer that checks only `article != null` learns
 * nothing about WHY, and cannot tell a signed registry citation from a served one. Read
 * `NswCitation`; `ref` is the address, not the verdict.
 */
export function nswRuleSourceRef(params: {
    readonly layerId: number | null;
    readonly service: string;
    readonly instrument: string | null;
    readonly objectId: string | null;
    readonly citation: NswCitation | null;
}): RuleSourceRef {
    const { layerId, service, instrument, objectId, citation } = params;
    return {
        country: 'AU',
        authority: NSW_AUTHORITY,
        dataset: layerId === null ? service : `${service}/${layerId} ${nswLayerName(layerId)}`,
        plan_id: instrument && instrument.trim().length > 0 ? instrument.trim() : null,
        object_id: objectId && objectId.trim().length > 0 ? objectId.trim() : null,
        document: null,
        article: citation?.clause ?? null,
        page: null,
    };
}
