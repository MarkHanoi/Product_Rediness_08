// §RESI-CORE-REWORK (founder 2026-06-26: "the central core is too tight — the stair
// landing pokes past the core wall and the lift has no proper approach"). The core
// (centred; apartments pack around it) must be sized so BOTH the stair AND the lift get
// a proper access run with the architectural clearances:
//   • ≥ APPROACH_CLEAR_M (1.2 m) clear in front of the stair's first riser (to step ON)
//   • ≥ APPROACH_CLEAR_M (1.2 m) clear at the top landing (to step OFF) — this is the
//     half-turn landing depth, which is part of the U-stair body
//   • ≥ APPROACH_CLEAR_M (1.2 m) clear in front of the lift door
//   • the U-stair's full footprint (2 flights side-by-side + rail clearance laterally;
//     flight-1 run + one tread + the half-turn landing in the run direction)
//   • the lift shaft (width × depth)
//   • the RC perimeter wall thickness on every side
//
// This module is the SINGLE SOURCE OF TRUTH for the minimum core dimensions: it DERIVES
// coreWidth/coreDepth from those clearances (no magic 6×4). The orchestrator floors the
// requested/default core at this minimum (so the core GROWS to fit), and the executor
// places the stair + lift inside the resulting rect with the same clearances — so the
// landing is contained by construction. Pure + deterministic (no THREE/DOM/RNG/I/O).

/** Architectural approach clearance (m) — the clear run a person needs to step onto the
 *  stair's first riser, off the top landing, and in front of the lift door. */
export const APPROACH_CLEAR_M = 1.2;

/** Stair tuning shared with the executor's stair build (mirrors the executor constants so
 *  the sizing matches the geometry placed inside the rect). */
export const STAIR_TREAD_M = 0.27;
export const STAIR_RISER_MAX_M = 0.19;
/** The U-stair's per-flight clear width target (the executor clamps to fit, ≥0.9 m). */
export const STAIR_FLIGHT_WIDTH_M = 1.0;
/** Rail clearance off the RC wall for the outer flight balustrade (executor STAIR_RAIL_CLEAR_M). */
export const STAIR_RAIL_CLEAR_M = 0.18;

/** RC core perimeter wall thickness (m) — mirrors the executor's SHELL_WALL_THICKNESS_M. */
export const CORE_WALL_THICKNESS_M = 0.2;
/** A small separating gap (m) between the stair x-band and the lift shaft. */
export const STAIR_LIFT_GAP_M = 0.1;

/** Default lift shaft plan size (m) the resi lift command builds (executor clamps shaftWidth
 *  to [1.6, 2.0] and shaftDepth to [1.2, 2.4]; use the lower-bound passenger cab here so the
 *  derived core is the architectural MINIMUM, which the executor then fills). */
export const LIFT_SHAFT_WIDTH_M = 1.6;
export const LIFT_SHAFT_DEPTH_M = 1.6;

export interface CoreSizingInput {
    /** The tallest floor-to-floor rise the stair serves (m) — drives the riser count and
     *  thus the run length (the worst case, usually the 4.5 m commercial ground). */
    readonly maxFloorToFloorM: number;
    /** Override the per-flight stair width (m). Defaults to STAIR_FLIGHT_WIDTH_M. */
    readonly stairFlightWidthM?: number;
    /** Override the lift shaft plan size (m). Defaults to LIFT_SHAFT_{WIDTH,DEPTH}_M. */
    readonly liftShaftWidthM?: number;
    readonly liftShaftDepthM?: number;
}

export interface CoreSizing {
    /** The minimum core plan WIDTH (m, x = lateral: stair band | gap | lift). */
    readonly coreWidthM: number;
    /** The minimum core plan DEPTH (m, z = run direction: wall | approach | body | wall). */
    readonly coreDepthM: number;
    // ── Diagnostic sub-dimensions (the derivation, exposed for tests/telemetry) ──
    /** Run-direction depth of the U-stair body = flight-1 run + one tread + the half-turn landing. */
    readonly stairBodyDepthM: number;
    /** The half-turn landing depth (the run-direction step-off space at the top). */
    readonly stairLandingDepthM: number;
    /** Lateral footprint of the U-stair = rail clear + 2 flights. */
    readonly stairLateralM: number;
    /** Number of risers in the worst-case (tallest) flight. */
    readonly risers: number;
}

