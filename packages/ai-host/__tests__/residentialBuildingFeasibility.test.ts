// §RESI-CELL-FEASIBLE (Task C) — reduce per-cell soft-fail rejections.
//
// THE P7 FINDING: the per-cell D-TGL engine soft-fails a cell that is too DEEP /
// too SKINNY. On a founder-sized ~38×43 m plate the full-band cells were ~4 m × 20 m
// slivers (aspect ~5:1) that the engine rejected → most/all apartments soft-failed.
//
// THE TUNING (platePartition.ts §RESI-CELL-FEASIBLE): cap apartment depth to
// MAX_APARTMENT_DEPTH_M (≤ ~12 m, anchored on the corridor edge) and floor the cell
// width to MIN_CELL_ASPECT × depth, so a deep plate produces square-ish, layout-able
// cells. This test asserts a typical floor on the founder's ~38×43 m plate with a
// T2/T3 mix places MOST apartments (a strong majority lay out, not all-rejected).
//
// Placed under `packages/ai-host/__tests__/` so the package's default vitest
// `include: ['__tests__/**/*.test.ts']` discovers it (the co-located
// `src/workflows/residentialBuilding/__tests__/` dir is NOT matched by that glob).

import { describe, it, expect } from 'vitest';
import {
    orchestrateResidentialBuilding,
    type ResidentialBuildingOrchestratorInput,
} from '../src/workflows/residentialBuilding/residentialBuildingOrchestrator.js';
import type { Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

function plate(w: number, d: number): Pt[] {
    return [
        { x: 0, z: 0 },
        { x: w, z: 0 },
        { x: w, z: d },
        { x: 0, z: d },
    ];
}

function founderInput(over: Partial<ResidentialBuildingOrchestratorInput> = {}): ResidentialBuildingOrchestratorInput {
    return {
        footprint: plate(38, 43),     // founder's site plate
        upperLevels: 1,
        coreWidthM: 6,
        coreDepthM: 4,
        corridorWidthM: 1.5,
        minApartmentAreaM2: 60,
        maxApartmentAreaM2: 100,
        typologies: { T1: false, T2: true, T3: true, T4: false }, // T2/T3 mix
        ...over,
    };
}

describe('§RESI-CELL-FEASIBLE — a founder-sized plate places MOST apartments (not all rejected)', () => {
    it('a typical ~38×43 m T2/T3 floor lays out a strong majority of its placed apartments', () => {
        const r = orchestrateResidentialBuilding(founderInput());
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;

        const upper = r.perLevelApartments.find((l) => l.role === 'upper');
        expect(upper).toBeTruthy();
        if (!upper) return;

        const total = upper.apartments.length;
        const laidOut = upper.apartments.filter((a) => a.status === 'ok' && a.layout).length;
        // The partition must place several apartments on this large plate.
        expect(total).toBeGreaterThanOrEqual(4);
        // MOST of them must lay out (engine-feasible) — a strong majority, not the
        // pre-tuning all-rejected outcome. (> half is the floor; in practice nearly all.)
        expect(laidOut).toBeGreaterThan(total / 2);
        // And at least a healthy absolute count lays out.
        expect(laidOut).toBeGreaterThanOrEqual(3);
    });

    it('every laid-out apartment has rooms and a sane cell aspect ratio (≤ ~3:1)', () => {
        const r = orchestrateResidentialBuilding(founderInput());
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        const upper = r.perLevelApartments.find((l) => l.role === 'upper');
        if (!upper) return;
        for (const a of upper.apartments) {
            if (a.status !== 'ok' || !a.layout) continue;
            expect(a.layout.rooms.length).toBeGreaterThan(0);
            const w = a.cell.rect.x1 - a.cell.rect.x0;
            const d = a.cell.rect.z1 - a.cell.rect.z0;
            const longSide = Math.max(w, d);
            const shortSide = Math.max(1e-6, Math.min(w, d));
            // The depth cap + aspect floor keep cells from going sliver-shaped.
            expect(longSide / shortSide).toBeLessThanOrEqual(3.2);
        }
    });

    it('is deterministic — same founder input twice → identical output', () => {
        const a = orchestrateResidentialBuilding(founderInput({ upperLevels: 2 }));
        const b = orchestrateResidentialBuilding(founderInput({ upperLevels: 2 }));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
