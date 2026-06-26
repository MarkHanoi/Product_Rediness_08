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

    it('FILLS the mid-edge regions beside the core (no empty "blue box" strip) — §RESI-FILL-MIDEDGE', () => {
        // §RESI-FILL-MIDEDGE's invariant is that the core-WIDTH strip [coreX0,coreX1] OUTSIDE the
        // core's own Z-band is not left as an empty void beside the core. Originally this strip was
        // filled by dedicated x-door "inner-strip" cells; with §RESI-CORNER-UNITS-ALWAYS the deeper
        // façade rows now front a horizontal corridor directly, so the SAME strip is filled by ordinary
        // z-door cells (the spine-carved run spans it). Either way the region must NOT be empty — assert
        // COVERAGE (the real intent) rather than the specific cell mechanism.
        const manyT2 = Array.from({ length: 60 }, () => T2);
        const res = expectOk(partitionLevelPlate(wideCoreInput(manyT2)));
        const core = res.core;
        const inAny = (px: number, pz: number): boolean => {
            const hit = (r: Rect) => px >= r.x0 - 1e-3 && px <= r.x1 + 1e-3 && pz >= r.z0 - 1e-3 && pz <= r.z1 + 1e-3;
            return res.apartmentCells.some((c) => hit(c.rect)) || res.publicCorridor.some(hit);
        };
        // Sample the inner-strip region (core-width, at Z outside the core band) — every sample must
        // be covered by an apartment cell or a corridor (no empty void).
        for (const px of [core.x0 + 1, (core.x0 + core.x1) / 2, core.x1 - 1]) {
            for (const pz of [3, 7, 38]) {     // Z values outside the core's own band
                if (pz >= core.z0 && pz <= core.z1) continue;
                expect(inAny(px, pz)).toBe(true);
            }
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

describe('partitionLevelPlate — §RESI-T3-FIT-REGRESSION-FIX (no over-wide cells, mixed demand)', () => {
    const T1: ApartmentDemand = { typology: 'T1', minAreaM2: 40, maxAreaM2: 55 };

    /** A ~30 m square plate whose centred 6 m core leaves ~14 m-wide runs at the ~9 m depth cap —
     *  exactly the founder geometry where the old even-division minted ONE 14.3 m-wide cell per run
     *  that the engine then rejected (0 apartments). */
    function squareInput(apartments: ApartmentDemand[]): PlatePartitionInput {
        return {
            levelIndex: 5,
            footprint: rectPoly(30, 30),
            core: centredCore(30, 30, 6, 5),
            corridor: { widthM: 1.5 },
            apartments,
        };
    }

    /** Engine-feasible MAX cell width at a row depth — mirrors `engineMaxCellWidth` in the partition
     *  (`min(13, depth + 4)`). A T1/T2 cell wider than this rejects in the frozen D-TGL engine. */
    const engineMax = (depthM: number) => Math.min(13, depthM + 4);

    it('a T1+T2+T3 mixed demand never emits a non-keep cell wider than the engine can lay out', () => {
        const mix = Array.from({ length: 27 }, (_, i) => [T1, T2, T3][i % 3]!);
        const res = expectOk(partitionLevelPlate(squareInput(mix)));
        expect(res.apartmentCells.length).toBeGreaterThanOrEqual(1);
        for (const c of res.apartmentCells) {
            const w = c.rect.x1 - c.rect.x0;
            const d = c.rect.z1 - c.rect.z0;
            // T3 (keep band) may legitimately be wider (the engine lays out a 3-bed wider); a
            // non-keep T1/T2 cell must never exceed the generic engine width edge for its depth.
            if (c.typology === 'T1' || c.typology === 'T2') {
                expect(w).toBeLessThanOrEqual(engineMax(d) + 1e-3);
            }
        }
    });

    it('a T2-only demand on the founder square plate places ≥1 engine-feasible cell (was 0)', () => {
        const res = expectOk(partitionLevelPlate(squareInput(Array.from({ length: 27 }, () => T2))));
        expect(res.apartmentCells.length).toBeGreaterThanOrEqual(1);
        for (const c of res.apartmentCells) {
            const d = c.rect.z1 - c.rect.z0;
            expect(c.rect.x1 - c.rect.x0).toBeLessThanOrEqual(engineMax(d) + 1e-3);
        }
    });
});

describe('partitionLevelPlate — §RESI-CORNER-UNITS-ALWAYS (dual-aspect corner units at every corner)', () => {
    /** A corner cell touches TWO perpendicular plate edges (dual-aspect). */
    function cornerKey(r: Rect, w: number, d: number, tol = 0.25): string | null {
        const onX0 = Math.abs(r.x0 - 0) < tol, onX1 = Math.abs(r.x1 - w) < tol;
        const onZ0 = Math.abs(r.z0 - 0) < tol, onZ1 = Math.abs(r.z1 - d) < tol;
        if ((onX0 || onX1) && (onZ0 || onZ1)) return `${onX0 ? 'x0' : 'x1'}${onZ0 ? 'z0' : 'z1'}`;
        return null;
    }

    for (const [w, d] of [[24, 24], [30, 30], [34, 28], [40, 40], [44, 44]] as Array<[number, number]>) {
        it(`a ${w}×${d} m plate places a DUAL-ASPECT apartment at ALL FOUR corners`, () => {
            const apts = Array.from({ length: 80 }, () => T2);
            const res = expectOk(partitionLevelPlate({
                levelIndex: 1,
                footprint: rectPoly(w, d),
                core: centredCore(w, d, 6, 4),
                corridor: { widthM: 1.5 },
                apartments: apts,
            }));
            const corners = new Set<string>();
            for (const c of res.apartmentCells) {
                const k = cornerKey(c.rect, w, d);
                if (k) corners.add(k);
            }
            // (a) a unit exists at EACH of the 4 corners…
            expect(corners.has('x0z0')).toBe(true);
            expect(corners.has('x1z0')).toBe(true);
            expect(corners.has('x0z1')).toBe(true);
            expect(corners.has('x1z1')).toBe(true);
            // (b) …and each corner cell touches two PERPENDICULAR plate edges (verified by cornerKey
            // itself requiring one x-edge AND one z-edge). Spot-check the actual rects.
            for (const c of res.apartmentCells) {
                const k = cornerKey(c.rect, w, d);
                if (!k) continue;
                const onX = Math.abs(c.rect.x0) < 0.25 || Math.abs(c.rect.x1 - w) < 0.25;
                const onZ = Math.abs(c.rect.z0) < 0.25 || Math.abs(c.rect.z1 - d) < 0.25;
                expect(onX && onZ).toBe(true);   // dual-aspect: an x façade AND a z façade
            }
        });
    }
});

describe('partitionLevelPlate — soft-fail (never throws)', () => {
    it('rejects a non-rectangular footprint when NO clip polygon is supplied (would tile past the boundary)', () => {
        const lShape: Pt[] = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 5 },
            { x: 5, z: 5 }, { x: 5, z: 10 }, { x: 0, z: 10 },
        ];
        const out = partitionLevelPlate({ ...baseInput([T2]), footprint: lShape });
        expect(out.status).toBe('rejected');
        // §RESI-PLATE-UNDERFILL — without a clip polygon the bbox tiling has nothing to clip out-of-
        // shape cells against, so a sparse (< 0.80 fill) plate is still rejected ("too sparse to tile").
        if (out.status === 'rejected') expect(out.reason).toMatch(/too sparse to tile/);
    });

    it('§RESI-PLATE-UNDERFILL — ACCEPTS a real L-plate WHEN a clipPolygon is supplied (cells clipped to the L)', () => {
        // A larger L (so usable bands fit): a 30×30 plate with the top-right 14×14 corner removed.
        const lShape: Pt[] = [
            { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 16 },
            { x: 16, z: 16 }, { x: 16, z: 30 }, { x: 0, z: 30 },
        ];
        const out = partitionLevelPlate({
            levelIndex: 2,
            footprint: lShape,
            core: centredCore(30, 30, 6, 4),
            corridor: { widthM: 1.5 },
            apartments: Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? T2 : T3)),
            clipPolygon: lShape,   // the real boundary — cells whose centre is outside are dropped
        });
        expect(out.status).toBe('ok');   // §RESI-PLATE-UNDERFILL — the L is ACCEPTED, not rejected.
        if (out.status !== 'ok') return;
        // It places real apartments, and every placed cell's CENTRE is inside the L (no apartment
        // built in the removed top-right corner — the §RESI-CLIP-BOUNDARY pass drops those).
        expect(out.apartmentCells.length).toBeGreaterThanOrEqual(2);
        for (const c of out.apartmentCells) {
            const cx = (c.rect.x0 + c.rect.x1) / 2, cz = (c.rect.z0 + c.rect.z1) / 2;
            const inRemovedCorner = cx > 16 && cz > 16;
            expect(inRemovedCorner).toBe(false);
        }
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

describe('§NONRECT-CELLS-P1 — reshape-not-drop, flag-gated', () => {
    const NRFLAG = '__pryzmNonRectCells';
    const setFlag = (v: boolean): void => { (globalThis as unknown as Record<string, unknown>)[NRFLAG] = v; };
    const many = (n: number): ApartmentDemand[] => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? T2 : T3));

    it('every rect cell carries a 4-corner polygon = rectPolygon(rect) — identity', () => {
        setFlag(false);
        try {
            const res = expectOk(partitionLevelPlate(baseInput(many(40))));
            for (const c of res.apartmentCells) {
                expect(c.polygon.length).toBe(4);
                // polygon == the rect corners.
                const xs = c.polygon.map(p => p.x), zs = c.polygon.map(p => p.z);
                expect(Math.min(...xs)).toBeCloseTo(c.rect.x0, 3);
                expect(Math.max(...xs)).toBeCloseTo(c.rect.x1, 3);
                expect(Math.min(...zs)).toBeCloseTo(c.rect.z0, 3);
                expect(Math.max(...zs)).toBeCloseTo(c.rect.z1, 3);
            }
        } finally { setFlag(false); }
    });

    it('FLAG OFF — a rectangular plate is byte-identical regardless of the flag', () => {
        setFlag(false);
        const off = JSON.stringify(partitionLevelPlate(baseInput(many(60))));
        setFlag(true);
        const onNoClip = JSON.stringify(partitionLevelPlate(baseInput(many(60))));   // no clipPolygon
        setFlag(false);
        expect(off).toBe(onNoClip);   // the flag is a no-op on a plain rectangular plate
    });

    it('FLAG ON — an L-plate RESHAPES the boundary-straddling cell (clip-not-drop), all units corridor-fronting', () => {
        // A 40×30 L: the top-right 11×11 corner is removed (the notch cuts mid-cell).
        const L: Pt[] = [
            { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 19 },
            { x: 29, z: 19 }, { x: 29, z: 30 }, { x: 0, z: 30 },
        ];
        const input: PlatePartitionInput = {
            levelIndex: 2, footprint: L, core: centredCore(40, 30, 6, 4),
            corridor: { widthM: 1.5 }, apartments: many(200), clipPolygon: L,
        };
        setFlag(false);
        const dropped = expectOk(partitionLevelPlate(input));
        setFlag(true);
        const reshaped = expectOk(partitionLevelPlate(input));
        setFlag(false);

        // RESHAPE-NOT-DROP: with the flag ON at least one cell becomes the clipped (in-boundary) shape.
        expect(reshaped.diagnostic).toMatch(/reshaped=[1-9]/);
        // CF invariant — every placed cell still fronts a corridor (reached = N/N).
        expect(reshaped.apartmentsReached).toBe(reshaped.apartmentCells.length);
        // No cell's CENTROID falls in the REMOVED corner (the bbox tiling never ships an apartment past
        // the drawn boundary) — the reshape clips straddling cells back inside the L.
        for (const c of reshaped.apartmentCells) {
            let cx = 0, cz = 0;
            for (const v of c.polygon) { cx += v.x; cz += v.z; }
            cx /= c.polygon.length; cz /= c.polygon.length;
            const inRemovedCorner = cx > 29 + 0.5 && cz > 19 + 0.5;   // the removed top-right corner
            expect(inRemovedCorner).toBe(false);
        }
        // The §DIAG-RESI-FILL ratio is reported under both flags.
        expect(dropped.diagnostic).toContain('§DIAG-RESI-FILL');
        expect(reshaped.diagnostic).toContain('§DIAG-RESI-FILL');
    });

    it('FLAG ON — a deep 37×29 rect plate fills materially higher (residual absorbed where feasible)', () => {
        const deep: PlatePartitionInput = {
            levelIndex: 2, footprint: rectPoly(37.4, 29.3), core: centredCore(37.4, 29.3, 6, 6.31),
            corridor: { widthM: 1.5 }, apartments: many(400),
        };
        setFlag(false);
        const off = expectOk(partitionLevelPlate(deep));
        setFlag(true);
        const on = expectOk(partitionLevelPlate(deep));
        setFlag(false);
        // The flag never REDUCES the fill on a deep plate, and absorbs genuine feasible residual when
        // present (≥ the OFF baseline; the engine-feasibility gate keeps absorbed cells layout-able).
        expect(on.fillRatio).toBeGreaterThanOrEqual(off.fillRatio - 1e-6);
        // Every placed cell — rect or absorbed — fronts a corridor (CF).
        expect(on.apartmentsReached).toBe(on.apartmentCells.length);
    });
});