/** ceil-half — the number of risers in flight 1 of a U-stair (the longer half). */
function beforeOf(n: number): number { return Math.ceil(n / 2); }

/**
 * Derive the MINIMUM core plan dimensions from the stair + lift footprints and the 1.2 m
 * approach clearances. The layout (LOCAL frame), looking down:
 *
 *   z1 (back)  ┌─────────────────────────────┐  ← RC wall
 *              │  stair body   │   lift shaft │
 *              │  (2 flights + │   (w × d)    │
 *              │   landing)    │              │
 *              │ ───────────── │ ──────────── │
 *              │  APPROACH 1.2 │  APPROACH 1.2│  ← lobby (fire door opens here)
 *   z0 (lobby) └─────────────────────────────┘  ← RC wall (z0 fire door)
 *              x0          (stair│lift split)  x1
 *
 *   coreWidth  = wallT + railClear + 2·flightW + gap + liftShaftW + wallT
 *   coreDepth  = wallT + APPROACH + max(stairBodyDepth, liftShaftD) + wallT
 *   stairBodyDepth = flight1Run + tread + landing ; landing = max(APPROACH, flightW)
 *
 * The landing depth is at least the 1.2 m step-off clearance (and at least one flight
 * width), so the top landing is a real, contained step-off space — not an overhang.
 */
export function deriveCoreSizing(input: CoreSizingInput): CoreSizing {
    const flightW = input.stairFlightWidthM && input.stairFlightWidthM > 0 ? input.stairFlightWidthM : STAIR_FLIGHT_WIDTH_M;
    const liftW = input.liftShaftWidthM && input.liftShaftWidthM > 0 ? input.liftShaftWidthM : LIFT_SHAFT_WIDTH_M;
    const liftD = input.liftShaftDepthM && input.liftShaftDepthM > 0 ? input.liftShaftDepthM : LIFT_SHAFT_DEPTH_M;
    const ftf = Math.max(2.4, input.maxFloorToFloorM);   // never size below a sane storey rise

    // Worst-case riser count: enough risers to keep the riser height ≤ the command max (0.19).
    const risers = Math.max(2, Math.ceil(ftf / STAIR_RISER_MAX_M));
    const flight1Run = beforeOf(risers) * STAIR_TREAD_M;
    // The half-turn landing is the run-direction step-off space at the top of flight 1. It must
    // be ≥ the 1.2 m step-off clearance AND ≥ one flight width (a half-turn landing is ~one
    // tread + the turn, but we reserve the clearance so the step-off is contained, never an overhang).
    const stairLandingDepthM = Math.max(APPROACH_CLEAR_M, flightW);
    // Run-direction body depth = flight-1 run + one tread (flight 2 starts one tread past flight 1)
    // + the landing step-off.
    const stairBodyDepthM = flight1Run + STAIR_TREAD_M + stairLandingDepthM;

    // Lateral (x) footprint of the U-stair: the outer flight's rail clearance off the wall + two
    // flights side-by-side.
    const stairLateralM = STAIR_RAIL_CLEAR_M + 2 * flightW;

    const wallT = CORE_WALL_THICKNESS_M;
    const coreWidthM =
        wallT +                 // x0 RC wall (full thickness budgeted across the two side walls)
        stairLateralM +         // stair band (rail clear + 2 flights)
        STAIR_LIFT_GAP_M +      // separating gap
        liftW +                 // lift shaft
        wallT;                  // x1 RC wall
    const coreDepthM =
        wallT +                                     // z0 RC wall (fire-door wall)
        APPROACH_CLEAR_M +                          // lobby approach in front of stair/lift
        Math.max(stairBodyDepthM, liftD) +          // the deeper of stair body / lift shaft
        wallT;                                      // z1 RC back wall

    return {
        coreWidthM: round4(coreWidthM),
        coreDepthM: round4(coreDepthM),
        stairBodyDepthM: round4(stairBodyDepthM),
        stairLandingDepthM: round4(stairLandingDepthM),
        stairLateralM: round4(stairLateralM),
        risers,
    };
}

function round4(n: number): number { return Math.round(n * 1e4) / 1e4; }
