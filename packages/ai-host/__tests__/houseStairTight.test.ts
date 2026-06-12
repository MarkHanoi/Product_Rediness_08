// Casa Unifamiliar — §68.6 / §57.7 STAIR-TIGHT regression (founder 2026-06-11:
// "stair room too big; stair should be a tight ~1.5 m landing, cornered, not a large
// room"). The defect: the stair keep-out is reasonable (~footprint + landing) but the
// stair-clearance slivers + an adjacent UNPARTITIONED band beside the keep-out are left
// EMPTY → no wall separates them from the stair cell, so room-detection FLOODS the stair
// keep-out + that band into ONE ~30 m² (≈2.8×) stair room.
//
// THE FIX (engine-side, this package): §STAIR-LANDING-SEAL — `claimResidualPlacements` now
// ALWAYS seals a blank band that shares a wall with the stair keep-out (growing a neighbour
// or minting a "Landing"/"Store"), EVEN below the §65.2 cavern gate, so a real room borders
// the stair on every open side → the stair cell can never flood at detection.
//
// NO Math.random (banned) — fixed fixtures only.

import { describe, expect, it } from 'vitest';
import { generateHouseLayout } from '../src/workflows/houseLayout/index.js';
import { claimResidualPlacements, type RoomPlacement } from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import type { Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentConstraints, ApartmentProgram, RoomType, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

// ───────────────────────── 1 — the UNIT that locks the fix ────────────────────
//
// A small, well-tiled plate BELOW the §65.2 cavern gate (largest blank ≪ 48 m²) with a
// single stair keep-out and a ~10 m² blank band flush against it (the founder's unwalled
// "landing slack"). Pre-fix the gate is not met → the claim is a no-op → the band stays
// blank → it floods the stair at detection. Post-fix the band SHARES A WALL with the stair
// keep-out, so §STAIR-LANDING-SEAL fires below the gate and claims it.

describe('§STAIR-LANDING-SEAL — a blank band abutting the stair is sealed even below the §65.2 gate', () => {
    // Plate 10×6 m. A 4×3 stair keep-out in the corner; a placed bedroom (6×3) fills the
    // top; a 6×3 band along the bottom-right is LEFT BLANK and abuts the stair's right wall.
    const stairKO: Rect = { x0: 0, z0: 0, x1: 4, z1: 3 };
    const placements: RoomPlacement[] = [
        { roomId: 'stair0', rect: { x0: 0, z0: 0, x1: 4, z1: 3 } },       // the stair owns the keep-out
        { roomId: 'bed1', rect: { x0: 0, z0: 3, x1: 10, z1: 6 } },         // top band — placed
        // bottom-right 6×3 (x 4..10, z 0..3) is BLANK and flush to the stair's x=4 wall.
    ];
    const buildable: Rect[] = [{ x0: 0, z0: 0, x1: 10, z1: 6 }];
    const roomMeta = new Map<string, { type: RoomType; maxAreaM2: number }>([
        ['stair0', { type: 'stair', maxAreaM2: 16 }],
        ['bed1', { type: 'bedroom', maxAreaM2: 22 }],
    ]);

    it('WITHOUT the stair keep-out the 18 m² band is STILL claimed (§65.2-MODERATE — a moderate blank)', () => {
        // §65.2-MODERATE (founder 2026-06-12): the 18 m² band is a MODERATE blank (≥ the 6 m²
        // usable-cell floor), so it is now claimed even with NO stair keep-out and below the
        // 48 m² cavern gate — the founder's top-floor "Room NN" fix. (Pre-fix this was a no-op
        // because the gate fired only ≥ 48 m².) It is grown into the abutting bedroom up to its
        // hard-max, the rest minted as a named Store → the moderate blank is gone.
        const r = claimResidualPlacements(placements, buildable, roomMeta, 'seed');
        expect(r.claims.length).toBeGreaterThan(0);
        expect(r.largestBlankM2, 'an 18 m² moderate blank must be claimed').toBeLessThan(6.0);
    });

    it('WITH the stair keep-out the abutting band is claimed (sealed) — the fix', () => {
        const r = claimResidualPlacements(placements, buildable, roomMeta, 'seed', [stairKO]);
        // The band shares a wall with the stair → §STAIR-LANDING-SEAL fires below the gate.
        expect(r.mints.length + (r.placements.length - placements.length)).toBeGreaterThan(0);
        // The stair-adjacent blank is gone (sealed by a grown neighbour or a minted Store/Landing).
        expect(r.largestBlankM2).toBeLessThan(2.0);
    });

    it('a band NOT touching the stair is claimed the SAME with or without the keep-out (keep-out is rank-neutral)', () => {
        // The stair keep-out is fully surrounded by placed rooms (no open side); a separate
        // blank band sits AWAY from it, separated by a placed room — so it does NOT abut the
        // stair. The 9 m² band is a §65.2-MODERATE blank, so it is claimed in BOTH passes; the
        // presence of a (sealed) stair keep-out must not change a NON-stair-adjacent claim —
        // the two passes are identical (the keep-out only affects bands that abut the stair).
        const farKO: Rect = { x0: 0, z0: 0, x1: 4, z1: 3 };
        const ps: RoomPlacement[] = [
            { roomId: 'stair0', rect: { x0: 0, z0: 0, x1: 4, z1: 3 } },     // stair, corner
            { roomId: 'bed1', rect: { x0: 0, z0: 3, x1: 10, z1: 6 } },       // top band — placed
            { roomId: 'bed2', rect: { x0: 4, z0: 0, x1: 7, z1: 3 } },        // SEALS the stair's open (x=4) side
            // bottom-right band (x 7..10, z 0..3 = 9 m²) is BLANK but separated from the stair by bed2.
        ];
        const meta = new Map<string, { type: RoomType; maxAreaM2: number }>([
            ['stair0', { type: 'stair', maxAreaM2: 16 }],
            ['bed1', { type: 'bedroom', maxAreaM2: 22 }],
            ['bed2', { type: 'bedroom', maxAreaM2: 22 }],
        ]);
        const withKO = claimResidualPlacements(ps, buildable, meta, 'seed', [farKO]);
        const without = claimResidualPlacements(ps, buildable, meta, 'seed');
        // The far band does not abut the stair → no stair-driven claim → identical to the
        // no-keep-out result (the gate still governs; non-stair-adjacent blanks unchanged).
        expect(withKO.mints.length).toBe(without.mints.length);
        expect(withKO.largestBlankM2).toBeCloseTo(without.largestBlankM2, 6);
    });
});

// ───────────────────── 2 — the END-TO-END tightness invariant ─────────────────

const PROGRAM: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = {
    minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '',
};
const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

/** A large/dense multi-storey plate — the founder's oversized-stair case. */
const BIG_SHELL: ShellAnalysis = {
    netAreaM2: 252, widthM: 18, depthM: 14,
    perimeter: [{ x: 0, z: 0 }, { x: 18, z: 0 }, { x: 18, z: 14 }, { x: 0, z: 14 }], faces: [],
};

const CIRC_TYPES = new Set<RoomType>(['corridor', 'hall', 'stair']);

describe('§68.6 — the generated stair stays a TIGHT core that connects to circulation', () => {
    const res = generateHouseLayout(BIG_SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });

    it('every storey has exactly one tight stair room (≤ 1.65× its reserved core)', () => {
        expect(res.perStoreyLayout.length).toBe(2);
        const coreM2 = (res.stairs[0]!.rectMm.w / 1000) * (res.stairs[0]!.rectMm.h / 1000);
        expect(coreM2).toBeGreaterThan(0);
        for (const layout of res.perStoreyLayout) {
            expect(layout).not.toBeNull();
            const stairs = layout!.rooms.filter(r => r.type === 'stair');
            expect(stairs).toHaveLength(1);
            // The stair room must be a tight core — never the founder's oversized ~2.8× flood cell.
            expect(stairs[0]!.area / coreM2).toBeLessThanOrEqual(1.65);
            // And it must be tightly bounded in absolute terms (within the stair comfortable band
            // hardMax 16 m² — never a 30 m² room).
            expect(stairs[0]!.area).toBeLessThanOrEqual(16.0);
        }
    });

    it('the stair is sealed (has room neighbours) on every storey', () => {
        for (const layout of res.perStoreyLayout) {
            for (const stair of layout!.rooms.filter(r => r.type === 'stair')) {
                // A sealed stair always has ≥1 room neighbour — it can never be an open cell that
                // floods. (The §65.3 stair↔corridor DOOR connection is asserted on the standard
                // plate below, where a corridor abuts the stair; on a very dense plate the stair
                // is door-served through the §STAIR-SPINE-TOUCH bridge — still connected, but its
                // geometric neighbour may be a habitable room, a pre-existing compromise.)
                expect(stair.adjacentTo.length).toBeGreaterThan(0);
            }
        }
    });
});

