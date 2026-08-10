// Residential building (multi-family) — Slice B / Tracker P3 — orchestrator tests.
//
// TEST-FIRST. Covers the acceptance row (audit §3 + tracker P3):
//  - level count (N upper + 1 ground);
//  - centred-core invariant (core centroid ≈ footprint centroid on EVERY level);
//  - ground floor has NO apartments (commercial stub);
//  - upper levels have N apartments (packer → plate-partition);
//  - deterministic (same input twice → identical output).

import { describe, it, expect } from 'vitest';
import {
    orchestrateResidentialBuilding,
    type ResidentialBuildingOrchestratorInput,
    type ResidentialBuildingResult,
} from '../residentialBuildingOrchestrator';
import type { Pt } from '../../apartmentLayout/tgl/rectDecomposition';

function rectPoly(w: number, d: number): Pt[] {
    return [
        { x: 0, z: 0 },
        { x: w, z: 0 },
        { x: w, z: d },
        { x: 0, z: d },
    ];
}

function input(over: Partial<ResidentialBuildingOrchestratorInput> = {}): ResidentialBuildingOrchestratorInput {
    return {
        footprint: rectPoly(30, 18),
        upperLevels: 4,
        coreWidthM: 6,
        coreDepthM: 5,
        corridorWidthM: 1.5,
        minApartmentAreaM2: 45,
        maxApartmentAreaM2: 120,
        typologies: { T1: false, T2: true, T3: true, T4: false },
        ...over,
    };
}

function centroidOf(poly: readonly Pt[]): { x: number; z: number } {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
    }
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
}

