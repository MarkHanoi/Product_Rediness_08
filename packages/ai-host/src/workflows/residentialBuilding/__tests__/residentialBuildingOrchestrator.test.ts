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

    it('leaves a D-TGL seam per apartment cell (P7 stub — not yet wired)', () => {
        const r = orchestrateResidentialBuilding(input());
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        // Each upper apartment exposes a `cell` (the plate-partition rect) but NO rooms
        // yet — the per-cell D-TGL run is P7. The seam is the presence of cell + program
        // with rooms undefined.
        const apt = r.perLevelApartments[1]!.apartments[0]!;
        expect(apt.cell).toBeTruthy();
        expect((apt as { rooms?: unknown }).rooms).toBeUndefined();
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

    it('soft-fails when the footprint is not an axis-aligned rectangle (stub limit)', () => {
        const skew: Pt[] = [
            { x: 0, z: 0 },
            { x: 30, z: 2 },
            { x: 28, z: 18 },
            { x: 0, z: 16 },
        ];
        const r = orchestrateResidentialBuilding(input({ footprint: skew }));
        expect(r.status).toBe('rejected');
    });
});
