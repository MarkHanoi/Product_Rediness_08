// §RESI-CEILING-CLEARHEIGHT — the ONE producer of "what clear height does a finished ceiling sit
// at, given a storey's floor-to-floor?".
//
// ⭐ EXTRACTED FROM `CeilingLayoutExecutor.ts`, NOT COPIED (C84 EI-9). That module still exports
// `clearCeilingHeightFromFtf` — it now re-exports THIS one, so there is exactly one implementation
// and one set of constants. The extraction exists because the second consumer
// (`buildFromDesignPlan.ts`, §BIM-FROM-THE-DESIGN) is a PURE module: no store, no DOM, no THREE.
// Importing the executor would have dragged `@pryzm/core-app-model`, `@pryzm/ai-host` and THREE
// into a planner whose whole contract is that it touches none of them — and re-deriving the
// numbers there would have been the second copy of a solved problem
// ([[grep-for-the-existing-solver-first]]).
//
// PURE: no I/O, no clock, no RNG. Deterministic. Never throws.

/** Floor build-up + structure + MEP service void below the slab above. */
const CEILING_SERVICE_ZONE_M = 0.6;
/** Standard residential door leaf height — matches every door the resi pipeline builds. */
const DOOR_HEAD_M = 2.1;
/** Keep the ceiling strictly ABOVE the door head, never flush on it. */
const CEILING_DOOR_CLEARANCE_M = 0.05;
/** 2.15 m — clears the door head. §RESI-CEILING-DOOR-HEAD. */
export const MIN_CLEAR_CEILING_M = DOOR_HEAD_M + CEILING_DOOR_CLEARANCE_M;
/** Fallback clear height when the storey reports no floor-to-floor. */
export const DEFAULT_CLEAR_CEILING_M = 2.4;

/**
 * Convert a floor-to-floor height to a finished CLEAR ceiling height.
 *
 * ⛔ NEVER THE RAW FTF. Passing the storey height verbatim — the defect this function was written
 * to fix — places the ceiling slab at the full storey height, which is visually wrong and leaves
 * no service zone for the floor build-up, ducts or down-stand above.
 *
 * `undefined` / non-finite / ≤ 0 ftf → {@link DEFAULT_CLEAR_CEILING_M}, so the ceiling still lands
 * at a realistic finished height. A reported ftf is reduced by the service zone and clamped to
 * `[MIN_CLEAR_CEILING_M, ftf]`: on a very short storey the ceiling sits just above the door head
 * but never exceeds the ftf itself.
 */
export function clearCeilingHeightFromFtf(ftf: number | undefined): number {
    if (typeof ftf !== 'number' || !Number.isFinite(ftf) || ftf <= 0) return DEFAULT_CLEAR_CEILING_M;
    const clear = ftf - CEILING_SERVICE_ZONE_M;
    if (clear < MIN_CLEAR_CEILING_M) {
        // Very low storey — sit just above the door head (§RESI-CEILING-DOOR-HEAD) but never
        // exceed the ftf itself. A storey so short that even the door head does not fit is an
        // upstream defect, and this function does not paper over it.
        return Math.min(ftf, MIN_CLEAR_CEILING_M);
    }
    return clear;
}
