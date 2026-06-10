// @vitest-environment happy-dom
//
// §STAIR-ROOM-TYPE single-mint invariant (founder duplicate-Stair bug, 2026-06-10).
//
// The engine HALF of the founder fix. The editor's room-naming pipeline duplicated
// "Stair" / mis-typed a habitable room / left a "Room 00-00x" fallback. The
// editor-side cure is §ROOM-NAME-BIJECTIVE (matchDetectedRooms). This test locks
// the ENGINE precondition the editor relies on: a house storey with ONE stair
// keep-out emits EXACTLY ONE `stair`-typed room, sized like a stair core (non-
// habitable area), with NO habitable room overlapping its footprint. If the engine
// ever minted two stair rooms — or let a habitable room tile into the stair zone —
// the editor matcher could not stay 1:1.

import { describe, expect, it } from 'vitest';
import { generateDeterministicLayouts } from '../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import type { ApartmentProgram, ApartmentConstraints, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import { polygonAreaM2 } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import { validateHouseStorey } from '../src/workflows/houseLayout/houseEnvelope.js';
import { enrichStoreyProgramToPlate } from '../src/workflows/houseLayout/houseProgramFloor.js';

interface Pt { x: number; z: number }

const CONSTRAINTS: ApartmentConstraints = {
    minCorridorWidth: 1200, wallThickness: 100, floorToCeiling: 2700, wallTypeId: 'partition',
};
const WEIGHTS: ScoringWeights = {
    daylight: 1, circulation: 1, privacy: 1, area: 1, adjacency: 1,
} as unknown as ScoringWeights;

const PROGRAM: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

function shellFrom(perimeter: Pt[]): ShellAnalysis {
    const xs = perimeter.map(p => p.x), zs = perimeter.map(p => p.z);
    return {
        netAreaM2: polygonAreaM2(perimeter),
        widthM: Math.max(...xs) - Math.min(...xs),
        depthM: Math.max(...zs) - Math.min(...zs),
        perimeter,
        faces: [],
    } as unknown as ShellAnalysis;
}

/** AABB of an emitted (mm) room polygon, converted to metres. */
function bboxM(poly: ReadonlyArray<{ x: number; y: number }>): { x0: number; z0: number; x1: number; z1: number } {
    const xs = poly.map(p => p.x / 1000), zs = poly.map(p => p.y / 1000);
    return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
}

/** Axis-aligned interior overlap area (m²) of two metre-frame AABBs. Both inputs
 *  are in the SAME (engine emit) frame, so no world↔engine mapping is needed. */
function overlapAreaM2(
    a: { x0: number; z0: number; x1: number; z1: number },
    b: { x0: number; z0: number; x1: number; z1: number },
): number {
    const ox0 = Math.max(a.x0, b.x0), oz0 = Math.max(a.z0, b.z0);
    const ox1 = Math.min(a.x1, b.x1), oz1 = Math.min(a.z1, b.z1);
    if (ox1 <= ox0 || oz1 <= oz0) return 0;
    return (ox1 - ox0) * (oz1 - oz0);
}

describe('§STAIR-ROOM-TYPE — one keep-out mints EXACTLY one stair room (no habitable overlap)', () => {
    it('axis-aligned 2-storey house plate: a single stair-typed room, non-habitable, no habitable overlap', () => {
        // A clean axis-aligned house plate so the assertion is about the MINT, not
        // skewed-plate carve fractures (those are covered by stairFractureSeam.test.ts).
        const perimeter: Pt[] = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 14 }, { x: 0, z: 14 }]; // 280 m²
        const shell = shellFrom(perimeter);

        // One world-frame stair keep-out (≈ 4.0 × 3.0 m), placed off-centre — the
        // SAME shape the houseOrchestrator passes as `keepOutRectsWorld`.
        const keepOut = [{ x0: 8, z0: 4, x1: 12, z1: 7 }];
        const coreArea = (keepOut[0]!.x1 - keepOut[0]!.x0) * (keepOut[0]!.z1 - keepOut[0]!.z0);
        const usableAreaM2 = Math.max(1, shell.netAreaM2 - coreArea);

        const storeyProgram = enrichStoreyProgramToPlate(PROGRAM, usableAreaM2, 'ground', { growBedrooms: false });
        const storeyShell: ShellAnalysis = { ...shell, netAreaM2: usableAreaM2 };

        const opts = generateDeterministicLayouts(
            storeyShell, storeyProgram, CONSTRAINTS, WEIGHTS, 4,
            undefined, undefined, undefined, validateHouseStorey, keepOut,
        );
        expect(opts.length).toBeGreaterThan(0);
        const best = opts[0]!;

        // (1) EXACTLY ONE stair-typed room.
        const stairRooms = best.rooms.filter(r => r.type === 'stair');
        // eslint-disable-next-line no-console
        console.log(`[stair-mint] rooms=${best.rooms.length} stairRooms=${stairRooms.length} names=[${best.rooms.map(r => r.name).join(', ')}]`);
        expect(stairRooms).toHaveLength(1);

        // (2) Named "Stair" (single keep-out ⇒ no "Stair 1"/"Stair 2" suffix) and
        //     NON-HABITABLE (occupancy 'stair', circulation — not a bedroom-like area).
        const stair = stairRooms[0]!;
        expect(stair.name).toBe('Stair');
        expect(stair.occupancy).toBe('stair');
        // Stair-core-sized — NOT a 25 m² habitable area (the founder's mis-typed room).
        expect(stair.area).toBeLessThan(coreArea + 1);

        // (3) NO habitable room overlaps the stair footprint. Compare every other
        //     room's emitted polygon against the STAIR's own emitted polygon — both
        //     in the engine emit frame, so no world↔engine mapping is needed. The
        //     keep-out was SUBTRACTED before tiling, so a habitable room may only
        //     TOUCH the stair along a shared wall (zero interior overlap).
        expect(stair.polygon && stair.polygon.length >= 3).toBe(true);
        const stairBox = bboxM(stair.polygon!);
        const EPS_AREA = 0.1; // m² — touching-along-a-wall is fine; interior overlap is not
        for (const r of best.rooms) {
            if (r === stair) continue;
            if (!r.polygon || r.polygon.length < 3) continue;
            const overlap = overlapAreaM2(bboxM(r.polygon), stairBox);
            expect(overlap, `room "${r.name}" overlaps Stair by ${overlap.toFixed(2)} m²`).toBeLessThan(EPS_AREA);
        }

        // (4) Determinism (ADR-0061) — re-run yields the same stair room.
        const opts2 = generateDeterministicLayouts(
            storeyShell, storeyProgram, CONSTRAINTS, WEIGHTS, 4,
            undefined, undefined, undefined, validateHouseStorey, keepOut,
        );
        const stair2 = opts2[0]!.rooms.filter(r => r.type === 'stair');
        expect(stair2).toHaveLength(1);
        expect(stair2[0]!.name).toBe('Stair');
    });

    it('BYTE-IDENTICAL apartment (no keep-out): NO stair room is ever minted', () => {
        const apt: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 0, z: 9 }]; // 108 m²
        const shell = shellFrom(apt);
        const prog: ApartmentProgram = { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: true };
        const opts = generateDeterministicLayouts(shell, prog, CONSTRAINTS, WEIGHTS, 4);
        expect(opts.length).toBeGreaterThan(0);
        for (const o of opts) expect(o.rooms.filter(r => r.type === 'stair')).toHaveLength(0);
    });
});
