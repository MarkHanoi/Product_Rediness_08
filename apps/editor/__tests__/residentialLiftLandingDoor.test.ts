// @vitest-environment happy-dom
// §RESI-LIFT-LANDING-DOORS — the pure host-resolution helper for the lift landing door:
// it must land the door on the core's z0 lobby wall at the LIFT shaft x (the RIGHT-half,
// 0.75·coreW position the cab uses), clear of the centred fire door, and skip cleanly when
// the wall is too short to host it.

import { describe, expect, it } from 'vitest';
import { ResidentialBuildingExecutor } from '../src/ui/residential-building/ResidentialBuildingExecutor.js';

// The z0 wall runs x0→x1, so an along-wall offset `o` covers [x0+o, x0+o+width] in LOCAL x.
const CORE = { x0: 0, x1: 4 };          // 4 m wide core (typical)
const DOOR_W = 0.9;                      // VerticalCirculation schema default landing-door width

describe('ResidentialBuildingExecutor.landingDoorOffset (§RESI-LIFT-LANDING-DOORS)', () => {
    it('centres the door on the lift shaft x (0.75·coreW), not the wall centre', () => {
        const offset = ResidentialBuildingExecutor.landingDoorOffset(CORE, DOOR_W);
        expect(offset).toBeDefined();
        // Lift cx = x0 + coreW·0.75 = 3.0; door spans [cx − w/2, cx + w/2] = [2.55, 3.45].
        const doorCentre = (CORE.x0 + offset! + DOOR_W / 2);
        expect(doorCentre).toBeCloseTo(3.0, 6);
        expect(offset).toBeCloseTo(2.55, 6);
    });

    it('does NOT overlap the centred fire door slot on the same z0 wall', () => {
        const offset = ResidentialBuildingExecutor.landingDoorOffset(CORE, DOOR_W)!;
        const wallLen = CORE.x1 - CORE.x0;
        // Fire door (from _buildCorePerimeter): centred, w = min(1.0, max(0.8, len−0.4)).
        const fireW = Math.min(1.0, Math.max(0.8, wallLen - 0.4));
        const fireOff = Math.max(0, (wallLen - fireW) / 2);
        // Landing-door span starts at/after the fire-door span end → no overlap.
        expect(offset).toBeGreaterThanOrEqual(fireOff + fireW - 1e-9);
    });

    it('keeps the leaf inside the wall ends (jamb-clamped) on a wide core', () => {
        const wide = { x0: 0, x1: 6 };
        const offset = ResidentialBuildingExecutor.landingDoorOffset(wide, DOOR_W)!;
        const jamb = 0.2;
        expect(offset).toBeGreaterThanOrEqual(jamb - 1e-9);
        expect(offset + DOOR_W).toBeLessThanOrEqual((wide.x1 - wide.x0) - jamb + 1e-9);
    });

    it('skips (returns undefined) when the wall is too short to host the door + jambs', () => {
        // 1.0 m wall cannot hold a 0.9 m leaf + 2×0.2 m jambs (1.3 m needed).
        expect(ResidentialBuildingExecutor.landingDoorOffset({ x0: 0, x1: 1.0 }, DOOR_W)).toBeUndefined();
        // Degenerate / non-positive width or wall is rejected too.
        expect(ResidentialBuildingExecutor.landingDoorOffset({ x0: 0, x1: 0 }, DOOR_W)).toBeUndefined();
        expect(ResidentialBuildingExecutor.landingDoorOffset(CORE, 0)).toBeUndefined();
    });

    it('tracks the shaft as the core widens (offset grows with coreW)', () => {
        const narrow = ResidentialBuildingExecutor.landingDoorOffset({ x0: 0, x1: 3 }, DOOR_W)!;
        const wide = ResidentialBuildingExecutor.landingDoorOffset({ x0: 0, x1: 5 }, DOOR_W)!;
        expect(wide).toBeGreaterThan(narrow);
    });
});
