// §RESI-SINGLE-CORE-LANDING (ADR-0372, lane SMALLPLATE68, L-11190..L-11199) — the small-plate
// typology the corridor partitioner does not know.
//
// THE FOUNDER'S REFUSAL, verbatim (production, 2026-08-25):
//   [resi-building] controller: rejected — level 1 partition placed zero apartments on a
//   13.1753 m × 16.0623 m plate (core/corridor leave no usable band runs (placed 0/6))
//
// He drew the plate of the building in his reference photograph — a Barcelona corner block: ONE
// compact stair/lift core, 1–2 apartments per floor opening straight off the landing, NO corridor.
// The residential generator knew only the corridor typology (core + corridor + band runs) and on
// that plate measured its own runs at 8.5 m against an 8.55 m minimum. MEASURED before this lane
// (`orchestrateResidentialBuilding`, defaults 60–100 m², T2+T3):
//   • the perfect 13.1753 × 16.0623 rectangle did NOT refuse — it "built" ONE 187 m² unit: the
//     whole floor absorbed as a single residual around a side core (fill 0.94, corridor 12 m²);
//   • the same rectangle ROTATED 27°, and a hand-drawn quad of the same size, REFUSED with
//     `core is not contained in the footprint` (L-11191: round4 core vs unrounded bbox, 1e-6 EPS).
// Neither is the building he photographed. These tests pin the typology that is.

import { describe, it, expect } from 'vitest';
import {
    orchestrateResidentialBuilding,
    computeGroundFloor,
    type ResidentialBuildingOrchestratorInput,
    type ResidentialBuildingOk,
} from '../residentialBuildingOrchestrator';
import { partitionSingleCoreLanding } from '../singleCoreLanding';
import { partitionLevelPlate, ENGINE_MIN_ROW_DEPTH_M, MAX_RECT_ASPECT } from '../platePartition';
import { deriveCoreSizing, APPROACH_CLEAR_M } from '../coreSizing';
import type { Pt, Rect } from '../../apartmentLayout/tgl/rectDecomposition';

// The founder's measured plate (from the refusal copy itself).
const W = 13.1753;
const D = 16.0623;

const rect = (w: number, d: number): Pt[] => [
    { x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d },
];
const rotated = (pts: readonly Pt[], deg: number, ox = 100, oz = 50): Pt[] => {
    const t = (deg * Math.PI) / 180;
    return pts.map((p) => ({ x: ox + p.x * Math.cos(t) - p.z * Math.sin(t), z: oz + p.x * Math.sin(t) + p.z * Math.cos(t) }));
};
/** A hand-drawn quad ≈ W × D whose corners do NOT land on the bbox (the real boundary-line shape). */
const irregular = (): Pt[] => [{ x: 0, z: 0.3 }, { x: W - 0.1, z: 0 }, { x: W, z: D - 0.2 }, { x: 0.15, z: D }];

/** The founder's live defaults from the onboarding brief (`residentialRequestFromBrief`): 60–100 m²,
 *  T2 + T3; the modal's 6 × 4 core + 1.5 m corridor. */
