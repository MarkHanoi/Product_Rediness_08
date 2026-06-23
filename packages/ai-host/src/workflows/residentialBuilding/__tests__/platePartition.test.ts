// Residential building (multi-family) — P6.2 plate-partition acceptance tests.
//
// Covers (audit §3 + the tracker P6.2 accept row): a rectangular plate with
// 2/3/4 apartments, the corridor reaching every cell, no overlaps, core centred,
// cells within their typology m² band, and a deterministic-repeat assertion.

import { describe, it, expect } from 'vitest';
import {
    partitionLevelPlate,
    type PlatePartitionInput,
    type ApartmentDemand,
    type PlatePartitionResult,
} from '../platePartition';
import type { Pt, Rect } from '../../apartmentLayout/tgl/rectDecomposition';

/** Axis-aligned rectangular footprint, metres, plan frame. */
function rectPoly(w: number, d: number): Pt[] {
    return [
        { x: 0, z: 0 },
        { x: w, z: 0 },
        { x: w, z: d },
        { x: 0, z: d },
    ];
}

/** A centred core rect of `cw × cd` inside a `w × d` plate. */
function centredCore(w: number, d: number, cw: number, cd: number): Rect {
    const cx = w / 2, cz = d / 2;
    return { x0: cx - cw / 2, z0: cz - cd / 2, x1: cx + cw / 2, z1: cz + cd / 2 };
}

const T2: ApartmentDemand = { typology: 'T2', minAreaM2: 55, maxAreaM2: 80 };
const T3: ApartmentDemand = { typology: 'T3', minAreaM2: 80, maxAreaM2: 110 };

/** A generous 30 m × 16 m plate, 2.4 m × 3.0 m centred core, 1.4 m corridor. */
function baseInput(apartments: ApartmentDemand[]): PlatePartitionInput {
    return {
        levelIndex: 3,
        footprint: rectPoly(30, 16),
        core: centredCore(30, 16, 2.4, 3.0),
        corridor: { widthM: 1.4 },
        apartments,
    };
}

function overlaps(a: Rect, b: Rect): boolean {
    return a.x0 < b.x1 - 1e-4 && a.x1 > b.x0 + 1e-4 && a.z0 < b.z1 - 1e-4 && a.z1 > b.z0 + 1e-4;
}

function expectOk(out: ReturnType<typeof partitionLevelPlate>): PlatePartitionResult {
    expect(out.status).toBe('ok');
    return out as PlatePartitionResult;
}

describe('partitionLevelPlate — rectangular plate', () => {
    for (const n of [2, 3, 4]) {
        it(`packs ${n} apartments, corridor reaches every cell`, () => {
            const apts = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? T2 : T3));
            const res = expectOk(partitionLevelPlate(baseInput(apts)));
            expect(res.apartmentCells.length).toBe(n);
            // Every requested apartment is reached (shares ≥ door-width with corridor).
            expect(res.apartmentsReached).toBe(n);
        });
    }

    it('places the core in the centre of the footprint', () => {
        const res = expectOk(partitionLevelPlate(baseInput([T2, T3])));
        const cx = (res.core.x0 + res.core.x1) / 2;
        const cz = (res.core.z0 + res.core.z1) / 2;
        expect(cx).toBeCloseTo(15, 3); // 30/2
        expect(cz).toBeCloseTo(8, 3);  // 16/2
    });

    it('produces a corridor band that touches the core (centred on it)', () => {
        const res = expectOk(partitionLevelPlate(baseInput([T2, T3, T2])));
        expect(res.publicCorridor.length).toBeGreaterThanOrEqual(1);
        const corr = res.publicCorridor[0]!;
        const coreCz = (res.core.z0 + res.core.z1) / 2;
        // Corridor straddles the core's Z-centre.
        expect(corr.z0).toBeLessThan(coreCz);
        expect(corr.z1).toBeGreaterThan(coreCz);
    });

    it('apartment cells do not overlap each other, the core, or the corridor', () => {
        const res = expectOk(partitionLevelPlate(baseInput([T2, T3, T2, T3])));
        const cells = res.apartmentCells.map((c) => c.rect);
        const corr = res.publicCorridor[0]!;
        for (let i = 0; i < cells.length; i++) {
            for (let j = i + 1; j < cells.length; j++) {
                expect(overlaps(cells[i]!, cells[j]!)).toBe(false);
            }
            expect(overlaps(cells[i]!, res.core)).toBe(false);
            expect(overlaps(cells[i]!, corr)).toBe(false);
        }
    });

    it('every apartment area lands within its typology m² band', () => {
        const apts = [T2, T3, T2, T3];
        const res = expectOk(partitionLevelPlate(baseInput(apts)));
        res.apartmentCells.forEach((cell, i) => {
            const d = apts[i]!;
            expect(cell.areaM2).toBeGreaterThanOrEqual(d.minAreaM2 - 1e-2);
            expect(cell.areaM2).toBeLessThanOrEqual(d.maxAreaM2 + 1e-2);
            expect(cell.typology).toBe(d.typology);
        });
    });

    it('emits the §DIAG-RESI-PARTITION diagnostic with level, N, mix, reached', () => {
        const res = expectOk(partitionLevelPlate(baseInput([T2, T3])));
        expect(res.diagnostic).toContain('§DIAG-RESI-PARTITION');
        expect(res.diagnostic).toContain('level=3');
        expect(res.diagnostic).toContain('N=2');
        expect(res.diagnostic).toContain('reached=2/2');
    });

    it('is deterministic — identical input yields byte-identical output', () => {
        const inp = baseInput([T2, T3, T2]);
        const a = JSON.stringify(partitionLevelPlate(inp));
        const b = JSON.stringify(partitionLevelPlate(inp));
        expect(a).toBe(b);
    });
});

describe('partitionLevelPlate — soft-fail (never throws)', () => {
    it('rejects a non-rectangular footprint', () => {
        const lShape: Pt[] = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 },
            { x: 5, z: 5 }, { x: 5, z: 10 }, { x: 0, z: 10 },
        ];
        const out = partitionLevelPlate({ ...baseInput([T2]), footprint: lShape });
        expect(out.status).toBe('rejected');
        if (out.status === 'rejected') expect(out.reason).toMatch(/rectangular/);
    });

    it('rejects when the plate is too small to fit the requested mix', () => {
        // A tiny 8 m × 6 m plate cannot fit four T3 (≥80 m²) apartments.
        const out = partitionLevelPlate({
            levelIndex: 1,
            footprint: rectPoly(8, 6),
            core: centredCore(8, 6, 2.0, 2.0),
            corridor: { widthM: 1.2 },
            apartments: [T3, T3, T3, T3],
        });
        expect(out.status).toBe('rejected');
        if (out.status === 'rejected') expect(out.reason).toMatch(/no usable band|too small/);
    });

    it('rejects an empty apartment mix', () => {
        const out = partitionLevelPlate(baseInput([]));
        expect(out.status).toBe('rejected');
    });

    it('rejects a core not contained in the footprint', () => {
        const out = partitionLevelPlate({
            ...baseInput([T2]),
            core: { x0: 28, z0: 14, x1: 35, z1: 20 },
        });
        expect(out.status).toBe('rejected');
        if (out.status === 'rejected') expect(out.reason).toMatch(/contained/);
    });
});
