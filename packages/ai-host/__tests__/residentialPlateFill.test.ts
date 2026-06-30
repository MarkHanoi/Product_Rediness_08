// §RESI-FILL-PLATE (founder defect, 2026-06-23) — the apartments must FILL the plate.
//
// THE BUG: the residential plate-partition ran ONE public corridor centred on the core and
// packed apartments into the two ~9 m-deep bands either side of it. On a LARGE floor plate
// that filled only a ~(2×9 m) strip beside the core and left MOST of the plate empty — the
// founder saw 40 apartments clustered in two bands hugging the centre with a huge empty plate.
//
// THE FIX (platePartition.ts §RESI-FILL-PLATE): the partition now lays out a GRID of parallel
// double-loaded corridors — the core corridor plus parallel corridors at a fixed pitch — so
// apartment rows tile the WHOLE plate depth, and packs apartments along the ENTIRE length of
// every corridor on both sides. Given enough demand the placed apartments SPAN the plate and
// cover a strong fraction of its area, instead of a central cluster.
//
// These assertions drive the IN-SCOPE unit (`partitionLevelPlate`) directly with a large demand
// list so we can measure span + fill independent of the orchestrator's (separately-tuned)
// packer-capacity throttle. They assert, on a LARGE plate:
//   (a) the placed apartment cells SPAN a strong majority of the plate (x AND z extents);
//   (b) the placed-apartment footprint is a strong fraction of the net plate area;
//   (c) determinism.

import { describe, it, expect } from 'vitest';
import {
    partitionLevelPlate,
    MAX_APARTMENT_DEPTH_M,
    type PlatePartitionInput,
    type ApartmentDemand,
    type PlatePartitionResult,
} from '../src/workflows/residentialBuilding/platePartition.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';

function rectPoly(w: number, d: number): Pt[] {
    return [
        { x: 0, z: 0 },
        { x: w, z: 0 },
        { x: w, z: d },
        { x: 0, z: d },
    ];
}

function centredCore(w: number, d: number, cw: number, cd: number): Rect {
    const cx = w / 2, cz = d / 2;
    return { x0: cx - cw / 2, z0: cz - cd / 2, x1: cx + cw / 2, z1: cz + cd / 2 };
}

const T2: ApartmentDemand = { typology: 'T2', minAreaM2: 60, maxAreaM2: 80 };
const T3: ApartmentDemand = { typology: 'T3', minAreaM2: 80, maxAreaM2: 110 };

/** A LONG demand list (alternating T2/T3) — more than any single plate can hold, so the
 *  partition fills the plate and drops the tail (the orchestrator does the same prefix-trim). */
function manyDemands(n: number): ApartmentDemand[] {
    return Array.from({ length: n }, (_, i) => (i % 2 === 0 ? T2 : T3));
}

function largeInput(w: number, d: number, over: Partial<PlatePartitionInput> = {}): PlatePartitionInput {
    return {
        levelIndex: 2,
        footprint: rectPoly(w, d),
        core: centredCore(w, d, 6, 4),
        corridor: { widthM: 1.5 },
        apartments: manyDemands(400),
        ...over,
    };
}

function expectOk(out: ReturnType<typeof partitionLevelPlate>): PlatePartitionResult {
    expect(out.status).toBe('ok');
    return out as PlatePartitionResult;
}

/** Union x/z extent + total cell area of the placed apartment cells. */
function spanAndFill(res: PlatePartitionResult): { xSpan: number; zSpan: number; area: number } {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, area = 0;
    for (const c of res.apartmentCells) {
        x0 = Math.min(x0, c.rect.x0); x1 = Math.max(x1, c.rect.x1);
        z0 = Math.min(z0, c.rect.z0); z1 = Math.max(z1, c.rect.z1);
        area += (c.rect.x1 - c.rect.x0) * (c.rect.z1 - c.rect.z0);
    }
    return { xSpan: x1 - x0, zSpan: z1 - z0, area };
}

function overlaps(a: Rect, b: Rect): boolean {
    return a.x0 < b.x1 - 1e-4 && a.x1 > b.x0 + 1e-4 && a.z0 < b.z1 - 1e-4 && a.z1 > b.z0 + 1e-4;
}

