// BathroomPodRules — the ONLY new dimensional constants this family mints.
//
// §FEAT-BATHROOM-POD-COMPOUND (L-11400) · C109 §5.2 · C109 R-6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ WHAT MAY AND MAY NOT LIVE IN THIS FILE
// ═══════════════════════════════════════════════════════════════════════════════
// MAY:      clearances, gaps, and the default member set.
// MAY NOT:  a single sanitaryware FOOTPRINT.
//
// C109 R-6 is explicit: `TOILET_FOOTPRINTS`, `SHOWER_FOOTPRINTS`,
// `ACCESSORY_FOOTPRINTS` and `resolveFixtureFootprint`'s fallbacks are the ONLY places
// a sanitaryware dimension may appear. `PlumbingSymbolGeometry.resolveFixtureFootprint`
// exists precisely so the PLAN SYMBOL and the MESH cannot disagree about how big a
// toilet is; a pod-local copy would reintroduce exactly that disagreement, one step
// removed and harder to find.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠ WHERE THESE NUMBERS COME FROM — THEY ARE A TRANSLATION, NOT AN INVENTION
// ═══════════════════════════════════════════════════════════════════════════════
// SOURCE: `packages/ai-host/src/workflows/furnishLayout/footprints.ts` — the repo's
// live bathroom clearance table, in METRES, fields `clearFront` / `clearSides`. That
// file is itself PINNED (its own header says so) to
// `packages/ai-host/src/workflows/apartmentLayout/rules/programRules.ts`'s
// `clearFoot` / `clearSide`, which are in MILLIMETRES. Both are reproduced here in
// metres, translated from the FURNITURE kind vocabulary into the PLUMBING
// `fixtureType` vocabulary this family speaks:
//
//     pod member  <- furnishLayout kind        clearFront   clearSides
//     ----------     -------------------       ----------   ----------
//     wc          <- toilet_radiator              0.60         0.10
//     basin       <- vanity_unit                  0.70         0.05
//     shower      <- shower_glass_panel           0.20         0.00
//     bath        <- bath                         0.45         0.05
//     accessory   <- towel_rail                   0.00         0.00
//
// ⭐ WHY A COPY AND NOT AN IMPORT, WITH THE COST STATED RATHER THAN HIDDEN.
// `@pryzm/ai-host` is L2 and `footprints.ts` is PACKAGE-INTERNAL — it is not on the
// `@pryzm/ai-host` barrel (measured 2026-08-25: `packages/ai-host/src/index.ts`
// re-exports `rules/habitability` and not `workflows/furnishLayout/footprints`). The
// established precedent for exactly this situation is to COPY THE VALUES WITH A
// POINTER rather than deep-import another package's internals:
//   • `apps/editor/src/ui/house-layout/houseExecDiagnostics.ts:54-70` — verbatim,
//     "Hardcoded here (with this pointer) because ROOM_RULES is not re-exported from
//      the @pryzm/ai-host barrel and the editor L7 layer should not reach into the
//      package's internal rules module."
//   • `packages/data-engine/src/predicates/builtins.ts:1-12` — the same, for its
//     thresholds, citing L3 purity.
//
// ⛔ THE COST: there is NO GATE pinning this table to `footprints.ts`, so the two can
// drift. That is recorded as **L-11409, OPEN**, and the fix is a SHARED L0 VOCABULARY —
// not a geometry package reaching into another package's internals, and not a test that
// would have to create the very edge this file exists to avoid.
//
// ⚠ AND ONE MORE THING THESE NUMBERS ARE NOT. `programRules.ts:266-298` carries an
// explicit ⛔ header (L-4400) recording that its BS 8300 bathroom rows are "an
// accessibility design standard, NOT a habitability floor … THE PRYZM ENGINEERING
// BASELINE — the ONE named fallback, and law nowhere." So a refusal built on this table
// says "these objects do not fit in this rectangle". It does NOT say "this room is not
// a legal bathroom" — that claim belongs to
// `packages/ai-host/src/workflows/apartmentLayout/rules/habitability/` and must go
// through `provenanceSentence()`. C109 §5.4 makes that binding.

import type { BathroomPodMemberKind } from './BathroomPodTypes';

/** Activity space and side clearance for one member kind, in METRES. */
export interface BathroomPodClearance {
    /** Keep-clear depth in FRONT of the member, measured from its front face. */
    readonly clearFront: number;
    /** Keep-clear on EACH SIDE, measured from the member's side face. */
    readonly clearSides: number;
}