describe('§68.6 — on a standard plate the stair connects to circulation', () => {
    const SHELL: ShellAnalysis = {
        netAreaM2: 130, widthM: 13, depthM: 10,
        perimeter: [{ x: 0, z: 0 }, { x: 13, z: 0 }, { x: 13, z: 10 }, { x: 0, z: 10 }], faces: [],
    };
    const res = generateHouseLayout(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });

    it('at least one stair neighbour across the stack is circulation (corridor/hall/stair)', () => {
        const stairNeighbourNames = new Set(
            res.perStoreyLayout.flatMap(l => l!.rooms.filter(r => r.type === 'stair')).flatMap(s => s.adjacentTo),
        );
        const neighbourTypes = res.perStoreyLayout
            .flatMap(l => l!.rooms)
            .filter(r => stairNeighbourNames.has(r.name))
            .map(r => r.type);
        expect(neighbourTypes.some(t => CIRC_TYPES.has(t))).toBe(true);
    });

    it('the stair stays tight on the standard plate too (≤ 1.65× its core)', () => {
        const coreM2 = (res.stairs[0]!.rectMm.w / 1000) * (res.stairs[0]!.rectMm.h / 1000);
        for (const layout of res.perStoreyLayout) {
            const stair = layout!.rooms.find(r => r.type === 'stair')!;
            expect(stair.area / coreM2).toBeLessThanOrEqual(1.65);
        }
    });
});
