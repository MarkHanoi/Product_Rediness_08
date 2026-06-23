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
    });

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
    });

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