/**
 * The clearance table. See the header for provenance; ⛔ do not edit a value here
 * without editing `footprints.ts` in the same commit, and vice versa (L-11409).
 */
export const BATHROOM_POD_CLEARANCES: Readonly<Record<BathroomPodMemberKind, BathroomPodClearance>> =
    Object.freeze({
        wc: { clearFront: 0.60, clearSides: 0.10 },
        basin: { clearFront: 0.70, clearSides: 0.05 },
        shower: { clearFront: 0.20, clearSides: 0.00 },
        bath: { clearFront: 0.45, clearSides: 0.05 },
        accessory: { clearFront: 0.00, clearSides: 0.00 },
    });

/**
 * The default module — the founder's `SINK + TOILET + SHOWER + PANEL`.
 *
 * ⭐ `PANEL` IS NOT IN THIS LIST AND THAT IS THE POINT (C109 §2.1 / R-8): the glass
 * screen is emitted by the walk-in SHOWER variant, so listing it would create a second
 * record for one object. It is present in the pod as `DEFAULT_POD_SHOWER_VARIANT`
 * below, which is a walk-in slug and therefore carries glass by construction.
 */
export const BATHROOM_POD_DEFAULT_MEMBERS: readonly BathroomPodMemberKind[] =
    Object.freeze(['shower', 'wc', 'basin']);

/**
 * The pod's default shower.
 *
 * ⛔ NOT `DEFAULT_SHOWER_VARIANT` (`shower_system_shelf`), and the difference is the
 * founder's photograph. `shower_system_shelf` is a rain SYSTEM — a 0.30 x 0.40 m
 * column of pipework on a wall, no tray and no glass. The photograph shows a walk-in
 * enclosure with a frameless screen, which is `shower_walkin_*`. Choosing the family
 * default here would have produced a module with a shower head and no shower.
 *
 * The HAND is chosen from the pod's `handedness` at solve time — see
 * `podShowerVariantFor()` — so a left-handed pod gets glass on the correct side rather
 * than a fixed slug that is right half the time.
 */
export const DEFAULT_POD_SHOWER_VARIANT = 'shower_walkin_left' as const;

/**
 * The pod's default WC.
 *
 * `close_coupled_round` is `DEFAULT_TOILET_VARIANT`, it is what the founder's
 * photograph shows (a visible cistern behind the pan), and it is the family default —
 * so this row agrees with the family instead of quietly disagreeing with it.
 */
export const DEFAULT_POD_TOILET_VARIANT = 'close_coupled_round' as const;

/**
 * ⭐ THE ONE PLACE THE SHOWER'S GLASS HAND IS DECIDED.
 *
 * A pod whose shower sits at the LEFT end of the wall needs its glass screen on the
 * RIGHT of the tray — the open side faces into the room, and the screen separates the
 * shower from the fixture beside it. Getting this backwards puts a glass panel against
 * a wall and leaves the wet side open to the WC, which is the failure a person notices
 * immediately and a test does not.
 */
export function podShowerVariantFor(handedness: 'left' | 'right'): string {
    return handedness === 'left' ? 'shower_walkin_right' : 'shower_walkin_left';
}

/**
 * The gap required between two adjacent members standing on the same wall, in metres.
 *
 * ⭐ `max`, NOT `sum`. Two side clearances that overlap in the same strip of floor are
 * one strip of floor: a 0.10 m WC clearance and a 0.05 m basin clearance need 0.10 m
 * between the two fixtures, not 0.15 m. Summing them would inflate every module by the
 * total of every clearance in it and refuse rooms that build perfectly well — a refusal
 * that is wrong is worse than no refusal, because it is unarguable from the outside.
 */
export function podGapBetween(a: BathroomPodMemberKind, b: BathroomPodMemberKind): number {
    return Math.max(BATHROOM_POD_CLEARANCES[a].clearSides, BATHROOM_POD_CLEARANCES[b].clearSides);
}

/**
 * Members that stand on the FLOOR and therefore consume wall run.
 *
 * An `accessory` (towel rail, paper holder) is wall-mounted at high level and consumes
 * none — treating it as floor-standing would refuse rooms over a towel rail, which is
 * the "refusal that is wrong" case above in its most embarrassing form.
 */
export function podMemberConsumesRun(kind: BathroomPodMemberKind): boolean {
    return kind !== 'accessory';
}
