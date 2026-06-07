// Casa Unifamiliar — vertical-geometry decisions (founder v45/v46 + D38).
//
// Pure-math tests for the three founder refinements:
//   1. §ROOF-CAP-ELEVATION — roof base elevation = f(storeyCount × floorToFloor).
//   2. §DOOR-IN-WALL-SPAN  — door opening clamped within its host wall span.
//   3. §WALL-SLAB-CONTINUITY — wall top/base = slab mid at each floor junction.
// Plus an integration check that the orchestrator stamps the roof descriptor with
// the computed cap elevation for 1/2/3-storey houses.

import { describe, expect, it } from 'vitest';
import {
    roofBaseElevationM,
    roofBaseOffsetM,
    isDoorWithinWallSpan,
    clampDoorToWallSpan,
    wallVerticalExtents,
    wallExtentForLevel,
    DOOR_END_CLEAR_M,
    MIN_DOOR_WIDTH_M,
} from '../src/workflows/houseLayout/houseVertical.js';
import { generateHouseLayout } from '../src/workflows/houseLayout/index.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints, ApartmentProgram, ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';

// ─────────────────────────── 1. §ROOF-CAP-ELEVATION ───────────────────────────

describe('roofBaseElevationM — roof caps the topmost storey by storey count', () => {
    const FTF = 3.0;

    it('1-storey house: roof caps at base + wall head (1×ftf above base)', () => {
        expect(roofBaseElevationM(1, FTF, 0)).toBe(3.0);
    });

    it('2-storey house: roof caps at 2×ftf above the base (= 6 m), NOT one storey low', () => {
        // top storey floor = 3 m, + wall head 3 m → roof base 6 m.
        expect(roofBaseElevationM(2, FTF, 0)).toBe(6.0);
        // The founder bug: roof landed at 3 m (the level-1 floor) — assert we are NOT there.
        expect(roofBaseElevationM(2, FTF, 0)).not.toBe(3.0);
    });

    it('3-storey house: roof caps at 3×ftf above the base (= 9 m) — the "3rd level" cap', () => {
        expect(roofBaseElevationM(3, FTF, 0)).toBe(9.0);
    });

    it('honours a non-zero base elevation (site datum)', () => {
        expect(roofBaseElevationM(2, FTF, 1.5)).toBe(7.5);   // 1.5 + 2×3
    });

    it('honours a custom floor-to-floor + explicit wall head', () => {
        // 2 storeys @ 2.8 ftf, wall head 2.7 → top floor 2.8 + 2.7 = 5.5
        expect(roofBaseElevationM(2, 2.8, 0, 2.7)).toBe(5.5);
    });

    it('generalises: N-storey cap = base + (N−1)·ftf + wallHead for any N', () => {
        for (let n = 1; n <= 6; n++) {
            expect(roofBaseElevationM(n, FTF, 0)).toBeCloseTo((n - 1) * FTF + FTF, 6);
        }
    });

    it('clamps storeyCount ≥ 1 and degrades non-finite inputs', () => {
        expect(roofBaseElevationM(0, FTF, 0)).toBe(3.0);
        expect(roofBaseElevationM(-5, FTF, 0)).toBe(3.0);
        expect(roofBaseElevationM(Number.NaN, FTF, 0)).toBe(3.0);
        expect(Number.isFinite(roofBaseElevationM(2, Number.NaN, Number.NaN))).toBe(true);
    });

    it('roofBaseOffsetM is the wall head above the top floor (= ftf by default)', () => {
        expect(roofBaseOffsetM(3.0)).toBe(3.0);
        expect(roofBaseOffsetM(3.0, 2.7)).toBe(2.7);
        // base elevation + (N−1)·ftf + offset === roofBaseElevationM, by construction.
        const base = 0, ftf = 3.0, n = 3;
        expect(base + (n - 1) * ftf + roofBaseOffsetM(ftf)).toBe(roofBaseElevationM(n, ftf, base));
    });
});

// ─────────────────────────── 2. §DOOR-IN-WALL-SPAN ────────────────────────────