function input(over: Partial<ResidentialBuildingOrchestratorInput> = {}): ResidentialBuildingOrchestratorInput {
    return {
        footprint: rect(W, D),
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

const overlaps = (a: Rect, b: Rect): boolean =>
    Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-3 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-3;
const touches = (a: Rect, b: Rect): boolean => {
    const xo = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const zo = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    return (Math.abs(xo) <= 0.05 && zo >= 0.8) || (Math.abs(zo) <= 0.05 && xo >= 0.8);
};
const area = (r: Rect): number => (r.x1 - r.x0) * (r.z1 - r.z0);

/** The landing typology's gate battery on an OK result. */
function expectSingleCoreLandingFloors(r: ResidentialBuildingOk, minUnitsPerFloor: number): void {
    expect(r.circulationTypology).toBe('single-core-landing');
    const uppers = r.perLevelApartments.filter((l) => l.role === 'upper');
    expect(uppers.length).toBeGreaterThan(0);
    // The plate the cells tile (LOCAL frame): the union bbox of core + circulation + cells.
    for (const level of uppers) {
        const laidOut = level.apartments.filter((a) => a.status === 'ok');
        expect(laidOut.length).toBeGreaterThanOrEqual(minUnitsPerFloor);
        expect(level.apartments.length).toBeLessThanOrEqual(2);              // N ∈ {1, 2}
        // NO corridor: exactly one circulation rect — the landing — hugging the core's lobby face,
        // never a band across the plate.
        expect(level.publicCorridor.length).toBe(1);
        const landing = level.publicCorridor[0]!;
        expect(touches(landing, r.core)).toBe(true);
        expect(Math.abs(landing.z1 - r.core.z0)).toBeLessThanOrEqual(1e-3);   // in front of the lobby face
        expect(landing.x1 - landing.x0).toBeLessThanOrEqual(r.core.x1 - r.core.x0 + 1e-3);   // core-wide, not plate-wide
        expect(landing.z1 - landing.z0).toBeGreaterThanOrEqual(APPROACH_CLEAR_M - 1e-6);      // a door can swing
        expect(level.corridorAreaM2).toBeLessThan(area(r.core));               // less circulation than core
        const allRects: Rect[] = [r.core, landing, ...level.apartments.map((a) => a.cell.rect)];
        let bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
        for (const q of allRects) { bx0 = Math.min(bx0, q.x0); bz0 = Math.min(bz0, q.z0); bx1 = Math.max(bx1, q.x1); bz1 = Math.max(bz1, q.z1); }
        // The core sits in a REAR corner of the plate (flush to z1 and to x0 or x1).
        expect(Math.abs(r.core.z1 - bz1)).toBeLessThanOrEqual(1e-3);
        expect(Math.min(Math.abs(r.core.x0 - bx0), Math.abs(r.core.x1 - bx1))).toBeLessThanOrEqual(1e-3);
        for (const apt of level.apartments) {
            // Every door opens off the landing (core-reachable through the one circulation rect).
            expect(apt.cell.coreReachable).toBe(true);
            expect(apt.cell.coreDoorOffset).toBeDefined();
            expect(touches(apt.cell.rect, landing)).toBe(true);
            // Every apartment reaches a façade (the daylight rule outranks everything).
            expect(apt.facadeEdges.length).toBeGreaterThanOrEqual(1);
            // Engine-feasible by the corridor partitioner's OWN numbers.
            const w = apt.cell.rect.x1 - apt.cell.rect.x0, d = apt.cell.rect.z1 - apt.cell.rect.z0;
            expect(Math.min(w, d)).toBeGreaterThanOrEqual(ENGINE_MIN_ROW_DEPTH_M - 1e-6);
            expect(Math.max(w, d) / Math.min(w, d)).toBeLessThanOrEqual(MAX_RECT_ASPECT + 1e-6);
            // Never over the core or the landing.
            expect(overlaps(apt.cell.rect, r.core)).toBe(false);
            expect(overlaps(apt.cell.rect, landing)).toBe(false);
        }
        // Disjoint cells.
        for (let i = 0; i < level.apartments.length; i++) {
            for (let j = i + 1; j < level.apartments.length; j++) {
                expect(overlaps(level.apartments[i]!.cell.rect, level.apartments[j]!.cell.rect)).toBe(false);
            }
        }
    }
}

describe('§RESI-SINGLE-CORE-LANDING — the pure partition on the founder plate', () => {
    const core = deriveCoreSizing({ maxFloorToFloorM: 4.5 });
    const cornerCore: Rect = { x0: 0, x1: core.coreWidthM, z0: D - core.coreDepthM, z1: D };
    const demands = [
        { typology: 'T2' as const, minAreaM2: 60, maxAreaM2: 80 },
        { typology: 'T3' as const, minAreaM2: 80, maxAreaM2: 100 },
        { typology: 'T2' as const, minAreaM2: 60, maxAreaM2: 80 },
    ];

    it('13.1753 × 16.0623 m: TWO apartments off a landing, a corner core, no corridor — measured', () => {
        const r = partitionSingleCoreLanding({
            levelIndex: 1, footprint: rect(W, D), core: cornerCore, landingMinDepthM: 1.2,
            apartments: demands, userMinApartmentAreaM2: 60, userMaxApartmentAreaM2: 100,
        });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.strategy).toBe('single-core-landing');
        expect(r.apartmentCells.length).toBe(2);
        expect(r.apartmentsCoreReachable).toBe(2);
        expect(r.publicCorridor.length).toBe(1);
        expect(r.stranded).toBeUndefined();
        // The measured cells: the FRONT full-width cell and the REAR cell beside the core.
        const [front, rear] = r.apartmentCells;
        expect(front!.doorEdge).toBe('z1');
        expect(rear!.doorEdge).toBe('x0');
        expect(front!.rect.x1 - front!.rect.x0).toBeCloseTo(W, 3);
        expect(rear!.rect.x0).toBeCloseTo(core.coreWidthM, 3);
        // Both sit INSIDE the user's [60, 100] band: at the 1.2 m minimum landing the split is
        // ~113 / ~67 m² (front over the max); the scan deepens the landing to 2.2 m so the front cell
        // drops to ~100 m² and the rear grows to ~76 m² — a within-band pair bought with 4.3 m² more
        // landing (the objective ranks "cells over the user's max" above circulation area).
        expect(front!.areaM2).toBeGreaterThanOrEqual(60);
        expect(front!.areaM2).toBeLessThanOrEqual(100 + 1e-6);
        expect(rear!.areaM2).toBeGreaterThanOrEqual(60);
        expect(rear!.areaM2).toBeLessThanOrEqual(100 + 1e-6);
        expect(front!.areaM2 + rear!.areaM2 + r.corridorAreaM2 + area(cornerCore)).toBeCloseTo(W * D, 1);
        // Typology re-stamped by area within the enabled palette: the big front cell is the T3.
        expect(front!.typology).toBe('T3');
        expect(rear!.typology).toBe('T2');
        const landingDepth = r.publicCorridor[0]!.z1 - r.publicCorridor[0]!.z0;
        expect(landingDepth).toBeGreaterThanOrEqual(APPROACH_CLEAR_M - 1e-6);
        expect(landingDepth).toBeLessThanOrEqual(APPROACH_CLEAR_M + 2.0 + 1e-6);   // a landing, never a hall
        expect(landingDepth).toBeCloseTo(2.2, 3);
        expect(r.fillRatio).toBeGreaterThan(0.9);
    });

    it('what this typology closes — the CORRIDOR partitioner on the same plate with the side core it would use: ONE ~184 m² residual cell, not even core-reachable', () => {
        // The orchestrator's side-core geometry for this plate (§RESI-NARROW-PLATE-SIDE-CORE shrinks the
        // core to 4.68 × 2.6 m, the corridor to 0.895 m). The band runs measure 8.5 m against an 8.55 m
        // minimum → zero row cells → the residual-absorption pass mints the WHOLE floor as one cell.
        const r = partitionLevelPlate({
            levelIndex: 1, footprint: rect(W, D), core: { x0: 0, z0: 6.7312, x1: 4.6753, z1: 9.3312 },
            corridor: { widthM: 0.8954 }, apartments: demands, userMinApartmentAreaM2: 60,
        });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.strategy).toBe('corridor');
        // At most two cells — and NOT a clean, core-reachable pair: either a whole-floor residual
        // blob (measured: ONE ~184 m² cell, coreReached 0/1) or cells minted over the core (L-11192).
        expect(r.apartmentCells.length).toBeLessThanOrEqual(2);
        const cleanAndReachable = r.apartmentsCoreReachable === r.apartmentCells.length
            && r.apartmentCells.every((c) => !overlaps(c.rect, r.core));
        expect(cleanAndReachable).toBe(false);
    });

    it('mirrors when the core hugs x1: the rear cell sits on the other side and its door faces the landing', () => {
        const r = partitionSingleCoreLanding({
            levelIndex: 1, footprint: rect(W, D), core: { x0: W - core.coreWidthM, x1: W, z0: D - core.coreDepthM, z1: D },
            landingMinDepthM: 1.2, apartments: demands, userMinApartmentAreaM2: 60, userMaxApartmentAreaM2: 100,
        });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.apartmentCells.length).toBe(2);
        expect(r.apartmentCells[1]!.doorEdge).toBe('x1');
        expect(r.apartmentCells[1]!.rect.x1).toBeCloseTo(W - core.coreWidthM, 3);
    });

    it('refuses with BOTH arrangements measured when no cell is feasible (C74) — a 10 × 12 m plate', () => {
        const r = partitionSingleCoreLanding({
            levelIndex: 1, footprint: rect(10, 12), core: { x0: 0, x1: core.coreWidthM, z0: 12 - core.coreDepthM, z1: 12 },
            landingMinDepthM: 1.2, apartments: demands, userMinApartmentAreaM2: 60, userMaxApartmentAreaM2: 100,
        });
        expect(r.status).toBe('rejected');
        if (r.status !== 'rejected') return;
        expect(r.reason).toContain('front-rear/front');
        expect(r.reason).toContain('side-pocket/side');
        expect(r.reason).toContain(`${ENGINE_MIN_ROW_DEPTH_M} m`);
        expect(r.reason).toContain('placed 0/2');
    });

    it('declines a plate that is not near-rectangular by name (an L belongs to the corridor decomposition)', () => {
        const L: Pt[] = [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 12 }, { x: 14, z: 12 }, { x: 14, z: 30 }, { x: 0, z: 30 }];
        const r = partitionSingleCoreLanding({
            levelIndex: 1, footprint: rect(30, 30), core: { x0: 0, x1: core.coreWidthM, z0: 30 - core.coreDepthM, z1: 30 },
            landingMinDepthM: 1.2, apartments: demands, clipPolygon: L, userMinApartmentAreaM2: 60,
        });
        expect(r.status).toBe('rejected');
        if (r.status !== 'rejected') return;
        expect(r.reason).toContain('near-rectangular');
    });

    it('a plate that refuses the corridor typology outright is not rescued into an absurd unit: 10.5 × 34.67 m stays refused', () => {
        // Pre-lane this plate refused as "< 11.1 m wide" and must keep refusing: the landing typology
        // would only offer a 10.5 × 27 m front cell, past the engine's proven width at that depth.
        const r = partitionSingleCoreLanding({
            levelIndex: 1, footprint: rect(10.5, 34.6662), core: { x0: 0, x1: core.coreWidthM, z0: 34.6662 - core.coreDepthM, z1: 34.6662 },
            landingMinDepthM: 1.2, apartments: demands, userMinApartmentAreaM2: 45, userMaxApartmentAreaM2: 100,
        });
        expect(r.status).toBe('rejected');
        if (r.status !== 'rejected') return;
        expect(r.reason).toContain('exceeds');
    });
});

