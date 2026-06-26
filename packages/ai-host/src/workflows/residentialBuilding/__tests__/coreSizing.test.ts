// §RESI-CORE-REWORK — the clearance-derived core sizing must guarantee the stair body
// (flights + the half-turn landing), the lift shaft, and a 1.2 m approach in front of
// BOTH the stair and the lift all fit INSIDE the core walls. These cases pin that the
// derived core: holds stair-run + landing within bounds, reserves the 1.2 m clearances,
// and grows for a taller storey (more risers → longer run → deeper core).
import { describe, it, expect } from 'vitest';
import {
    deriveCoreSizing,
    APPROACH_CLEAR_M,
    CORE_WALL_THICKNESS_M,
    STAIR_TREAD_M,
    STAIR_RISER_MAX_M,
    STAIR_FLIGHT_WIDTH_M,
    STAIR_RAIL_CLEAR_M,
    STAIR_LIFT_GAP_M,
    LIFT_SHAFT_WIDTH_M,
    LIFT_SHAFT_DEPTH_M,
} from '../coreSizing.js';

describe('deriveCoreSizing — §RESI-CORE-REWORK', () => {
    it('the tall commercial ground (4.5 m) core holds the full stair body + 1.2 m approach in depth', () => {
        const s = deriveCoreSizing({ maxFloorToFloorM: 4.5 });
        // The inner depth (core depth − both RC walls) must hold the 1.2 m approach + the stair body.
        const innerDepth = s.coreDepthM - 2 * CORE_WALL_THICKNESS_M;
        expect(innerDepth).toBeGreaterThanOrEqual(APPROACH_CLEAR_M + s.stairBodyDepthM - 1e-6);
        // And the landing step-off is a real, contained space ≥ the 1.2 m clearance.
        expect(s.stairLandingDepthM).toBeGreaterThanOrEqual(APPROACH_CLEAR_M - 1e-6);
    });

    it('the core width holds 2 stair flights (+ rail clear) + a gap + the lift shaft + both walls', () => {
        const s = deriveCoreSizing({ maxFloorToFloorM: 4.5 });
        const expectedW =
            CORE_WALL_THICKNESS_M +
            (STAIR_RAIL_CLEAR_M + 2 * STAIR_FLIGHT_WIDTH_M) +
            STAIR_LIFT_GAP_M +
            LIFT_SHAFT_WIDTH_M +
            CORE_WALL_THICKNESS_M;
        expect(s.coreWidthM).toBeCloseTo(expectedW, 4);
        // The stair lateral footprint alone must fit inside the inner width with the lift beside it.
        const innerWidth = s.coreWidthM - 2 * CORE_WALL_THICKNESS_M;
        expect(s.stairLateralM + STAIR_LIFT_GAP_M + LIFT_SHAFT_WIDTH_M).toBeLessThanOrEqual(innerWidth + 1e-6);
    });

    it('reserves ≥ 1.2 m clear in front of the lift door (lift depth + approach ≤ inner depth)', () => {
        const s = deriveCoreSizing({ maxFloorToFloorM: 4.5 });
        const innerDepth = s.coreDepthM - 2 * CORE_WALL_THICKNESS_M;
        // The lift column = approach (1.2) + shaft depth; it must fit the inner depth.
        expect(APPROACH_CLEAR_M + LIFT_SHAFT_DEPTH_M).toBeLessThanOrEqual(innerDepth + 1e-6);
    });

    it('the half-turn LANDING does not exceed the core bounds (body incl. landing ⊆ inner depth)', () => {
        const s = deriveCoreSizing({ maxFloorToFloorM: 4.5 });
        const innerDepth = s.coreDepthM - 2 * CORE_WALL_THICKNESS_M;
        // body (flight-1 run + tread + landing) + the 1.2 m front approach ⊆ inner depth.
        expect(APPROACH_CLEAR_M + s.stairBodyDepthM).toBeLessThanOrEqual(innerDepth + 1e-6);
    });

    it('the stair body depth equals flight-1 run + one tread + the landing (the derivation is exact)', () => {
        const ftf = 4.5;
        const s = deriveCoreSizing({ maxFloorToFloorM: ftf });
        const risers = Math.max(2, Math.ceil(ftf / STAIR_RISER_MAX_M));
        const before = Math.ceil(risers / 2);
        const flight1Run = before * STAIR_TREAD_M;
        const landing = Math.max(APPROACH_CLEAR_M, STAIR_FLIGHT_WIDTH_M);
        expect(s.risers).toBe(risers);
        expect(s.stairBodyDepthM).toBeCloseTo(flight1Run + STAIR_TREAD_M + landing, 4);
    });

    it('a TALLER storey needs a DEEPER core (more risers → longer flight-1 run)', () => {
        const tall = deriveCoreSizing({ maxFloorToFloorM: 4.5 });
        const taller = deriveCoreSizing({ maxFloorToFloorM: 6.0 });
        expect(taller.coreDepthM).toBeGreaterThan(tall.coreDepthM);
        expect(taller.risers).toBeGreaterThan(tall.risers);
    });

    it('a standard 3.0 m storey still reserves the full clearances (depth holds approach + body)', () => {
        const s = deriveCoreSizing({ maxFloorToFloorM: 3.0 });
        const innerDepth = s.coreDepthM - 2 * CORE_WALL_THICKNESS_M;
        expect(innerDepth).toBeGreaterThanOrEqual(APPROACH_CLEAR_M + s.stairBodyDepthM - 1e-6);
        expect(innerDepth).toBeGreaterThanOrEqual(APPROACH_CLEAR_M + LIFT_SHAFT_DEPTH_M - 1e-6);
    });

    it('honours wider stair flight / lift shaft overrides in the width', () => {
        const s = deriveCoreSizing({ maxFloorToFloorM: 4.5, stairFlightWidthM: 1.2, liftShaftWidthM: 2.0 });
        const expectedW =
            CORE_WALL_THICKNESS_M + (STAIR_RAIL_CLEAR_M + 2 * 1.2) + STAIR_LIFT_GAP_M + 2.0 + CORE_WALL_THICKNESS_M;
        expect(s.coreWidthM).toBeCloseTo(expectedW, 4);
    });

    it('never sizes below a sane storey rise (floored at 2.4 m)', () => {
        const tiny = deriveCoreSizing({ maxFloorToFloorM: 1.0 });
        const sane = deriveCoreSizing({ maxFloorToFloorM: 2.4 });
        expect(tiny.coreDepthM).toBeCloseTo(sane.coreDepthM, 4);
    });
});