describe('residentialBuildingOrchestrator — P3', () => {
    it('mints N upper levels + 1 ground level', () => {
        const r = orchestrateResidentialBuilding(input({ upperLevels: 4 }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.levels.length).toBe(5); // ground + 4 upper
        expect(r.levels[0]!.role).toBe('ground');
        expect(r.levels.slice(1).every((l) => l.role === 'upper')).toBe(true);
    });

    it('handles the level range 1..20', () => {
        for (const n of [1, 2, 10, 20]) {
            const r = orchestrateResidentialBuilding(input({ upperLevels: n }));
            expect(r.status).toBe('ok');
            if (r.status === 'ok') expect(r.levels.length).toBe(n + 1);
        }
    }, 30_000);   // §RESI-EDGE-TYPE-VARIETY — more typologies now survive (more cells lay out) ⇒ more
                  // per-cell engine work across 33 levels; the heavier-but-richer path needs headroom.

    it('places a CENTRED core whose centroid ≈ the footprint centroid on every level', () => {
        const fp = rectPoly(30, 18);
        const r = orchestrateResidentialBuilding(input({ footprint: fp }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const fc = centroidOf(fp);
        // Single shared core, same XZ on every level (centred-core invariant).
        const coreCx = (r.core.x0 + r.core.x1) / 2;
        const coreCz = (r.core.z0 + r.core.z1) / 2;
        expect(Math.abs(coreCx - fc.x)).toBeLessThan(1e-6);
        expect(Math.abs(coreCz - fc.z)).toBeLessThan(1e-6);
        // Diagnostic reports the centred core.
        expect(r.diagnostic).toContain('§DIAG-RESI-ORCHESTRATE');
        expect(r.diagnostic).toContain('coreCentre=');
    });

    it('ground floor has NO apartments (commercial stub)', () => {
        const r = orchestrateResidentialBuilding(input());
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.perLevelApartments[0]!.apartments.length).toBe(0);
        expect(r.perLevelApartments[0]!.role).toBe('ground');
        // The ground carries a commercial marker for the P5 curtain-wall slice.
        expect(r.levels[0]!.commercialGroundFloor).toBe(true);
    });

    it('upper levels each carry N (≥1) apartments via packer → plate-partition', () => {
        const r = orchestrateResidentialBuilding(input({ upperLevels: 3 }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const upper = r.perLevelApartments.slice(1);
        expect(upper.length).toBe(3);
        for (const lvl of upper) {
            expect(lvl.apartments.length).toBeGreaterThanOrEqual(1);
            // every apartment carries a typology + a program + a placed cell rect.
            for (const a of lvl.apartments) {
                expect(['T1', 'T2', 'T3', 'T4']).toContain(a.typology);
                expect(a.program.bedrooms).toBeGreaterThanOrEqual(1);
                expect(a.cell).toBeTruthy();
            }
        }
    });

    it('emits §DIAG-RESI-ORCHESTRATE with levels + apartmentsPerLevel', () => {
        const r = orchestrateResidentialBuilding(input({ upperLevels: 4 }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.diagnostic).toContain('levels=5');
        expect(r.diagnostic).toContain('apartmentsPerLevel=[');
    });

    it('is deterministic — same input twice → identical output', () => {
        const a = orchestrateResidentialBuilding(input({ upperLevels: 5 }));
        const b = orchestrateResidentialBuilding(input({ upperLevels: 5 }));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }, 30_000);   // §RESI-STRETCH-TO-RUN — cells now stretch to the full run width, so each of the
                  // 2 × 5 levels lays out LARGER apartments (more per-cell engine work: ~230 ms →
                  // ~390 ms per orchestration here). Comfortably inside 5 s alone, but it tipped
                  // over the default when the suite runs its files in parallel. Explicit headroom.

    it('soft-fails (rejected) when an upper level cannot host even one apartment', () => {
        // Tiny footprint: net residential area after core + corridor cannot host a min apt.
        const r = orchestrateResidentialBuilding(
            input({
                footprint: rectPoly(8, 8),
                coreWidthM: 5,
                coreDepthM: 5,
                minApartmentAreaM2: 45,
                maxApartmentAreaM2: 120,
            }),
        );
        expect(r.status).toBe('rejected');
        if (r.status === 'rejected') {
            expect(r.diagnostic).toContain('status=rejected');
        }
    });

    it('§RESI-SMALL-PLATE-CORE-SCALE — a ~360 m² plot now BUILDS (was a "too small / no usable band" reject)', () => {
        // Founder 2026-06-24: a small plot hard-rejected because the FIXED 6×4 m core + 1.5 m corridor
        // left no usable apartment band. Scaling the core (and corridor) DOWN on a small plate lets a
        // genuine point-block build. Baseline min was ~484 m² (a 22 m square); this is now ~361 m².
        const r = orchestrateResidentialBuilding(
            input({
                footprint: rectPoly(19, 19), // 361 m²
                upperLevels: 1,
                coreWidthM: 6,
                coreDepthM: 4,
                corridorWidthM: 1.5,
                minApartmentAreaM2: 55,
                maxApartmentAreaM2: 110,
                typologies: { T1: true, T2: true, T3: false, T4: false },
            }),
        );
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const apts = r.perLevelApartments[1]!.apartments;
        const laidOut = apts.filter((a) => a.status === 'ok');
        expect(laidOut.length).toBeGreaterThanOrEqual(1);
        for (const a of laidOut) expect(a.layout!.rooms.length).toBeGreaterThan(0);
        // The core was scaled DOWN below the requested 6×4 (it would not otherwise fit a band).
        expect(r.core.x1 - r.core.x0).toBeLessThan(6);
    });

    it('§RESI-CORE-REWORK — a LARGE plate floors the core at the clearance MINIMUM (deeper than the old 6×4), corridor identity kept', async () => {
        const r = orchestrateResidentialBuilding(
            input({
                footprint: rectPoly(40, 40),
                upperLevels: 1,
                coreWidthM: 6,
                coreDepthM: 4,
                corridorWidthM: 1.5,
                minApartmentAreaM2: 55,
                maxApartmentAreaM2: 110,
                typologies: { T1: false, T2: true, T3: false, T4: false },
            }),
        );
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        // §RESI-CORE-REWORK — the requested core is now FLOORED at the clearance-derived minimum so
        // the stair body (incl. the half-turn landing) + lift shaft + 1.2 m approaches fit inside.
        // Width 6 ≥ the derived min (≈4.28) ⇒ kept; depth 4 < the derived min (≈6.31) ⇒ RAISED to it.
        const coreW = r.core.x1 - r.core.x0;
        const coreD = r.core.z1 - r.core.z0;
        const { deriveCoreSizing } = await import('../coreSizing.js');
        const min = deriveCoreSizing({ maxFloorToFloorM: 4.5 });
        expect(coreW).toBeGreaterThanOrEqual(min.coreWidthM - 1e-6);
        expect(coreW).toBeCloseTo(6, 3);                       // requested width kept (≥ min)
        expect(coreD).toBeCloseTo(min.coreDepthM, 3);          // depth floored UP to the clearance min
        expect(coreD).toBeGreaterThan(4);                      // the founder's bigger core
        // Requested corridor kept exactly (1.5 m wide).
        const corr = r.perLevelApartments[1]!.publicCorridor[0]!;
        expect(corr.z1 - corr.z0).toBeCloseTo(1.5, 3);
    });

    it('ACCEPTS a rotated/skewed parcel (§RESI-RIGID-TRANSFORM — the old axis-aligned stub is gone)', () => {
        // A clearly off-axis quad (the founder draws the parcel at an angle on the map).
        // Pre-fix this returned `rejected` ("footprint must be an axis-aligned rectangle (stub)");
        // now the orchestrator derives the oriented box + runs axis-aligned in the local frame.
        const skew: Pt[] = [
            { x: 0, z: 0 },
            { x: 30, z: 2 },
            { x: 28, z: 18 },
            { x: 0, z: 16 },
        ];
        const r = orchestrateResidentialBuilding(input({ footprint: skew }));
        expect(r.status).not.toBe('rejected');
        if (r.status === 'ok') {
            // The transform is carried back for the executor to re-rotate emitted geometry.
            expect(r.transform).toBeTruthy();
            expect(typeof r.transform.thetaRad).toBe('number');
        }
    });

    it('still soft-fails a DEGENERATE plate (zero area) with a clear reason', () => {
        const collinear: Pt[] = [
            { x: 0, z: 0 },
            { x: 30, z: 0 },
            { x: 30, z: 0 },
            { x: 0, z: 0 },
        ];
        const r = orchestrateResidentialBuilding(input({ footprint: collinear }));
        expect(r.status).toBe('rejected');
    });
});

// ── Tracker P7 — run D-TGL per apartment cell (rooms + windows + blind party walls) ──
describe('residentialBuildingOrchestrator — P7 (D-TGL per cell)', () => {
    // A plate tuned so the partition produces ROOMY (engine-feasible) cells: a 30×18 plate
    // with a small core + 1.5 m corridor leaves ~8.3 m-deep front/back bands; an 80–110 m²
    // T2-only band makes each cell ~9.7 m wide × 8.3 m deep (~80 m²) → the engine routes the
    // 2-bed plate (verified: 6 options/cell). A 3-bed (T3) or a tighter band soft-fails per
    // cell — the soft-fail test below covers that path.
    function p7input(over: Partial<ResidentialBuildingOrchestratorInput> = {}): ResidentialBuildingOrchestratorInput {
        return input({
            footprint: rectPoly(30, 18),
            coreWidthM: 5,
            coreDepthM: 4,
            corridorWidthM: 1.5,
            minApartmentAreaM2: 80,
            maxApartmentAreaM2: 110,
            typologies: { T1: false, T2: true, T3: false, T4: false },
            ...over,
        });
    }

    it('every upper apartment gets a non-empty D-TGL layout (rooms > 0)', () => {
        const r = orchestrateResidentialBuilding(p7input({ upperLevels: 2 }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const upper = r.perLevelApartments.slice(1);
        let laidOut = 0;
        for (const lvl of upper) {
            expect(lvl.apartments.length).toBeGreaterThanOrEqual(1);
            for (const a of lvl.apartments) {
                expect(a.status).toBe('ok');
                expect(a.layout).toBeTruthy();
                expect(a.layout!.rooms.length).toBeGreaterThan(0);
                laidOut++;
            }
        }
        expect(laidOut).toBeGreaterThanOrEqual(2);
    });

    it('blind party walls — an apartment hosts windows only on its façade edges', () => {
        const r = orchestrateResidentialBuilding(p7input({ upperLevels: 1 }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const upper = r.perLevelApartments[1]!;
        const MM_TO_M = 1e-3;
        const TOL = 0.05;
        const edgeOf = (
            w: { start: { x: number; y: number }; end: { x: number; y: number } },
            rect: { x0: number; z0: number; x1: number; z1: number },
        ): string | null => {
            const ax = w.start.x * MM_TO_M, az = w.start.y * MM_TO_M;
            const bx = w.end.x * MM_TO_M, bz = w.end.y * MM_TO_M;
            const dx = Math.abs(bx - ax), dz = Math.abs(bz - az);
            if (dz > dx) {
                const x = (ax + bx) / 2;
                if (Math.abs(x - rect.x0) <= TOL) return 'x0';
                if (Math.abs(x - rect.x1) <= TOL) return 'x1';
                return null;
            }
            const z = (az + bz) / 2;
            if (Math.abs(z - rect.z0) <= TOL) return 'z0';
            if (Math.abs(z - rect.z1) <= TOL) return 'z1';
            return null;
        };
        for (const a of upper.apartments) {
            if (a.status !== 'ok' || !a.layout) continue;
            const facade = new Set(a.facadeEdges);
            // The doorEdge (corridor side) must be blind, never a façade.
            expect(facade.has(a.cell.doorEdge as never)).toBe(false);
            for (const win of a.layout.windows ?? []) {
                const host = a.layout.walls[win.wallRef];
                if (!host || host.isExternal !== true) continue;
                const edge = edgeOf(host, a.cell.rect);
                // Every external-hosted window resolvable to a cell edge is on a façade —
                // never on a blind edge (a neighbour/corridor/core party wall).
                if (edge !== null) expect(facade.has(edge as never)).toBe(true);
            }
        }
    });

    it('is deterministic with layouts wired — same input twice → identical output', () => {
        const a = orchestrateResidentialBuilding(p7input({ upperLevels: 2 }));
        const b = orchestrateResidentialBuilding(p7input({ upperLevels: 2 }));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it('soft-fails PER CELL (some apartments laid out, the rest rejected) — never throws', () => {
        // A band so tight every cell is too small for the engine's topology gate: the
        // apartments are PLACED (the partition packs them) but each cell soft-fails D-TGL.
        // The orchestrator must still return ok with the apartments present (status flags),
        // never throwing and never failing the whole building.
        const r = orchestrateResidentialBuilding(
            input({ upperLevels: 1, minApartmentAreaM2: 40, maxApartmentAreaM2: 55, typologies: { T1: true, T2: false, T3: false, T4: false } }),
        );
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const apts = r.perLevelApartments[1]!.apartments;
        expect(apts.length).toBeGreaterThanOrEqual(1);
        // Every apartment carries a status; a rejected one has no layout but the building stands.
        for (const a of apts) {
            expect(['ok', 'rejected']).toContain(a.status);
            if (a.status === 'rejected') {
                expect(a.layout).toBeUndefined();
                expect(a.rejectReason).toBeTruthy();
            }
        }
    });

    it('§RESI-T3-FIT — a T3 demand yields at least one apartment laid out as 3 bedrooms (no reject)', () => {
        // A plate whose core leaves ~13–16 m-wide runs at ~9 m depth → a cell in the proven 3-bed
        // keep band. Before §RESI-T3-FIT the 9 m depth cap forced ~95 m² cells that always scaled
        // down to a 2-bed, so T3 never appeared.
        const r = orchestrateResidentialBuilding(
            input({
                footprint: rectPoly(34, 30),
                upperLevels: 1,
                coreWidthM: 6,
                coreDepthM: 5,
                corridorWidthM: 1.5,
                minApartmentAreaM2: 95,
                maxApartmentAreaM2: 135,
                typologies: { T1: false, T2: false, T3: true, T4: false },
            }),
        );
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const apts = r.perLevelApartments[1]!.apartments;
        // NEVER regress to zero apartments.
        expect(apts.length).toBeGreaterThanOrEqual(1);
        // At least one apartment lays out with 3 bedrooms (master counts as a bedroom).
        const threeBed = apts.filter((a) => {
            if (a.status !== 'ok' || !a.layout) return false;
            const beds = a.layout.rooms.filter((rm) => rm.type === 'bedroom' || rm.type === 'master').length;
            return beds >= 3;
        });
        expect(threeBed.length).toBeGreaterThanOrEqual(1);
        // And nothing was rejected (every placed cell laid out).
        expect(apts.every((a) => a.status === 'ok')).toBe(true);
    });

    it('§RESI-T3-FIT-REGRESSION-FIX — a T1+T2+T3 mix on a founder-sized plate still LAYS OUT ≥1 apartment', () => {
        // Regression (founder 2026-06-24: "20 units couldn't fit at this size — 0 apartments"). On a
        // ~30 m square plate the centred core splits each corridor row into ~14 m-wide runs; the old
        // even-division forced ONE ~14.3 m-wide cell per run, which the frozen D-TGL engine rejects at
        // the 9 m depth cap (feasible width tops out ~13.25 m) → EVERY cell soft-failed → 0 apartments.
        // Adding T1 (studio/1-bed) to the mix was the founder's trigger. The width-feasibility cap +
        // greedy-slice fallback must guarantee ≥1 LAID-OUT apartment for the full mix.
        for (const band of [[50, 100], [55, 100], [60, 100], [60, 105]] as Array<[number, number]>) {
            const r = orchestrateResidentialBuilding(
                input({
                    footprint: rectPoly(30, 30),
                    upperLevels: 1,
                    coreWidthM: 6,
                    coreDepthM: 5,
                    corridorWidthM: 1.5,
                    minApartmentAreaM2: band[0],
                    maxApartmentAreaM2: band[1],
                    typologies: { T1: true, T2: true, T3: true, T4: false },
                }),
            );
            expect(r.status).toBe('ok');
            if (r.status !== 'ok') continue;
            const apts = r.perLevelApartments[1]!.apartments;
            const laidOut = apts.filter((a) => a.status === 'ok');
            // The regression was 0 laid-out apartments; the guarantee is ≥1.
            expect(laidOut.length).toBeGreaterThanOrEqual(1);
            // Every laid-out cell has rooms (a real apartment, not an empty shell).
            for (const a of laidOut) expect(a.layout!.rooms.length).toBeGreaterThan(0);
        }
    });

    it('§RESI-T3-FIT-REGRESSION-FIX — adding T1 to the mix never REDUCES the laid-out count to 0', () => {
        // The core guarantee: for any plate where T2+T3 places apartments, T1+T2+T3 must too.
        const laidOutCount = (typologies: ResidentialBuildingOrchestratorInput['typologies'], s: number): number => {
            const r = orchestrateResidentialBuilding(
                input({
                    footprint: rectPoly(s, s),
                    upperLevels: 1,
                    coreWidthM: 6,
                    coreDepthM: 5,
                    corridorWidthM: 1.5,
                    minApartmentAreaM2: 60,
                    maxApartmentAreaM2: 100,
                    typologies,
                }),
            );
            return r.status === 'ok' ? r.perLevelApartments[1]!.apartments.filter((a) => a.status === 'ok').length : -1;
        };
        for (const s of [28, 30, 32, 34, 36, 40, 45, 50]) {
            const t23 = laidOutCount({ T1: false, T2: true, T3: true, T4: false }, s);
            const t123 = laidOutCount({ T1: true, T2: true, T3: true, T4: false }, s);
            if (t23 > 0) expect(t123).toBeGreaterThanOrEqual(1);
        }
    }, 60_000);   // 16 full orchestrations × the heavy per-cell engine — needs a realistic budget.

    it('§RESI-T3-FIT-REGRESSION-FIX — the demo case (core 6×4, corridor 1.5, T2 / T1+T2 @ 55–110, ~30 m plate) lays out apartments with all mandatory rooms reachable', () => {
        // Demo blocker (founder 2026-06-24: "16 of 16 couldn't fit — over-programmed"). The reported
        // failure was a corner cell whose corridor couldn't reach every room → mandatory-gate rejected
        // the whole cell. ROOT (verified by the engine-feasibility sweep): the per-cell D-TGL engine
        // cannot route a comb corridor through a cell SHALLOWER than ~7.5 m OR with an aspect-extreme
        // (over-wide / over-deep) shape — both regimes are now bounded by §RESI-T3-FIT-REGRESSION-FIX
        // (depth capped at MAX_APARTMENT_DEPTH_M = 9, width capped at engineMaxCellWidth). With those
        // bounds the orchestrator never hands the engine a comb-infeasible real-program cell, so every
        // placed apartment lays out with its full mandatory room set (and the engine only returns a
        // layout when those rooms are CIRCULATION-REACHABLE — reachability is guaranteed by construction).
        for (const t1 of [false, true]) {
            for (const s of [28, 30, 32, 34, 36, 38]) {
                const r = orchestrateResidentialBuilding(
                    input({
                        footprint: rectPoly(s, s),
                        upperLevels: 1,
                        coreWidthM: 6,
                        coreDepthM: 4,
                        corridorWidthM: 1.5,
                        minApartmentAreaM2: 55,
                        maxApartmentAreaM2: 110,
                        typologies: { T1: t1, T2: true, T3: false, T4: false },
                    }),
                );
                expect(r.status).toBe('ok');
                if (r.status !== 'ok') continue;
                const apts = r.perLevelApartments[1]!.apartments;
                // The "real" partition cells (≥ 50 m²) — the thin clamped-edge leftovers (< 50 m²,
                // un-demanded slivers) are not the apartments the founder sees and may soft-fail.
                const realCells = apts.filter((a) => a.targetAreaM2 >= 50);
                expect(realCells.length).toBeGreaterThanOrEqual(1);
                // EVERY real cell lays out (the demo bug was 0/16 laying out).
                for (const a of realCells) {
                    expect(a.status).toBe('ok');
                    const rooms = a.layout!.rooms;
                    const types = rooms.map((rm) => rm.type);
                    // The 2-bed mandatory set is present (the mandatory-gate passed ⇒ all reachable).
                    expect(types.some((t) => t === 'kitchen' || t.includes('kitchen'))).toBe(true);
                    expect(types).toContain('living');
                    expect(types.filter((t) => t === 'bedroom' || t === 'master').length).toBeGreaterThanOrEqual(1);
                }
            }
        }
    }, 60_000);

    it('§RESI-CORNER-UNITS-ALWAYS — a LAID-OUT dual-aspect apartment sits at every building corner', () => {
        // Founder 2026-06-24: "apartments must ALWAYS be in the corners — max daylight, max windows;
        // dual-aspect (two perpendicular façade faces)." The partition anchors corner units to the
        // plate edges and deepens the outermost band so a corner cell reaches BOTH the façade corner
        // and the corridor. Assert, end-to-end, that each of the 4 corners has a LAID-OUT apartment
        // whose façade-edge set spans an x-edge AND a z-edge (dual-aspect, windows on two sides).
        for (const s of [24, 30, 34, 40, 44]) {
            const r = orchestrateResidentialBuilding(
                input({
                    footprint: rectPoly(s, s),
                    upperLevels: 1,
                    coreWidthM: 6,
                    coreDepthM: 4,
                    corridorWidthM: 1.5,
                    minApartmentAreaM2: 60,
                    maxApartmentAreaM2: 100,
                    typologies: { T1: false, T2: true, T3: false, T4: false },
                }),
            );
            expect(r.status).toBe('ok');
            if (r.status !== 'ok') continue;
            const apts = r.perLevelApartments[1]!.apartments;
            const tol = 0.25;
            const cornerHit = { x0z0: false, x1z0: false, x0z1: false, x1z1: false };
            for (const a of apts) {
                if (a.status !== 'ok') continue;
                const c = a.cell.rect;
                const onX0 = Math.abs(c.x0) < tol, onX1 = Math.abs(c.x1 - s) < tol;
                const onZ0 = Math.abs(c.z0) < tol, onZ1 = Math.abs(c.z1 - s) < tol;
                if (!((onX0 || onX1) && (onZ0 || onZ1))) continue;     // not a corner cell
                // DUAL-ASPECT: façade edges include one x-face AND one z-face (windows on two sides).
                const fac = new Set(a.facadeEdges);
                const hasX = fac.has('x0') || fac.has('x1');
                const hasZ = fac.has('z0') || fac.has('z1');
                if (!(hasX && hasZ)) continue;
                if (onX0 && onZ0) cornerHit.x0z0 = true;
                if (onX1 && onZ0) cornerHit.x1z0 = true;
                if (onX0 && onZ1) cornerHit.x0z1 = true;
                if (onX1 && onZ1) cornerHit.x1z1 = true;
            }
            expect(cornerHit.x0z0).toBe(true);
            expect(cornerHit.x1z0).toBe(true);
            expect(cornerHit.x0z1).toBe(true);
            expect(cornerHit.x1z1).toBe(true);
        }
    }, 60_000);

    it('the orchestrate diagnostic + per-cell status survive the P7 wiring', () => {
        const r = orchestrateResidentialBuilding(p7input({ upperLevels: 3 }));
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.diagnostic).toContain('§DIAG-RESI-ORCHESTRATE');
        // Every placed apartment carries a P7 status + façade/blind edge sets.
        for (const lvl of r.perLevelApartments.slice(1)) {
            for (const a of lvl.apartments) {
                expect(['ok', 'rejected']).toContain(a.status);
                expect(Array.isArray(a.facadeEdges)).toBe(true);
                expect(Array.isArray(a.blindEdges)).toBe(true);
                // façade + blind partition the 4 edges with no overlap.
                expect(a.facadeEdges.length + a.blindEdges.length).toBe(4);
            }
        }
    });
});
