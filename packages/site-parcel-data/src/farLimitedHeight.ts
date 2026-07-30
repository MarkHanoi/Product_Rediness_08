// §L-616 / §L-619 — FAR-BOUND MASSING HEIGHT, as a REUSABLE pure helper (§CONTEXT-DATA-HONESTY).
//
// WHY THIS EXISTS AS ITS OWN MODULE
// ---------------------------------
// L-616 taught the engine to compute `farLimitedHeight_m` — the height a FAR-realistic massing
// reaches inside the legal height shell — so the renderer can draw a translucent shell at
// `maxHeight_m` and an opaque solid at this height, and a FAR that caps floorspace below the height
// cap can no longer over-state buildable volume.
//
// But the engine can only compute it when it HOLDS the height at solve time. Barcelona's
// block-derived zones (clau 12 nucli antic, 13a/13b) ship `maxHeight_m: null` in the pack because the
// *alçada reguladora* is a per-street CONSTRUCTION — the height is resolved AFTER the solve and
// attached by `applyConstructedHeight` (or, historically, an inline spread in the L5 dispatcher). At
// engine time `maxHeight.value` is null, so the L-616 block was SKIPPED, and clau 12's real 1,40 FAR
// never bound the volume — the OVERSTATES-FAR verdict in `ENVELOPE-REALISM-MATRIX.md`.
//
// Extracting the math here lets BOTH consumers cap by FAR with identical arithmetic:
//   • `ZoningRulesEngine` — when the height is known at solve time (setback zones like BCN 20a);
//   • `applyConstructedHeight` — when the height arrives later (BCN 12 / 13a / 13b block-derived).
// A second copy of the formula would be free to disagree on a compliance number.
//
// PURE, deterministic, never throws (C58 §1.1/§1.9). No I/O, no THREE, no DOM.

/** The floor-to-floor height ASSUMED when a zone states no storey count. Surfaced, never silent. */
export const ASSUMED_FLOOR_TO_FLOOR_M = 3.0;

export interface FarLimitedHeightInput {
    /** Plot ratio (m² sostre / m² sòl). `null`/≤0 ⇒ FAR does not bind → result is null. */
    readonly maxFAR: number | null;
    /** Lot area (m²) — the FAR denominator. */
    readonly parcelAreaM2: number;
    /** Buildable-footprint area (m²) — the inset/clipped ring the floors stack on. */
    readonly footprintAreaM2: number;
    /** The legal height cap (m). FAR can only LOWER the massing beneath this, never raise it. */
    readonly maxHeight_m: number | null;
    /** Storey cap, where the zone states one — sets the floor-to-floor height. `null` ⇒ assume. */
    readonly maxFloors: number | null;
}

export interface FarLimitedHeightResult {
    /**
     * The FAR-realistic massing height (m), clamped to `maxHeight_m`. `null` when FAR does not bind
     * (no FAR, no footprint, or no legal height) — then the solid == the shell, unchanged behaviour.
     */
    readonly farLimitedHeight_m: number | null;
    /** GFA the FAR permits over the lot (m² sostre), or null. */
    readonly maxGFA: number | null;
    /** How many floors that GFA fills over the footprint, or null. */
    readonly floorsByFAR: number | null;
    /** The floor-to-floor height used (m): `maxHeight/maxFloors` when stated, else the assumption. */
    readonly floorHeightM: number | null;
    /** TRUE when `ASSUMED_FLOOR_TO_FLOOR_M` was used (no storey count) — must be surfaced. */
    readonly floorHeightAssumed: boolean;
    /** TRUE when FAR strictly LOWERS the massing below the legal cap (i.e. the caveat should show). */
    readonly binds: boolean;
}

const NO_BIND: FarLimitedHeightResult = Object.freeze({
    farLimitedHeight_m: null,
    maxGFA: null,
    floorsByFAR: null,
    floorHeightM: null,
    floorHeightAssumed: false,
    binds: false,
});

/**
 * Compute the FAR-limited massing height. Byte-identical to the L-616 engine block it replaced.
 *
 * `null` (does-not-bind) whenever any of {FAR, footprint, legal height} is absent or non-positive —
 * FAR can only ever LOWER a height, so with no legal ceiling there is nothing to lower.
 */
export function computeFarLimitedHeight(input: FarLimitedHeightInput): FarLimitedHeightResult {
    const { maxFAR, parcelAreaM2, footprintAreaM2, maxHeight_m, maxFloors } = input;
    if (
        !(typeof maxFAR === 'number' && maxFAR > 0) ||
        !(footprintAreaM2 > 0) ||
        !(typeof maxHeight_m === 'number' && maxHeight_m > 0)
    ) {
        return NO_BIND;
    }
    // ⚠ L-449 TODO — THE FAR DENOMINATOR IS CHOSEN HERE, and it is HARDWIRED to the PARCEL area.
    // This is correct only when the FAR is a genuine per-parcel ratio. Denmark's bebyggelsesprocent
    // has a legally-variable denominator scope (parcel / property / planning-area — BR18 §168–186);
    // a whole-area value is NOT a per-lot allowance. The engine is jurisdiction-agnostic (C58 §1.5),
    // so it cannot branch on DK scope: the DK pack (`rulepacks/dkPlandataEnvelope.ts`) instead
    // WITHHOLDS `plotRatioFAR` (emits null) for any non-parcel scope, so only a parcel-scoped FAR
    // ever reaches this line. If a future `densityScope` parameter is threaded through the engine,
    // property scope would denominate by property area and planning-area would refuse here.
    const maxGFA = maxFAR * parcelAreaM2;
    const floorsByFAR = maxGFA / footprintAreaM2;
    const floorHeightAssumed = !(typeof maxFloors === 'number' && maxFloors > 0);
    const floorHeightM = floorHeightAssumed ? ASSUMED_FLOOR_TO_FLOOR_M : maxHeight_m / maxFloors!;
    const farHeight = floorsByFAR * floorHeightM;
    // FAR only lowers; never taller than the legal cap.
    const farLimitedHeight_m = Math.min(maxHeight_m, farHeight);
    return {
        farLimitedHeight_m,
        maxGFA,
        floorsByFAR,
        floorHeightM,
        floorHeightAssumed,
        binds: farLimitedHeight_m < maxHeight_m - 1e-6,
    };
}

/**
 * The §CONTEXT-DATA-HONESTY caveat for a binding FAR cap — the 3.0 m floor assumption is surfaced,
 * never applied silently. Returns `null` when FAR did not bind (no caveat to add).
 *
 * ⚠ The exact wording is pinned by `farLimitedHeight.test.ts` — a shell/solid split renderer and the
 * facts panel both match on it. Do not reword without updating those assertions.
 */
export function farLimitedHeightCaveat(
    res: FarLimitedHeightResult,
    maxFAR: number,
    maxHeight_m: number,
): string | null {
    if (!res.binds || res.farLimitedHeight_m === null || res.floorsByFAR === null || res.floorHeightM === null) {
        return null;
    }
    return (
        `FAR ${maxFAR} caps usable floorspace to ~${res.floorsByFAR.toFixed(1)} ` +
        `floors (${res.farLimitedHeight_m.toFixed(1)} m at ~${res.floorHeightM.toFixed(1)} m ` +
        `floors); the ${maxHeight_m} m height limit is the outer legal bound.`
    );
}