describe('isDoorWithinWallSpan — door is hosted IN the wall', () => {
    it('accepts a centred door that fits with end clearance', () => {
        // 4 m wall, 0.9 m door centred at offset 1.55 → ends at 2.45, both clear of 0.15.
        expect(isDoorWithinWallSpan(1.55, 0.9, 4.0)).toBe(true);
    });

    it('rejects a door overrunning the far end of the wall', () => {
        expect(isDoorWithinWallSpan(3.4, 0.9, 4.0)).toBe(false); // 3.4 + 0.9 = 4.3 > 4 − 0.15
    });

    it('rejects a door starting before the wall (negative / off-wall)', () => {
        expect(isDoorWithinWallSpan(-0.5, 0.9, 4.0)).toBe(false);
        expect(isDoorWithinWallSpan(0.0, 0.9, 4.0)).toBe(false);  // 0 < END_CLEAR 0.15
    });

    it('rejects degenerate / non-finite inputs', () => {
        expect(isDoorWithinWallSpan(1, 0, 4)).toBe(false);
        expect(isDoorWithinWallSpan(1, 0.9, 0)).toBe(false);
        expect(isDoorWithinWallSpan(Number.NaN, 0.9, 4)).toBe(false);
    });

    it('honours a custom end clearance', () => {
        // With 0 clearance a flush-start door is allowed.
        expect(isDoorWithinWallSpan(0, 0.9, 4.0, 0)).toBe(true);
    });
});

describe('clampDoorToWallSpan — clamp an off-wall door back into the span', () => {
    it('leaves an already-fitting door unchanged', () => {
        const c = clampDoorToWallSpan(1.55, 0.9, 4.0);
        expect(c).not.toBeNull();
        expect(c!.offsetM).toBeCloseTo(1.55, 6);
        expect(c!.widthM).toBeCloseTo(0.9, 6);
        expect(isDoorWithinWallSpan(c!.offsetM, c!.widthM, 4.0)).toBe(true);
    });

    it('slides an overrunning door back inside (keeps full width)', () => {
        const c = clampDoorToWallSpan(3.5, 0.9, 4.0);   // would end at 4.4
        expect(c).not.toBeNull();
        expect(isDoorWithinWallSpan(c!.offsetM, c!.widthM, 4.0)).toBe(true);
        expect(c!.widthM).toBeCloseTo(0.9, 6);          // wide enough → width preserved
        expect(c!.offsetM + c!.widthM).toBeLessThanOrEqual(4.0 - DOOR_END_CLEAR_M + 1e-6);
    });

    it('narrows the leaf when the wall is short but ≥ min door', () => {
        // 1.0 m wall: maxWidth = 1.0 − 0.3 = 0.7 = MIN_DOOR → narrows to 0.7.
        const c = clampDoorToWallSpan(0.2, 0.9, 1.0);
        expect(c).not.toBeNull();
        expect(c!.widthM).toBeCloseTo(MIN_DOOR_WIDTH_M, 6);
        expect(isDoorWithinWallSpan(c!.offsetM, c!.widthM, 1.0)).toBe(true);
    });

    it('returns null when the wall is too short to host any door', () => {
        expect(clampDoorToWallSpan(0.1, 0.9, 0.8)).toBeNull();   // maxWidth 0.5 < 0.7
        expect(clampDoorToWallSpan(0, 0.9, 0)).toBeNull();
    });
});

// ─────────────────────────── 3. §WALL-SLAB-CONTINUITY ─────────────────────────