describe('§RESI-FILL-PLATE — apartments fill the plate, not a central cluster', () => {
    // Each large plate: (a) span ≥ 70% of each axis, (b) area ≥ 45% of the net plate.
    for (const [w, d] of [[60, 40], [137, 137], [100, 80]] as const) {
        it(`a ${w}×${d} m plate is SPANNED by apartments (≥70% each axis) and ≥45% filled`, () => {
            const res = expectOk(partitionLevelPlate(largeInput(w, d)));
            const { xSpan, zSpan, area } = spanAndFill(res);

            // (a) span: the union of placed cells covers a strong majority of BOTH axes.
            expect(xSpan / w).toBeGreaterThanOrEqual(0.70);
            expect(zSpan / d).toBeGreaterThanOrEqual(0.70);

            // (b) fill: placed-apartment footprint is a strong fraction of the net plate.
            const netPlate = w * d;
            expect(area / netPlate).toBeGreaterThanOrEqual(0.45);

            // It must place MANY apartments (not the old ~handful beside the core).
            expect(res.apartmentCells.length).toBeGreaterThanOrEqual(20);

            // Every placed apartment is reached by a corridor (by construction).
            expect(res.apartmentsReached).toBe(res.apartmentCells.length);
        });
    }

    it('the corridor system is a GRID of parallel runs + a connecting core spine', () => {
        const res = expectOk(partitionLevelPlate(largeInput(137, 137)));
        // The HORIZONTAL bands span the full plate width (X) — straight full-length runs; a
        // 137 m-deep plate needs several to cover the depth at the ~9 m apartment-depth cap.
        const horizontal = res.publicCorridor.filter(c => c.x0 < 1e-3 && Math.abs(c.x1 - 137) < 1e-3);
        expect(horizontal.length).toBeGreaterThanOrEqual(3);
        for (const corr of horizontal) {
            expect(corr.x0).toBeCloseTo(0, 3);
            expect(corr.x1).toBeCloseTo(137, 3);
        }
        // §RESI-CORE-SPINE — a NARROW vertical spine (taller than wide) connects the horizontal
        // bands + the core into ONE network, so no corridor is isolated from the stair/lift.
        const spine = res.publicCorridor.filter(c => (c.x1 - c.x0) < (c.z1 - c.z0));
        expect(spine.length).toBeGreaterThanOrEqual(1);
    });

    it('no two placed cells overlap, and no cell overlaps the core or any corridor', () => {
        const res = expectOk(partitionLevelPlate(largeInput(60, 40)));
        const cells = res.apartmentCells.map((c) => c.rect);
        for (let i = 0; i < cells.length; i++) {
            for (let j = i + 1; j < cells.length; j++) {
                expect(overlaps(cells[i]!, cells[j]!)).toBe(false);
            }
            expect(overlaps(cells[i]!, res.core)).toBe(false);
            for (const corr of res.publicCorridor) {
                expect(overlaps(cells[i]!, corr)).toBe(false);
            }
        }
    });

    it('every placed apartment cell is ≤ MAX_APARTMENT_DEPTH_M deep off its corridor edge', () => {
        const res = expectOk(partitionLevelPlate(largeInput(100, 80)));
        for (const c of res.apartmentCells) {
            const depth = c.rect.z1 - c.rect.z0; // corridors run along X → cell depth is the Z span
            expect(depth).toBeLessThanOrEqual(MAX_APARTMENT_DEPTH_M + 1e-3);
        }
    });

    it('is deterministic — identical input yields byte-identical output', () => {
        const a = JSON.stringify(partitionLevelPlate(largeInput(137, 137)));
        const b = JSON.stringify(partitionLevelPlate(largeInput(137, 137)));
        expect(a).toBe(b);
    });

    it('a SMALL plate still places a sensible count (single corridor, no regression)', () => {
        // A 30×16 plate has depth < 2·pitch → just the core corridor; apartments still pack.
        const res = expectOk(partitionLevelPlate(largeInput(30, 16, { apartments: manyDemands(40) })));
        expect(res.apartmentCells.length).toBeGreaterThanOrEqual(4);
        // §RESI-CORRIDOR-TO-CORE — the single core corridor LINE is now SPLIT at the core faces so its
        // walls arrive JUST to the core (no full-width band running through the core). At the core's Z
        // it is two co-linear segments: a LEFT one ending at core.x0 and a RIGHT one starting at core.x1.
        // (Plus the §RESI-CORE-SPINE vertical segments that connect it to the core.)
        const cz = (res.core.z0 + res.core.z1) / 2;
        const atCoreZ = res.publicCorridor.filter(c => {
            const z0 = Math.min(c.z0, c.z1), z1 = Math.max(c.z0, c.z1);
            return z0 < cz + 1e-3 && z1 > cz - 1e-3 && Math.abs(c.x1 - c.x0) > Math.abs(c.z1 - c.z0);
        });
        const leftSeg = atCoreZ.some(c => Math.min(c.x0, c.x1) < 1e-3 && Math.abs(Math.max(c.x0, c.x1) - res.core.x0) < 1e-3);
        const rightSeg = atCoreZ.some(c => Math.abs(Math.min(c.x0, c.x1) - res.core.x1) < 1e-3 && Math.abs(Math.max(c.x0, c.x1) - 30) < 1e-3);
        expect(leftSeg).toBe(true);
        expect(rightSeg).toBe(true);
        // No horizontal band runs THROUGH the core (the founder's "arrive JUST to the core").
        const throughCore = res.publicCorridor.some(c => {
            const x0 = Math.min(c.x0, c.x1), x1 = Math.max(c.x0, c.x1);
            const z0 = Math.min(c.z0, c.z1), z1 = Math.max(c.z0, c.z1);
            const xo = Math.min(x1, res.core.x1) - Math.max(x0, res.core.x0);
            const zo = Math.min(z1, res.core.z1) - Math.max(z0, res.core.z0);
            return xo > 1e-3 && zo > 1e-3;
        });
        expect(throughCore).toBe(false);
    });

    it('a genuinely TINY plate still rejects (does not mask a real capacity miss)', () => {
        const out = partitionLevelPlate({
            levelIndex: 1,
            footprint: rectPoly(8, 6),
            core: centredCore(8, 6, 2.0, 2.0),
            corridor: { widthM: 1.2 },
            apartments: [T3, T3, T3, T3],
        });
        expect(out.status).toBe('rejected');
    });
});

