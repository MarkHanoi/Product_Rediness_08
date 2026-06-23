// §RESI-FRAME (Task B) — coordinate-frame correctness for the multi-family
// residential orchestrator.
//
// THE RISK (flagged by the P3.3 author): the per-apartment D-TGL engine might emit
// walls in CELL-LOCAL coordinates (origin 0,0) instead of the building WORLD frame —
// which would collapse every apartment onto the plate origin and overlap them.
//
// THE TRUTH (verified by this test): `runApartmentCellLayout` builds the engine shell
// from `shellFromCell(cell)`, whose `perimeter` is the cell corners in WORLD metres
// ({x: cell.x0, z: cell.z0} …). `generateDeterministicLayouts` emits walls in mm by
// `m * 1000` over that world-coord graph, so every wall endpoint is in the cell's
// WORLD-mm frame. This test LOCKS THAT IN: on a founder-sized ~38×43 m plate it asserts
// EVERY emitted apartment wall endpoint lies WITHIN that apartment's own cell bounds
// (with a small tolerance) — not at the origin, not outside the cell.
//
// This file lives under `packages/ai-host/__tests__/` so the package's default vitest
// `include: ['__tests__/**/*.test.ts']` (NO leading `**/`) discovers it — the
// co-located `src/workflows/residentialBuilding/__tests__/` dir is NOT matched by that
// glob, so a frame test placed there would silently not run.

import { describe, it, expect } from 'vitest';
import {
    orchestrateResidentialBuilding,
    type ResidentialBuildingOrchestratorInput,
} from '../src/workflows/residentialBuilding/residentialBuildingOrchestrator.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

/** Founder-sized site plate (~38 × 43 m), CCW ring starting at (0,0). */
function plate(w: number, d: number): Pt[] {
    return [
        { x: 0, z: 0 },
        { x: w, z: 0 },
        { x: w, z: d },
        { x: 0, z: d },
    ];
}

const MM_TO_M = 1e-3;
/** Wall endpoints land on the cell perimeter and on interior partitions; allow a
 *  generous 0.25 m slack for the ×1000 mm round-trip + wall-thickness inset. */
const TOL_M = 0.25;

function baseInput(over: Partial<ResidentialBuildingOrchestratorInput> = {}): ResidentialBuildingOrchestratorInput {
    return {
        footprint: plate(38, 43),
        upperLevels: 2,
        coreWidthM: 6,
        coreDepthM: 4,
        corridorWidthM: 1.5,
        minApartmentAreaM2: 60,
        maxApartmentAreaM2: 100,
        typologies: { T1: false, T2: true, T3: true, T4: false },
        ...over,
    };
}

describe('§RESI-FRAME — apartment walls are emitted in the building WORLD frame', () => {
    it('every laid-out apartment wall endpoint lies within its OWN cell bounds (not at origin, not outside)', () => {
        const r = orchestrateResidentialBuilding(baseInput());
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;

        let checkedWalls = 0;
        let laidOutApartments = 0;

        for (const lvl of r.perLevelApartments) {
            if (lvl.role !== 'upper') continue;
            for (const apt of lvl.apartments) {
                if (apt.status !== 'ok' || !apt.layout) continue;
                laidOutApartments++;
                const cell = apt.cell.rect;
                // The cell must itself be off the origin for at least some apartments
                // (a centred core on a 38×43 plate pushes cells away from (0,0)).
                expect(cell.x1).toBeGreaterThan(cell.x0);
                expect(cell.z1).toBeGreaterThan(cell.z0);

                for (const w of apt.layout.walls) {
                    for (const end of [w.start, w.end]) {
                        const xM = end.x * MM_TO_M;
                        const zM = end.y * MM_TO_M;
                        // The endpoint must lie within the cell rect (± TOL). If the
                        // engine emitted CELL-LOCAL coords, a wall on a cell whose
                        // x0 > 0 would land near 0 → OUTSIDE [cell.x0-TOL, cell.x1+TOL].
                        expect(xM).toBeGreaterThanOrEqual(cell.x0 - TOL_M);
                        expect(xM).toBeLessThanOrEqual(cell.x1 + TOL_M);
                        expect(zM).toBeGreaterThanOrEqual(cell.z0 - TOL_M);
                        expect(zM).toBeLessThanOrEqual(cell.z1 + TOL_M);
                        checkedWalls++;
                    }
                }
            }
        }

        // The test is only meaningful if at least one apartment actually laid out
        // AND at least one cell sits off the origin (so cell-local vs world differ).
        expect(laidOutApartments).toBeGreaterThanOrEqual(1);
        expect(checkedWalls).toBeGreaterThan(0);
    });

    it('at least one laid-out apartment cell is OFFSET from the plate origin (so the frame test is discriminating)', () => {
        const r = orchestrateResidentialBuilding(baseInput());
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;

        // Find a laid-out apartment whose cell starts well away from x=0; its walls'
        // min X endpoint must be near the cell's OWN x0, NOT near 0 (which is what a
        // cell-local frame would produce). The X assertion below only discriminates on
        // a cell that is genuinely X-OFFSET, so we require `cell.x0 >= 2` (a cell offset
        // only in Z legitimately has x0 ≈ 0 — the corridor band spans the full X and the
        // packer fills X-runs from x=0, so the centred core's right-hand run yields the
        // X-offset cells this assertion needs).
        let assertedOffset = false;
        for (const lvl of r.perLevelApartments) {
            if (lvl.role !== 'upper') continue;
            for (const apt of lvl.apartments) {
                if (apt.status !== 'ok' || !apt.layout) continue;
                const cell = apt.cell.rect;
                if (cell.x0 < 2) continue; // need an X-offset cell for the X assertion
                // The smallest wall x among this cell's walls should be ≈ cell.x0,
                // not ≈ 0 (which is what a cell-local frame would produce).
                let minWallXm = Infinity;
                for (const w of apt.layout.walls) {
                    minWallXm = Math.min(minWallXm, w.start.x * MM_TO_M, w.end.x * MM_TO_M);
                }
                expect(minWallXm).toBeGreaterThanOrEqual(cell.x0 - TOL_M);
                // And NOT collapsed to the plate origin.
                expect(minWallXm).toBeGreaterThan(2 - TOL_M);
                assertedOffset = true;
                break;
            }
            if (assertedOffset) break;
        }
        // If no offset cell laid out, the building still mustn't be empty — but the
        // discriminating assertion needs at least one. On the 38×43 plate the centred
        // core guarantees offset cells, so this should always run.
        expect(assertedOffset).toBe(true);
    });
});
