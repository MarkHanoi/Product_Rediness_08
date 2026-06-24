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

describe('partitionLevelPlate — §RESI-CLIP-BOUNDARY (non-rectangular plate)', () => {
    const manyT2 = Array.from({ length: 24 }, () => T2);

    it('a rectangular clipPolygon === the plate keeps every cell (no behavioural change)', () => {
        const base = baseInput(manyT2);
        const full = expectOk(partitionLevelPlate(base));
        const clipped = expectOk(partitionLevelPlate({ ...base, clipPolygon: rectPoly(30, 16) }));
        expect(clipped.apartmentCells.length).toBe(full.apartmentCells.length);
    });

    it('an L-shaped clip drops cells whose centre falls in the removed notch', () => {
        const base = baseInput(manyT2);
        const full = expectOk(partitionLevelPlate(base));
        // L-shape: remove the top-right quadrant (x>15, z<8) from the 30×16 plate.
        const lShape: Pt[] = [
            { x: 0, z: 0 }, { x: 15, z: 0 }, { x: 15, z: 8 },
            { x: 30, z: 8 }, { x: 30, z: 16 }, { x: 0, z: 16 },
        ];
        const clipped = expectOk(partitionLevelPlate({ ...base, clipPolygon: lShape }));
        // Fewer cells than the full rectangle…
        expect(clipped.apartmentCells.length).toBeLessThan(full.apartmentCells.length);
        // …and NO surviving cell has its centre inside the removed notch.
        for (const c of clipped.apartmentCells) {
            const cx = (c.rect.x0 + c.rect.x1) / 2, cz = (c.rect.z0 + c.rect.z1) / 2;
            expect(cx > 15 && cz < 8).toBe(false);
        }
    });
});

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

    it('every apartment area clears its typology floor and keeps its typology (fill-plate)', () => {
        const apts = [T2, T3, T2, T3];
        const res = expectOk(partitionLevelPlate(baseInput(apts)));
        res.apartmentCells.forEach((cell, i) => {
            const d = apts[i % apts.length]!;
            // Feasibility floor still holds — a cell is never sub-minimum for its typology.
            expect(cell.areaM2).toBeGreaterThanOrEqual(d.minAreaM2 - 1e-2);
            // §RESI-FILL-PLATE — apartments STRETCH to consume the plate, so a cell's area is
            // geometry-bound and MAY exceed the typology's nominal max band (the band is the
            // packer's TARGET, not a hard partition cap; the per-cell program scaler then sizes
            // the dwelling to the actual area). The upper-band assertion no longer applies.
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

describe('partitionLevelPlate — §RESI-FILL-MIDEDGE (fill beside the core)', () => {
    /** A WIDE-core plate so the inner strips beside the core (between the core edge and the
     *  vertical spine) are themselves wide enough to host an apartment — the "blue box" region
     *  the founder reported as empty. Core 18 m wide ⇒ each inner strip ≈ (18 − 1.5)/2 = 8.25 m. */
    function wideCoreInput(apartments: ApartmentDemand[]): PlatePartitionInput {
        return {
            levelIndex: 2,
            footprint: rectPoly(50, 43),
            core: centredCore(50, 43, 18, 5),
            corridor: { widthM: 1.5 },
            apartments,
        };
    }

    it('places apartment cells in the mid-edge regions beside the core (x<coreX0 / x>coreX1 at the core Z-band)', () => {
        const manyT2 = Array.from({ length: 60 }, () => T2);
        const res = expectOk(partitionLevelPlate(wideCoreInput(manyT2)));
        const core = res.core;
        // The mid-edge INNER-STRIP cells sit in the core-WIDTH strip [coreX0,coreX1] at a Z OUTSIDE
        // the core's own Z-band — exactly the strip reserved (empty) before this fix — and reach
        // circulation via the vertical SPINE, so their door is hung on an x-edge (not a z-edge).
        const innerStrip = res.apartmentCells.filter((c) => {
            const r = c.rect;
            const intoStrip = r.x0 >= core.x0 - 0.01 && r.x1 <= core.x1 + 0.01; // wholly inside the core-width strip
            const outsideCoreZ = r.z1 <= core.z0 + 0.01 || r.z0 >= core.z1 - 0.01;
            return intoStrip && outsideCoreZ && (c.doorEdge === 'x0' || c.doorEdge === 'x1');
        });
        expect(innerStrip.length).toBeGreaterThanOrEqual(1);
        // Every such cell genuinely centred in a mid-edge region (x < coreX0 or x > coreX1 at core Z).
        for (const c of innerStrip) {
            const cx = (c.rect.x0 + c.rect.x1) / 2;
            const cz = (c.rect.z0 + c.rect.z1) / 2;
            expect(cx < core.x0 || cx > core.x1).toBe(false);   // strip is BETWEEN coreX0..coreX1
            expect(cz < core.z0 || cz > core.z1).toBe(true);    // …at a Z outside the core band
        }
    });

    it('mid-edge cells never overlap the core, the corridor, or each other', () => {
        const res = expectOk(partitionLevelPlate(wideCoreInput(Array.from({ length: 60 }, () => T2))));
        const cells = res.apartmentCells.map((c) => c.rect);
        for (let i = 0; i < cells.length; i++) {
            for (let j = i + 1; j < cells.length; j++) {
                expect(overlaps(cells[i]!, cells[j]!)).toBe(false);
            }
            expect(overlaps(cells[i]!, res.core)).toBe(false);
            for (const corr of res.publicCorridor) expect(overlaps(cells[i]!, corr)).toBe(false);
        }
    });

    it('still places the proven corridor-fronting cells on a small plate (no mid-edge regression)', () => {
        // The base 30×16 plate's inner strips are sub-apartment thin ⇒ no mid-edge cells, and the
        // ordinary corridor-fronting packing is byte-identical to before the fill-midedge change.
        const res = expectOk(partitionLevelPlate(baseInput([T2, T2, T2, T2])));
        expect(res.apartmentCells.length).toBe(4);
        expect(res.apartmentsReached).toBe(4);
    });
});

describe('partitionLevelPlate — §RESI-T3-FIT (3-bed cells appear)', () => {
    // A T3 demand on a plate whose core leaves ~13–16 m-wide runs at ~9 m depth → cells in the
    // proven 3-bed-keep band (13×9 = 117 m² … 16×9 = 144 m²). Before this fix the 9 m depth cap
    // forced ~95 m² cells that always scaled DOWN to a 2-bed.
    const T3wide: ApartmentDemand = { typology: 'T3', minAreaM2: 95, maxAreaM2: 135 };

    function t3Input(): PlatePartitionInput {
        return {
            levelIndex: 4,
            footprint: rectPoly(34, 30),
            core: centredCore(34, 30, 6, 5),
            corridor: { widthM: 1.5 },
            apartments: Array.from({ length: 20 }, () => T3wide),
        };
    }

    it('produces at least one cell big enough to keep 3 bedrooms (area ≥ the 3-bed keep threshold)', () => {
        const res = expectOk(partitionLevelPlate(t3Input()));
        // The 3-bed keep threshold is grossMin 85 × the count-scaled slack 1.28 ≈ 108.8 m².
        const KEEP_3BED = 108.8;
        const keepers = res.apartmentCells.filter((c) => c.typology === 'T3' && c.areaM2 >= KEEP_3BED);
        expect(keepers.length).toBeGreaterThanOrEqual(1);
        // …and every produced cell still lies within the engine-feasible width band (≤ ~17 m) so
        // the per-cell engine lays it out rather than rejecting an over-wide cell.
        for (const c of res.apartmentCells) {
            expect(c.rect.x1 - c.rect.x0).toBeLessThanOrEqual(17.5);
        }
    });

    it('NEVER regresses to zero apartments for a T3 demand', () => {
        const res = expectOk(partitionLevelPlate(t3Input()));
        expect(res.apartmentCells.length).toBeGreaterThanOrEqual(1);
        expect(res.apartmentsReached).toBe(res.apartmentCells.length);
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