describe('§RESI-PLATE-UNDERFILL — large plates pack MANY apartments at a high fillRatio', () => {
    // The founder's report: a ~37×29 m plate yielded only ~3 apartments (most of the plate empty).
    // The fix packs MANY units (rows tile the whole plate, the width residual is filled with even
    // cells) and reports the §DIAG-RESI-FILL `fillRatio` (placed footprint ÷ net plate area).
    it('the founder ~37×29 plate packs MANY MORE than 3 apartments', () => {
        const res = expectOk(partitionLevelPlate(largeInput(37.4, 29.3)));
        // Many more than the founder's 3 — the rows tile the plate depth + width.
        expect(res.apartmentCells.length).toBeGreaterThanOrEqual(6);
        // The §DIAG-RESI-FILL ratio is reported and is a strong fraction of the net plate.
        expect(res.fillRatio).toBeGreaterThanOrEqual(0.5);
        expect(res.diagnostic).toContain('§DIAG-RESI-FILL');
        expect(res.apartmentsReached).toBe(res.apartmentCells.length);
    });

    it('a large 100×80 plate fills a strong majority of its net area (fillRatio ≥ 0.80)', () => {
        const res = expectOk(partitionLevelPlate(largeInput(100, 80)));
        expect(res.fillRatio).toBeGreaterThanOrEqual(0.80);
        expect(res.apartmentCells.length).toBeGreaterThanOrEqual(60);
    });

    it('the fillRatio = placed footprint ÷ (plate − core) and matches the cells', () => {
        const res = expectOk(partitionLevelPlate(largeInput(60, 40)));
        const placed = res.apartmentCells.reduce((s, c) => s + (c.rect.x1 - c.rect.x0) * (c.rect.z1 - c.rect.z0), 0);
        const net = 60 * 40 - (res.core.x1 - res.core.x0) * (res.core.z1 - res.core.z0);
        expect(res.fillRatio).toBeCloseTo(placed / net, 2);
        // The width-residual fix lifts the fill well above the old greedy-slice baseline.
        expect(res.fillRatio).toBeGreaterThanOrEqual(0.80);
    });
});
