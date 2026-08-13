/**
 * §GE-06-ROOF-WALL-SLICE — oracle tests for `detectRoofWallClashes`
 * (packages/geometry-roof/src/pure/roofWallClash.ts).
 *
 * C73 §6 oracle-fixture spirit: every expected magnitude is HAND-COMPUTED in a
 * comment beside the assertion, from the declared underside model — never read
 * back from the implementation.
 *
 * THE UNDERSIDE MODEL UNDER TEST (pinned from §ROOF-SIT-ON-WALL-HEAD, the
 * 2026-06-17 flat-roof clash fix, commits aa8bbb0a + 3db21345):
 *   · every builder in RoofGeometryBuilder puts the soffit at local
 *     y = −thickness and the top/eave surface at y = 0;
 *   · the roof's world origin is originY = levelElevation + baseOffset;
 *   · FLAT roof underside(p)    = originY − thickness      (constant — the slab
 *     extrudes DOWN, which is exactly why baseOffset must equal thickness for a
 *     flat roof to sit ON the wall head rather than bite into it);
 *   · PITCHED roof underside(p) = originY + slope × d(p)   where d(p) is the
 *     inward distance from p to the eave polygon boundary (the uniform-pitch
 *     height field of pitchedFromOffsets) — the wall head is meant to meet the
 *     eave surface at y = 0, so pitched keeps baseOffset 0.
 */
import { describe, it, expect } from 'vitest';
import {
    detectRoofWallClashes,
    roofUndersideYAt,
    type RoofClashRoof,
    type RoofClashWall,
} from '../src/pure/roofWallClash';

/** 10 × 10 m square eave polygon, origin corner at (0,0). */
const SQUARE_10: Array<[number, number]> = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
];

function flatRoof(overrides: Partial<RoofClashRoof> = {}): RoofClashRoof {
    return {
        id: 'roof-1',
        eavePolygon: SQUARE_10,
        form: 'flat',
        originY: 3, // levelElevation 3 + baseOffset 0 — the PRE-FIX configuration
        thicknessM: 0.25,
        ...overrides,
    };
}

function wall(overrides: Partial<RoofClashWall> = {}): RoofClashWall {
    return {
        id: 'wall-1',
        start: [1, 5],
        end: [9, 5],
        baseElevationY: 0,
        heightM: 3,
        ...overrides,
    };
}

describe('roofUndersideYAt', () => {
    it('flat: underside is originY − thickness everywhere (slab extrudes DOWN)', () => {
        const roof = flatRoof();
        // Oracle: 3 − 0.25 = 2.75, independent of the sample point.
        expect(roofUndersideYAt(roof, [5, 5])).toBeCloseTo(2.75, 12);
        expect(roofUndersideYAt(roof, [1, 1])).toBeCloseTo(2.75, 12);
    });

    it('pitched: underside is originY + slope × distance-to-eave-boundary', () => {
        const roof: RoofClashRoof = {
            id: 'roof-p',
            eavePolygon: SQUARE_10,
            form: 'pitched',
            originY: 3,
            thicknessM: 0.25,
            slope: 0.5,
        };
        // Oracle: at (5,5) the boundary distance of the 10×10 square is
        // min(5, 5, 5, 5) = 5 ⇒ 3 + 0.5×5 = 5.5.
        expect(roofUndersideYAt(roof, [5, 5])).toBeCloseTo(5.5, 12);
        // Oracle: at (1,5) distance = min(1, 9, 5, 5) = 1 ⇒ 3 + 0.5×1 = 3.5.
        expect(roofUndersideYAt(roof, [1, 5])).toBeCloseTo(3.5, 12);
    });
});

describe('detectRoofWallClashes — the ADR-pinned flat-roof case', () => {
    it('§ROOF-SIT-ON-WALL-HEAD pre-fix: flat baseOffset 0 ⇒ the slab bites 0.25 m into the wall top — PENETRATES 0.25', () => {
        // Oracle: wall top = 0 + 3 = 3. Flat underside = originY − thickness
        // = 3 − 0.25 = 2.75. Penetration = 3 − 2.75 = 0.25 m — exactly the
        // "bottom 0.25 m bit INTO the wall tops" defect of 2026-06-17.
        const findings = detectRoofWallClashes(flatRoof(), [wall()]);
        expect(findings).toEqual([
            { wallId: 'wall-1', roofId: 'roof-1', kind: 'penetrates', magnitudeM: expect.closeTo(0.25, 9) },
        ]);
    });

    it('§ROOF-SIT-ON-WALL-HEAD post-fix: flat baseOffset = thickness ⇒ underside sits ON the wall head — CLEAN', () => {
        // Oracle: originY = 3 + 0.25 = 3.25; underside = 3.25 − 0.25 = 3.00
        // = wall top exactly ⇒ within COINCIDENT_M ⇒ no finding.
        const findings = detectRoofWallClashes(flatRoof({ originY: 3.25 }), [wall()]);
        expect(findings).toEqual([]);
    });
});

