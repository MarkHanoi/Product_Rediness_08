// @vitest-environment happy-dom
//
// HOUSE-LAYOUT INVARIANTS — the founder's "one invariant to enforce in CI"
// (Stage 5, 2026-06-09). A 2-storey house generated on a ~45°-ROTATED rectangular
// plate must satisfy three architectural invariants that a topology-quality-0
// layout violates (the founder's console audit caught central stairs, merged-name
// rooms, and silently-dropped rooms on rotated plates):
//
//   I1 / stair   — the stair core is a CORNER (left | right | back), NEVER central.
//                  Read off `StairCore.interiorSide` (the §DIAG-STAIR winner kind).
//   I3 / naming  — no engine-named room contains '/' (the merged-name signature),
//                  and the room count is ≥ the programmed count (no merge collapse).
//   I4 / count   — every storey's room count ≥ the programmed room count for that
//                  storey (no silent drops; mirrors `allocateProgramToStoreys`).
//
// happy-dom: the house orchestrator transitively imports modules that touch
// `window` via the room-detection seam (matches skewedPlateGeometry.test.ts).
//
// STATUS (2026-06-09): I1, I3, I4 all PASS today on a 45° plate (verified by probe).
// The §TOPO-HARD-REJECT gate (Fix A) and the upstream stair-containment work
// (§STAIR-CONTAIN-UPSTREAM) are what make these hold. No part is `.skip`-ed —
// every assertion below reflects current engine behaviour.

import { describe, expect, it } from 'vitest';
import { generateHouseLayout, allocateProgramToStoreys } from '../src/workflows/houseLayout/index.js';
import { rotatePt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import { polygonAreaM2 } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentProgram, ApartmentConstraints, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

type Pt = { x: number; z: number };

const PROGRAM: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = {
    minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '',
};
const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

/** Rotate an axis-aligned rectangle about its centroid → a genuinely rotated shell
 *  (world metres). Mirrors `rotatedRect` in skewedPlateGeometry.test.ts. */
function rotatedRect(wM: number, hM: number, deg: number): Pt[] {
    const rect: Pt[] = [{ x: 0, z: 0 }, { x: wM, z: 0 }, { x: wM, z: hM }, { x: 0, z: hM }];
    const c = { x: wM / 2, z: hM / 2 };
    return rect.map(p => rotatePt(p, (deg * Math.PI) / 180, c));
}

function mkShell(poly: Pt[]): ShellAnalysis {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    return { netAreaM2: polygonAreaM2(poly), widthM: x1 - x0, depthM: z1 - z0, perimeter: poly, faces: [] };
}

/** A conservative LOWER BOUND on the rooms a storey's program must mint — derived
 *  from the same `allocateProgramToStoreys` the engine uses. Counts only the rooms
 *  that are unconditionally minted (bedrooms + bathrooms + ensuite + living +
 *  kitchen); deliberately OMITS the corridor (conditional) and dining (may merge
 *  with the kitchen under open-plan) so the assertion is a true floor, never an
 *  over-count. The invariant is "no SILENT drop" — emitted ≥ this floor. */
function programmedRoomFloor(p: ApartmentProgram): number {
    return (
        p.bedrooms +
        p.bathrooms +
        (p.masterEnSuite ? 1 : 0) +
        (p.livingRoom ? 1 : 0) +
        // open-plan or not, §KITCHEN-DISTINCT keeps the kitchen an enclosed room.
        (p.openPlanKitchenDining || p.livingRoom ? 1 : 0)
    );
}

// A 13 × 10 m (130 m²) plate rotated 45° — the worst-case principal-axis rotation.
const SKEW = mkShell(rotatedRect(13, 10, 45));

describe('house-layout invariants on a 45°-rotated plate (founder CI invariant)', () => {
    const res = generateHouseLayout(SKEW, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });

    it('produces a well-formed 2-storey result with one stair', () => {
        expect(res.storeys).toHaveLength(2);
        expect(res.stairs).toHaveLength(1);
        expect(res.perStoreyLayout).toHaveLength(2);
    });

    // ── I1 / stair — corner, never central ──────────────────────────────────────
    it('I1: the stair core is a CORNER (left|right|back), never central', () => {
        const stair = res.stairs[0]!;
        expect(stair.interiorSide).toBeDefined();
        expect(['left', 'right', 'back']).toContain(stair.interiorSide);
        expect(stair.interiorSide).not.toBe('central');
    });

    // ── I3 / naming — no merged compound name + room count not collapsed ──────────
    it('I3: no engine-named room contains "/" (the merged-name signature)', () => {
        let checkedRooms = 0;
        for (const layout of res.perStoreyLayout) {
            if (!layout) continue;
            for (const room of layout.rooms) {
                checkedRooms++;
                expect(
                    (room.name ?? '').includes('/'),
                    `room "${room.name}" carries a compound merged name`,
                ).toBe(false);
            }
        }
        // Guard against a vacuous pass.
        expect(checkedRooms).toBeGreaterThan(0);
    });

    // ── I4 / count — every storey ≥ its programmed room floor (no silent drops) ───
    it('I4: every storey room count ≥ its programmed room floor', () => {
        const storeyPrograms = allocateProgramToStoreys(PROGRAM, 2);
        expect(res.perStoreyLayout).toHaveLength(storeyPrograms.length);
        for (let i = 0; i < storeyPrograms.length; i++) {
            const layout = res.perStoreyLayout[i]!;
            const floor = programmedRoomFloor(storeyPrograms[i]!.program);
            expect(
                layout.rooms.length,
                `storey ${i} emitted ${layout.rooms.length} rooms < programmed floor ${floor}`,
            ).toBeGreaterThanOrEqual(floor);
        }
    });

    // ── determinism (no RNG) ──────────────────────────────────────────────────────
    it('is deterministic (same rotated input → identical result)', () => {
        const a = generateHouseLayout(SKEW, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        const b = generateHouseLayout(SKEW, PROGRAM, CONSTRAINTS, WEIGHTS, { storeyCount: 2 });
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});