describe('wallVerticalExtents — walls overlap the slab band at each junction (D38)', () => {
    const WH = 3.0;      // wall height (= ftf)
    const SLAB = 0.2;    // slab thickness
    const HALF = SLAB / 2;

    it('single storey: nominal extent, NO overlap (apartment path unchanged)', () => {
        const [e] = wallVerticalExtents([0], WH, SLAB);
        expect(e!.baseY).toBe(0);
        expect(e!.topY).toBe(WH);
        expect(e!.heightM).toBe(WH);
    });

    it('2 storeys: ground top rises slab/2, level-1 base drops slab/2, top at wall head', () => {
        const [g, u] = wallVerticalExtents([0, 3.0], WH, SLAB);
        // Ground: base on the ground (0), top rises into the slab above.
        expect(g!.baseY).toBe(0);
        expect(g!.topY).toBeCloseTo(WH + HALF, 6);            // 3.1
        // Upper (top) storey: base drops into the slab below, top at the wall head (roof caps).
        expect(u!.baseY).toBeCloseTo(3.0 - HALF, 6);          // 2.9
        expect(u!.topY).toBeCloseTo(3.0 + WH, 6);             // 6.0 (no further overlap — roof here)
    });

    it('the shared junction overlaps by slab (slab/2 from each side) — no exposed band', () => {
        const [g, u] = wallVerticalExtents([0, 3.0], WH, SLAB);
        // Ground top (3.1) is ABOVE level-1 base (2.9): they overlap across the
        // whole slab band [2.9, 3.1] (= one slab thickness), hiding the slab edge.
        expect(g!.topY).toBeGreaterThan(u!.baseY);
        expect(g!.topY - u!.baseY).toBeCloseTo(SLAB, 6);
    });

    it('3 storeys: the MIDDLE storey extends BOTH ways (base −slab/2, top +slab/2)', () => {
        const [g, m, t] = wallVerticalExtents([0, 3.0, 6.0], WH, SLAB);
        expect(g!.baseY).toBe(0);
        expect(g!.topY).toBeCloseTo(WH + HALF, 6);            // 3.1
        // Middle: both junctions overlapped.
        expect(m!.baseY).toBeCloseTo(3.0 - HALF, 6);          // 2.9
        expect(m!.topY).toBeCloseTo(3.0 + WH + HALF, 6);      // 6.1
        // Top: base drops, top at the wall head (roof caps).
        expect(t!.baseY).toBeCloseTo(6.0 - HALF, 6);          // 5.9
        expect(t!.topY).toBeCloseTo(6.0 + WH, 6);             // 9.0
        // Every adjacent junction overlaps by exactly one slab thickness.
        expect(g!.topY - m!.baseY).toBeCloseTo(SLAB, 6);
        expect(m!.topY - t!.baseY).toBeCloseTo(SLAB, 6);
    });

    it('wallExtentForLevel matches the array form for each level role', () => {
        const arr = wallVerticalExtents([0, 3.0, 6.0], WH, SLAB);
        expect(wallExtentForLevel(0, WH, SLAB, false, true)).toEqual(arr[0]);   // ground
        expect(wallExtentForLevel(3.0, WH, SLAB, true, true)).toEqual(arr[1]);  // middle
        expect(wallExtentForLevel(6.0, WH, SLAB, true, false)).toEqual(arr[2]); // top
    });

    it('zero slab thickness → no overlap (graceful degrade)', () => {
        const [g, u] = wallVerticalExtents([0, 3.0], WH, 0);
        expect(g!.topY).toBe(WH);
        expect(u!.baseY).toBe(3.0);
    });
});

// ─────────────── integration: orchestrator stamps the roof cap elevation ──────

describe('generateHouseLayout — roof descriptor carries the cap elevation', () => {
    const SHELL: ShellAnalysis = {
        netAreaM2: 120, widthM: 12, depthM: 10,
        perimeter: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }],
        faces: [],
    };
    const PROGRAM: ApartmentProgram = {
        bedrooms: 3, bathrooms: 2, masterEnSuite: true,
        openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
    };
    const CONSTRAINTS: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
    const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

    it('roof.baseElevationM caps the top storey for 1/2/3-storey houses', () => {
        for (const n of [1, 2, 3]) {
            const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, {
                storeyCount: n, floorToFloorM: 3.0, baseElevationM: 0,
            });
            const top = res.storeys[res.storeys.length - 1]!;
            // The descriptor's cap elevation === top floor + wall head, and matches the
            // pure roofBaseElevationM for the storey count.
            expect(res.roof.baseElevationM).toBe(roofBaseElevationM(n, 3.0, 0, 3.0));
            expect(res.roof.baseElevationM).toBeCloseTo(top.elevationM + (res.roof.baseOffsetM ?? 0), 6);
            // The roof targets the TOP storey level (never the ground for N ≥ 2).
            expect(res.roof.levelId).toBe(top.levelId);
        }
    });
});