describe('detectRoofWallClashes — pitched plane', () => {
    const pitched: RoofClashRoof = {
        id: 'roof-p',
        eavePolygon: SQUARE_10,
        form: 'pitched',
        originY: 3, // baseOffset stays 0 for pitched (the same fix note)
        thicknessM: 0.25,
        slope: 0.5,
    };

    it('a wall poking through the pitched plane ⇒ PENETRATES with the deepest overshoot', () => {
        // Wall (1,5)→(9,5), height 5, base 0 ⇒ top = 5.
        // Oracle: underside(x, 5) = 3 + 0.5 × min(x, 10−x, 5).
        //   at x=1: 3 + 0.5×1 = 3.5  ⇒ overshoot 5 − 3.5 = 1.5  (deepest)
        //   at x=5: 3 + 0.5×5 = 5.5  ⇒ wall is BELOW the plane here by 0.5
        // Mixed samples ⇒ the wall pierces the surface somewhere ⇒ 'penetrates',
        // magnitude = the deepest overshoot = 1.5 m.
        const findings = detectRoofWallClashes(pitched, [wall({ heightM: 5 })]);
        expect(findings).toEqual([
            { wallId: 'wall-1', roofId: 'roof-p', kind: 'penetrates', magnitudeM: expect.closeTo(1.5, 9) },
        ]);
    });

    it('a wall everywhere below the pitched plane ⇒ GAP with the closest approach', () => {
        // Wall (1,5)→(9,5), height 3, base 0 ⇒ top = 3 = originY (the eave head).
        // Oracle: underside ranges 3.5 (at x=1 and x=9, d=1) … 5.5 (at x=5, d=5).
        // All samples are gaps; the gap that matters is the SMALLEST —
        // min(underside − top) = 3.5 − 3 = 0.5 m.
        const findings = detectRoofWallClashes(pitched, [wall()]);
        expect(findings).toEqual([
            { wallId: 'wall-1', roofId: 'roof-p', kind: 'gap', magnitudeM: expect.closeTo(0.5, 9) },
        ]);
    });
});

describe('detectRoofWallClashes — the PR-10 strandedness scenario', () => {
    it('level re-elevated +0.5 while the roof is STRANDED at the old elevation ⇒ walls beneath PENETRATE by 0.5', () => {
        // The SpatialAuthority C72 §5.1 shortfall: walls followed the level up
        // (base 0.5, top 3.5); the roof kept originY 3.25 (post-fix flat).
        // Oracle: underside = 3.25 − 0.25 = 3.00; penetration = 3.5 − 3.0 = 0.5.
        const findings = detectRoofWallClashes(
            flatRoof({ originY: 3.25 }),
            [wall({ baseElevationY: 0.5 })],
        );
        expect(findings).toEqual([
            { wallId: 'wall-1', roofId: 'roof-1', kind: 'penetrates', magnitudeM: expect.closeTo(0.5, 9) },
        ]);
    });

    it('level re-elevated −0.5 (roof stranded ABOVE) ⇒ walls beneath report a 0.5 m GAP', () => {
        // Oracle: walls dropped to top = 2.5; underside stays 3.0; gap = 0.5.
        const findings = detectRoofWallClashes(
            flatRoof({ originY: 3.25 }),
            [wall({ baseElevationY: -0.5 })],
        );
        expect(findings).toEqual([
            { wallId: 'wall-1', roofId: 'roof-1', kind: 'gap', magnitudeM: expect.closeTo(0.5, 9) },
        ]);
    });
});

describe('detectRoofWallClashes — membership, tolerance, determinism', () => {
    it('a wall entirely outside the eave polygon is NOT beneath the roof ⇒ no finding', () => {
        const findings = detectRoofWallClashes(flatRoof(), [
            wall({ start: [20, 5], end: [30, 5], heightM: 50 }),
        ]);
        expect(findings).toEqual([]);
    });

    it('a wall top within COINCIDENT_M of the underside is CLEAN, not a micro-clash', () => {
        // Oracle: underside = 2.75; top = 2.75 + 0.0005 — half the kernel's
        // 1 mm model-space identity tolerance ⇒ the same place ⇒ clean.
        const findings = detectRoofWallClashes(flatRoof(), [
            wall({ heightM: 2.7505 }),
        ]);
        expect(findings).toEqual([]);
    });

    it('a degenerate (zero-length) wall inside the footprint is still classified via its midpoint', () => {
        // Oracle: point wall at (5,5); flat underside 2.75; top 3 ⇒ penetrates 0.25.
        const findings = detectRoofWallClashes(flatRoof(), [
            wall({ start: [5, 5], end: [5, 5] }),
        ]);
        expect(findings).toEqual([
            { wallId: 'wall-1', roofId: 'roof-1', kind: 'penetrates', magnitudeM: expect.closeTo(0.25, 9) },
        ]);
    });

    it('deterministic: identical inputs produce deep-equal findings on every call', () => {
        const roof = flatRoof();
        const walls = [wall(), wall({ id: 'wall-2', start: [2, 2], end: [8, 2], heightM: 2 })];
        const a = detectRoofWallClashes(roof, walls);
        const b = detectRoofWallClashes(roof, walls);
        expect(a).toEqual(b);
        // Oracle for wall-2: top = 2; underside = 2.75 ⇒ gap 0.75.
        expect(a).toEqual([
            { wallId: 'wall-1', roofId: 'roof-1', kind: 'penetrates', magnitudeM: expect.closeTo(0.25, 9) },
            { wallId: 'wall-2', roofId: 'roof-1', kind: 'gap', magnitudeM: expect.closeTo(0.75, 9) },
        ]);
    });

    it('findings preserve the walls[] input order (no re-sorting surprises for the subscriber)', () => {
        const roof = flatRoof();
        const walls = [
            wall({ id: 'w-b', start: [2, 2], end: [8, 2], heightM: 2 }),
            wall({ id: 'w-a' }),
        ];
        expect(detectRoofWallClashes(roof, walls).map(f => f.wallId)).toEqual(['w-b', 'w-a']);
    });
});
