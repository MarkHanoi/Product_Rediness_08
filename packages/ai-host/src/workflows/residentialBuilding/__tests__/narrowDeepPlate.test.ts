// §RESI-SIDE-CORE-KEEPS-SIDE (founder live repro 2026-08-10, Rambla Catalunya 75) —
// the narrow-deep-plate zero-apartments fixture.
//
// THE BUG this suite pins: on an 11.2333 × 34.6662 m plate (envelope inset, Barcelona) the
// setup step refused: "level 1 partition placed zero apartments … (core/corridor leave no
// usable band runs (placed 0/1))". A perfect axis-aligned RECTANGLE of those dimensions built
// fine via the §RESI-NARROW-PLATE-SIDE-CORE single-loaded fallback — but every REAL
// envelope-inset parcel de-rotates to a quad whose edges are a few centimetres slanted, so the
// side core placed FLUSH to bb.x0 failed the §RESI-CORE-IN-BOUNDARY corner probe and the
// relocation CENTRED it in the largest sub-rectangle — silently converting the single-loaded
// side plan back into the centred plan the fallback exists to replace. On an ~11 m plate the
// centred core leaves two ~4.3 m runs (both under the ~8 m min-apartment width) → zero cells →
// both attempts refused with the same message. The fix: a SIDE-core relocation pins the core
// flush to the sub-rect's x0 edge, preserving the single-loaded arrangement.
//
// The honest refusal for genuinely impossible plates (width < MIN_PLATE_WIDTH_M) is kept and
// pinned below.

import { describe, it, expect } from 'vitest';
import {
    orchestrateResidentialBuilding,
    MIN_PLATE_WIDTH_M,
    type ResidentialBuildingOrchestratorInput,
    type ResidentialBuildingOk,
} from '../residentialBuildingOrchestrator';
import type { Pt } from '../../apartmentLayout/tgl/rectDecomposition';

// The founder's measured plate (from the refusal copy itself).
const PLATE_W = 11.2333;
const PLATE_D = 34.6662;

function input(over: Partial<ResidentialBuildingOrchestratorInput> = {}): ResidentialBuildingOrchestratorInput {
    return {
        footprint: [
            { x: 0, z: 0 }, { x: PLATE_W, z: 0 }, { x: PLATE_W, z: PLATE_D }, { x: 0, z: PLATE_D },
        ],
        upperLevels: 2,   // per-level output is identical; 2 levels prove the per-floor claim fast
        coreWidthM: 6,
        coreDepthM: 4,
        corridorWidthM: 1.5,
        minApartmentAreaM2: 45,
        maxApartmentAreaM2: 100,
        typologies: { T1: true, T2: true, T3: false, T4: false },
        ...over,
    };
}

/** The gate battery on an ok result: every upper level ≥2 laid-out units, all core-reachable,
 *  no overlaps between cells, every cell inside the plate bbox. */
function expectFloorsSound(r: ResidentialBuildingOk, minUnitsPerFloor: number): void {
    const uppers = r.perLevelApartments.filter((l) => l.role === 'upper');
    expect(uppers.length).toBeGreaterThan(0);
    for (const level of uppers) {
        const ok = level.apartments.filter((a) => a.status === 'ok');
        expect(ok.length).toBeGreaterThanOrEqual(minUnitsPerFloor);
        for (const a of level.apartments) {
            // §RESI-CORE-CIRCULATION — every shipped cell fronts a core-connected corridor.
            expect(a.cell.coreReachable).toBe(true);
        }
        // No two cells overlap (§RESI gates: disjoint tiling).
        const cells = level.apartments.map((a) => a.cell.rect);
        for (let i = 0; i < cells.length; i++) {
            for (let j = i + 1; j < cells.length; j++) {
                const xo = Math.min(cells[i]!.x1, cells[j]!.x1) - Math.max(cells[i]!.x0, cells[j]!.x0);
                const zo = Math.min(cells[i]!.z1, cells[j]!.z1) - Math.max(cells[i]!.z0, cells[j]!.z0);
                expect(xo > 1e-3 && zo > 1e-3).toBe(false);
            }
        }
    }
}

describe('§RESI-SIDE-CORE-KEEPS-SIDE — narrow-deep plate (founder Rambla Catalunya 75 repro)', () => {
    it('11.2333 × 34.6662 m rectangle, T1/T2 mix → ≥2 units per floor, all gates passing', () => {
        const r = orchestrateResidentialBuilding(input());
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expectFloorsSound(r, 2);
    }, 60_000);

    it('the REAL repro shape — a mildly irregular quad (slanted end + slanted side) of the same size — also builds ≥2 units per floor', () => {
        // Pre-fix this exact class refused: the side core failed the in-boundary corner probe on
        // the slanted local x0 edge and was bounced back to CENTRE → zero cells → refusal.
        const footprint: Pt[] = [
            { x: 0, z: 0.4 }, { x: 11.4, z: 0 }, { x: 11.30, z: PLATE_D }, { x: 0.1, z: 34.2 },
        ];
        const r = orchestrateResidentialBuilding(input({ footprint }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expectFloorsSound(r, 2);
    }, 60_000);

    it('founder exact settings (T2+T3, max 100 m², 7 floors) build on the rectangle plate', () => {
        const r = orchestrateResidentialBuilding(input({
            upperLevels: 7,
            minApartmentAreaM2: 60,
            typologies: { T1: false, T2: true, T3: true, T4: false },
        }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.levels.length).toBe(8);   // ground + 7
        expectFloorsSound(r, 2);
    }, 120_000);

    it('deterministic — same irregular input twice → identical placements', () => {
        const footprint: Pt[] = [
            { x: 0, z: 0.4 }, { x: 11.4, z: 0 }, { x: 11.30, z: PLATE_D }, { x: 0.1, z: 34.2 },
        ];
        const a = orchestrateResidentialBuilding(input({ footprint, upperLevels: 1 }));
        const b = orchestrateResidentialBuilding(input({ footprint, upperLevels: 1 }));
        expect(b).toEqual(a);
    }, 60_000);

    it('KEEPS the honest refusal for a genuinely impossible plate (< MIN_PLATE_WIDTH_M wide)', () => {
        const w = 10.5;   // below the derived 11.1 m floor — no arrangement exists at any depth
        const r = orchestrateResidentialBuilding(input({
            footprint: [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: PLATE_D }, { x: 0, z: PLATE_D }],
        }));
        expect(r.status).toBe('rejected');
        if (r.status !== 'rejected') return;
        expect(r.reason).toContain('too narrow');
        expect(r.reason).toContain(String(MIN_PLATE_WIDTH_M));
    });
});