describe('§RESI-SINGLE-CORE-LANDING — through the orchestrator (the per-cell D-TGL engine runs)', () => {
    it('the founder plate as a perfect rectangle → 2 apartments per floor off a landing (was ONE 187 m² residual blob)', () => {
        const r = orchestrateResidentialBuilding(input());
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expectSingleCoreLandingFloors(r, 2);
        // The compact core — the clearance-derived minimum, not the modal's 6 × 4.
        const core = deriveCoreSizing({ maxFloorToFloorM: 4.5 });
        expect(r.core.x1 - r.core.x0).toBeCloseTo(core.coreWidthM, 3);
        expect(r.core.z1 - r.core.z0).toBeCloseTo(core.coreDepthM, 3);
        // The ground-floor entrance is on the FRONT façade (z0), never on the wall the core is flush to.
        expect(r.groundFloor.entranceEdge).toBe('z0');
        expect(r.groundFloor.lobby.z1).toBeCloseTo(r.core.z0, 3);
    }, 120_000);

    it('the founder plate ROTATED 27° (a real drawn boundary line) → 2 apartments per floor (was REFUSED: core not contained)', () => {
        const r = orchestrateResidentialBuilding(input({ footprint: rotated(rect(W, D), 27) }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expectSingleCoreLandingFloors(r, 2);
        expect(Math.abs(r.transform.thetaRad)).toBeGreaterThan(0.1);
    }, 120_000);

    it('the founder plate as a hand-drawn irregular quad → 2 apartments per floor (was REFUSED)', () => {
        const r = orchestrateResidentialBuilding(input({ footprint: irregular() }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expectSingleCoreLandingFloors(r, 2);
    }, 120_000);

    it('the founder plate TRANSPOSED (16.06 × 13.18) plans in the frame where the long axis is Z — same building', () => {
        const r = orchestrateResidentialBuilding(input({ footprint: rect(D, W) }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        // Either typology may win here by measurement; if it is the landing, the frame turned.
        if (r.circulationTypology === 'single-core-landing') {
            expectSingleCoreLandingFloors(r, 2);
            expect(Math.abs(Math.abs(r.transform.thetaRad) - Math.PI / 2)).toBeLessThan(1e-6);
        } else {
            const l1 = r.perLevelApartments.find((l) => l.role === 'upper')!;
            expect(l1.apartments.length).toBeGreaterThanOrEqual(2);
        }
    }, 120_000);

    it('deterministic — same input twice → identical result', () => {
        const a = orchestrateResidentialBuilding(input({ upperLevels: 1 }));
        const b = orchestrateResidentialBuilding(input({ upperLevels: 1 }));
        expect(b).toEqual(a);
    }, 120_000);

    it('NO REGRESSION — the founder’s other run: a 20 × 25 m plate, 7 floors → 28 apartments on the CORRIDOR typology, byte-identical to the pre-lane measurement', () => {
        // Measured BEFORE this lane on the same tree: 4 cells/floor of 84 m², fill 0.6973, corridor 71.8481 m²,
        // core {8.5,9.345}-{11.5,15.655}. 7 upper floors × 4 = 28 — the founder's "499 m² → 28 apartments".
        const r = orchestrateResidentialBuilding(input({ footprint: rect(20, 25), upperLevels: 7, minApartmentAreaM2: 45, maxApartmentAreaM2: 120 }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.circulationTypology).toBe('corridor');
        const uppers = r.perLevelApartments.filter((l) => l.role === 'upper');
        expect(uppers.length).toBe(7);
        let total = 0;
        for (const l of uppers) {
            expect(l.apartments.length).toBe(4);
            expect(l.apartments.filter((a) => a.status === 'ok').length).toBe(4);
            expect(l.fillRatio).toBeCloseTo(0.6973, 4);
            expect(l.corridorAreaM2).toBeCloseTo(71.8481, 4);
            for (const a of l.apartments) expect(a.cell.areaM2).toBeCloseTo(84, 0);
            // A corridor NETWORK exists (bands + spine) — this IS the corridor typology, not a landing.
            expect(l.publicCorridor.length).toBeGreaterThanOrEqual(2);
            total += l.apartments.length;
        }
        expect(total).toBe(28);
        expect(r.core).toEqual({ x0: 8.5, z0: 9.345, x1: 11.5, z1: 15.655 });
    }, 180_000);

    it('a plate BOTH typologies refuse names both, with numbers (C74): 10 × 12 m', () => {
        const r = orchestrateResidentialBuilding(input({ footprint: rect(10, 12) }));
        expect(r.status).toBe('rejected');
        if (r.status !== 'rejected') return;
        expect(r.reason).toContain('too narrow');                       // the corridor typology's derived floor
        expect(r.reason).toContain('single-core landing');              // the landing typology's measured cells
        expect(r.reason).toContain('placed 0/2');
    }, 60_000);
});

describe('§RESI-SINGLE-CORE-LANDING — computeGroundFloor never puts the entrance on the wall the core is flush to', () => {
    it('rear-corner core → entrance on z0, lobby from the street to the lobby face', () => {
        const bb: Rect = { x0: 0, z0: 0, x1: W, z1: D };
        const core: Rect = { x0: 0, x1: 4.28, z0: D - 6.31, z1: D };
        const g = computeGroundFloor(bb, core, 1.2);
        expect(g.entranceEdge).toBe('z0');
        expect(g.lobby.z0).toBe(0);
        expect(g.lobby.z1).toBeCloseTo(core.z0, 3);
        expect(g.entranceCenter.z).toBe(0);
    });
    it('centred core (equidistant) — byte-identical to before: the nearer façade, z0 on a tie', () => {
        const bb: Rect = { x0: 0, z0: 0, x1: 20, z1: 25 };
        const core: Rect = { x0: 8.5, x1: 11.5, z0: 9.345, z1: 15.655 };
        const g = computeGroundFloor(bb, core, 1.5);
        expect(g.entranceEdge).toBe('z0');   // distToZ0 = 9.345 = distToZ1 ⇒ the pre-lane tie rule (≤) picks z0
        expect(g.lobby.z1).toBeCloseTo(9.345, 3);
    });
    it('side core nearer the back than the front keeps the nearer (z1) façade — unchanged', () => {
        const bb: Rect = { x0: 0, z0: 0, x1: 20, z1: 25 };
        const core: Rect = { x0: 0, x1: 4, z0: 14, z1: 20 };
        const g = computeGroundFloor(bb, core, 1.5);
        expect(g.entranceEdge).toBe('z1');
    });
});
