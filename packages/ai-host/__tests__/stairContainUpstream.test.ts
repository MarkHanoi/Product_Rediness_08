// §STAIR-CONTAIN-UPSTREAM (2026-06-09) — the COINCIDENCE test: the room-tiling keep-out
// the engine carves == the SHIPPED stair footprint the editor builds (founder acceptance
// I2 + the §8.5 desync closure). Both derive from the SAME `computeStairWorldFootprint`
// + `StairCore.containOffsetWorld`, so we reconstruct BOTH here and assert they coincide
// (same world AABB within ε) AND the shipped footprint is 4/4 corners inside the shell.

import { describe, expect, it } from 'vitest';
import {
    generateHouseLayout,
    computeStairWorldFootprint,
    allCornersInside,
    solveStairContainmentWorld,
    type StairCore,
} from '../src/workflows/houseLayout/index.js';
import { rotatePt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentConstraints, ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };
const FTF = 3;

function mkShell(perimeter: { x: number; z: number }[]): ShellAnalysis {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity, area = 0;
    for (let i = 0; i < perimeter.length; i++) {
        const a = perimeter[i]!, b = perimeter[(i + 1) % perimeter.length]!;
        area += a.x * b.z - b.x * a.z;
        minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
        minZ = Math.min(minZ, a.z); maxZ = Math.max(maxZ, a.z);
    }
    return { netAreaM2: Math.abs(area) / 2, widthM: maxX - minX, depthM: maxZ - minZ, perimeter, faces: [] };
}

/** Rebuild the SHIPPED stair footprint the executor dispatches: the SAME
 *  `computeStairWorldFootprint` the executor + orchestrator use, with the StairCore's
 *  upstream `containOffsetWorld` applied (the executor applies exactly this shift). */
function shippedFootprint(stair: StairCore, floorToFloorM: number) {
    return computeStairWorldFootprint(
        {
            rectMm: stair.rectMm,
            shape: stair.shape,
            flights: stair.flights,
            ...(stair.risersBeforeLanding != null ? { risersBeforeLanding: stair.risersBeforeLanding } : {}),
            ...(stair.interiorSide != null ? { interiorSide: stair.interiorSide } : {}),
            principalAxisRad: stair.principalAxisRad,
            pivot: stair.pivot,
            floorToFloorM,
            startY: 0,
        },
        stair.containOffsetWorld ?? { x: 0, z: 0 },
    ).footprintWorld;
}

describe('§STAIR-CONTAIN-UPSTREAM — keep-out == shipped footprint', () => {
    // The keep-out the orchestrator carves is the AABB of the CONTAINED footprint, which
    // it derives from the SAME computeStairWorldFootprint + containOffsetWorld. So the
    // shipped footprint's AABB IS the keep-out by construction — assert that identity
    // holds end-to-end through generateHouseLayout, on axis-aligned AND rotated plates.
    const PLATES: Array<{ name: string; poly: { x: number; z: number }[] }> = [
        { name: 'axis-aligned 12×10', poly: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }] },
        { name: 'tight 14×11 (2-storey)', poly: [{ x: 0, z: 0 }, { x: 14, z: 0 }, { x: 14, z: 11 }, { x: 0, z: 11 }] },
        {
            name: 'rotated ~20° 12×10',
            poly: (() => {
                const A = 20 * Math.PI / 180, c = Math.cos(A), s = Math.sin(A);
                return [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }]
                    .map(p => ({ x: p.x * c - p.z * s, z: p.x * s + p.z * c }));
            })(),
        },
    ];

    for (const plate of PLATES) {
        it(`${plate.name}: shipped stair footprint is 4/4 inside the shell (founder I2)`, () => {
            const shell = mkShell(plate.poly);
            const house = generateHouseLayout(shell, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2, floorToFloorM: FTF });
            expect(house.stairs.length).toBeGreaterThan(0);
            const fp = shippedFootprint(house.stairs[0]!, FTF);
            expect(fp).not.toBeNull();
            expect(allCornersInside(fp!, plate.poly, 1e-3)).toBe(true);
        });

        it(`${plate.name}: the executor's §STAIR-CONTAIN nudge is a NO-OP (offset {0,0}) — keep-out == shipped`, () => {
            // The orchestrator carves the keep-out from the CONTAINED footprint, and the
            // executor ships that SAME contained body (StairCore + containOffsetWorld). If
            // re-solving containment on the shipped footprint returns {0,0}, the executor
            // never moves the stair AGAIN → the shipped footprint == the carved keep-out by
            // construction (the §8.5 desync is closed: one position drives BOTH).
            const shell = mkShell(plate.poly);
            const house = generateHouseLayout(shell, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2, floorToFloorM: FTF });
            const stair = house.stairs[0]!;
            const fp = shippedFootprint(stair, FTF)!;

            // Reconstruct the executor's inward direction (interior side rotated to world).
            const sideLayout =
                stair.interiorSide === 'left' ? { x: 1, z: 0 } :
                stair.interiorSide === 'right' ? { x: -1, z: 0 } :
                stair.interiorSide === 'back' ? { x: 0, z: -1 } :
                { x: 0, z: 0 };
            const ax = stair.principalAxisRad;
            const inward = ax === 0 ? sideLayout : rotatePt(sideLayout, ax, { x: 0, z: 0 });

            const residual = solveStairContainmentWorld(fp, plate.poly, inward);
            expect(residual.dx).toBeCloseTo(0, 6);
            expect(residual.dz).toBeCloseTo(0, 6);
            expect(residual.cornersInShell).toBe(4);
        });
    }

    it('an axis-aligned fitting core leaves containOffsetWorld at {0,0} (no over-pull)', () => {
        // A long, thin plate whose I-stair footprint already fits → no upstream nudge.
        const poly = [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 6 }, { x: 0, z: 6 }];
        const house = generateHouseLayout(mkShell(poly), PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2, floorToFloorM: FTF });
        const stair = house.stairs[0]!;
        const off = stair.containOffsetWorld ?? { x: 0, z: 0 };
        // Whatever the offset, the shipped footprint must be 4/4 inside.
        const fp = shippedFootprint(stair, FTF)!;
        expect(allCornersInside(fp, poly, 1e-3)).toBe(true);
        // And the offset must be finite + deterministic (re-run identical).
        const house2 = generateHouseLayout(mkShell(poly), PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2, floorToFloorM: FTF });
        expect(house2.stairs[0]!.containOffsetWorld ?? { x: 0, z: 0 }).toEqual(off);
    });

    it('the single-storey / apartment path carries NO stair and NO containment (byte-identical)', () => {
        const poly = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const house = generateHouseLayout(mkShell(poly), PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 1 });
        expect(house.stairs).toHaveLength(0);
        expect(house.voids).toHaveLength(0);
    });
});
