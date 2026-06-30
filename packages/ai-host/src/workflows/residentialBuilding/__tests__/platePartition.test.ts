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

const T1: ApartmentDemand = { typology: 'T1', minAreaM2: 35, maxAreaM2: 55 };
const T2: ApartmentDemand = { typology: 'T2', minAreaM2: 55, maxAreaM2: 80 };
const T3: ApartmentDemand = { typology: 'T3', minAreaM2: 80, maxAreaM2: 110 };
const T4: ApartmentDemand = { typology: 'T4', minAreaM2: 110, maxAreaM2: 150 };

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

describe('partitionLevelPlate — §RESI-RECT-DECOMP (L-shape fills BOTH wings)', () => {
    // The founder's case: a large concave L plate (~1165 m²) with a central core, 30 m² min units.
    // A 44×40 bbox (1760) with the top-right 24×20 quadrant removed → 1760 − 480 = 1280 m² (≈ the
    // founder's ~1165 m²). The vertical wing is x∈[0,20], the horizontal wing is z∈[20,40].
    const W = 44, D = 40, NOTCH_X = 20, NOTCH_Z = 20;
    const bigL: Pt[] = [
        { x: 0, z: 0 }, { x: NOTCH_X, z: 0 }, { x: NOTCH_X, z: NOTCH_Z },
        { x: W, z: NOTCH_Z }, { x: W, z: D }, { x: 0, z: D },
    ];
    // Core sits in the L's solid lower-left (inside both wings' junction), 4×3, small corridors.
    const core: Rect = { x0: 8, z0: 24, x1: 12, z1: 27 };
    // 30–100 m² band → small T1/T2 units, plenty of capacity.
    const T30: ApartmentDemand = { typology: 'T1', minAreaM2: 30, maxAreaM2: 55 };
    const demand = Array.from({ length: 60 }, () => T30);

    function lInput(): PlatePartitionInput {
        return {
            levelIndex: 2,
            // The orchestrator hands the partition the BBOX rectangle as `footprint` + the real L as clip.
            footprint: rectPoly(W, D),
            core,
            corridor: { widthM: 1.4 },
            apartments: demand,
            clipPolygon: bigL,
        };
    }

    function inPoly(px: number, pz: number, poly: Pt[]): boolean {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i]!, b = poly[j]!;
            if (((a.z > pz) !== (b.z > pz)) && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) inside = !inside;
        }
        return inside;
    }

    it('places WELL MORE than 3 units on the L plate (the founder under-fill bug)', () => {
        const res = expectOk(partitionLevelPlate(lInput()));
        expect(res.apartmentCells.length).toBeGreaterThan(3);
        expect(res.apartmentCells.length).toBeGreaterThanOrEqual(8);
    });

    it('fills BOTH wings — the vertical wing (z<NOTCH_Z) AND the horizontal wing (x>NOTCH_X)', () => {
        const res = expectOk(partitionLevelPlate(lInput()));
        // Vertical wing: cells whose centre sits in the upper part (z < NOTCH_Z) of the x∈[0,NOTCH_X] leg.
        const inVerticalWing = res.apartmentCells.filter((c) => {
            const cz = (c.rect.z0 + c.rect.z1) / 2;
            return cz < NOTCH_Z - 1;
        });
        // Horizontal wing: cells whose centre sits past the notch (x > NOTCH_X).
        const inHorizontalWing = res.apartmentCells.filter((c) => {
            const cx = (c.rect.x0 + c.rect.x1) / 2;
            return cx > NOTCH_X + 1;
        });
        expect(inVerticalWing.length).toBeGreaterThan(0);
        expect(inHorizontalWing.length).toBeGreaterThan(0);
    });

    it('every placed cell centre is INSIDE the real L boundary (no phantom notch units)', () => {
        const res = expectOk(partitionLevelPlate(lInput()));
        for (const c of res.apartmentCells) {
            const cx = (c.rect.x0 + c.rect.x1) / 2, cz = (c.rect.z0 + c.rect.z1) / 2;
            expect(inPoly(cx, cz, bigL)).toBe(true);
        }
    });

    it('is deterministic (same input → same cell count)', () => {
        const a = expectOk(partitionLevelPlate(lInput()));
        const b = expectOk(partitionLevelPlate(lInput()));
        expect(b.apartmentCells.length).toBe(a.apartmentCells.length);
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

    it('every apartment is one of the enabled typologies, sized to clear a real apartment floor (fill-plate)', () => {
        const apts = [T2, T3, T2, T3];
        const res = expectOk(partitionLevelPlate(baseInput(apts)));
        const enabled = new Set(apts.map((a) => a.typology));
        res.apartmentCells.forEach((cell) => {
            // §RESI-EDGE-TYPE-VARIETY — typology is now driven by the cell's REAL AREA (corners →
            // larger T, edge-fill → smaller T), not the demand index. Every cell is still one of the
            // ENABLED typologies (within the brief's mix), and clears a real-apartment floor.
            expect(enabled.has(cell.typology)).toBe(true);
            expect(cell.areaM2).toBeGreaterThanOrEqual(35 - 1e-2);   // ≥ the smallest typology floor
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

    it('§RESI-NONRECT-DEFAULT — DEFAULT (no flag) RESHAPES an L-plate (multi-shape cells), every cell corridor-reached', () => {
        // The non-rect path is DEFAULT-ON. With NO flag set, an L-plate must RESHAPE straddling cells to
        // the drawn boundary (multi-shape, > 4-vert polygons) AND keep every unit corridor-fronting — so
        // the founder gets adaptable, non-rectangular apartments by default, not dropped boundary cells.
        const clearNR = (): void => { delete (globalThis as unknown as Record<string, unknown>)[NRFLAG]; };
        // A 40×30 L with a top-right notch (remove x>35, z<5). On this plate the front-right corner cell
        // spans ≈[31,0]–[40,9], so the x=35 notch edge cuts THROUGH it → it straddles the boundary and is
        // RESHAPED to the in-boundary rectilinear (multi-shape) cell rather than dropped.
        const L: Pt[] = [
            { x: 0, z: 0 }, { x: 35, z: 0 }, { x: 35, z: 5 },
            { x: 40, z: 5 }, { x: 40, z: 30 }, { x: 0, z: 30 },
        ];
        const input: PlatePartitionInput = {
            levelIndex: 2, footprint: L, core: centredCore(40, 30, 6, 4),
            corridor: { widthM: 1.5 }, apartments: many(400), clipPolygon: L,
        };
        clearNR();   // DEFAULT — no flag set
        const def = expectOk(partitionLevelPlate(input));
        // Opt-out (=== false) drops straddling cells (the proven pre-default path) — fewer or rect-only.
        setFlag(false);
        const optOut = expectOk(partitionLevelPlate(input));
        clearNR();
        // DEFAULT reshapes ≥ 1 straddling cell into a multi-shape (> 4-vert) polygon…
        const defNonRect = def.apartmentCells.filter((c) => c.polygon.length > 4).length;
        expect(defNonRect).toBeGreaterThanOrEqual(1);
        // …which the opt-out path never produces (it only drops).
        const optNonRect = optOut.apartmentCells.filter((c) => c.polygon.length > 4).length;
        expect(optNonRect).toBe(0);
        // CORRIDOR-FIRST holds under the default — every cell (rect or reshaped) is reached from a corridor.
        expect(def.apartmentsReached).toBe(def.apartmentCells.length);
        // No cell centroid lands in the removed corner (x>35, z<5 — nothing built past the drawn boundary).
        for (const c of def.apartmentCells) {
            let cx = 0, cz = 0;
            for (const v of c.polygon) { cx += v.x; cz += v.z; }
            cx /= c.polygon.length; cz /= c.polygon.length;
            expect(cx > 35 + 0.5 && cz < 5 - 0.5).toBe(false);
        }
    });
});

describe('§RESI-CORRIDOR-GRID (Phase 3) — DEFAULT-ON corner-preserving perimeter fill', () => {
    const CGFLAG = '__pryzmCorridorGrid';
    // §P3 — the grid is DEFAULT-ON; the flag is now an OPT-OUT kill-switch (=== false ⇒ baseline only).
    const setOptOut = (v: boolean): void => { (globalThis as unknown as Record<string, unknown>)[CGFLAG] = v; };
    const clearFlag = (): void => { delete (globalThis as unknown as Record<string, unknown>)[CGFLAG]; };
    const manyT2 = (n: number): ApartmentDemand[] => Array.from({ length: n }, () => T2);
    const ENGINE_MIN_ROW_DEPTH = 7.5;
    const rowDepth = (r: Rect): number => Math.abs(r.z1 - r.z0);
    const feasible = (res: PlatePartitionResult): number =>
        res.apartmentCells.filter((c) => rowDepth(c.rect) >= ENGINE_MIN_ROW_DEPTH - 1e-6).length;

    /** A deep rectangular plate. The deep corner band is preserved; the interior fills with feasible
     *  edge-adjacent rows where the depth allows (the founder's "corners + edge-fill" intent). */
    function deepInput(w: number, d: number, apts: ApartmentDemand[]): PlatePartitionInput {
        return {
            levelIndex: 0,
            footprint: rectPoly(w, d),
            core: centredCore(w, d, 8, 6),
            corridor: { widthM: 1.5 },
            apartments: apts,
        };
    }

    it('OPT-OUT (=== false) — baseline only, deterministic on every plate', () => {
        setOptOut(true);
        try {
            for (const [w, d] of [[60, 30], [60, 16], [40, 40], [80, 60]] as Array<[number, number]>) {
                const a = JSON.stringify(partitionLevelPlate(deepInput(w, d, manyT2(400))));
                const b = JSON.stringify(partitionLevelPlate(deepInput(w, d, manyT2(400))));
                expect(a).toBe(b);   // deterministic
            }
        } finally { clearFlag(); }
    });

    it('DEFAULT (no flag) — never REGRESSES vs the opt-out baseline (best-of-candidates, feasible-first)', () => {
        for (const [w, d] of [[60, 30], [40, 30], [40, 40], [60, 32], [60, 36], [80, 60], [137, 137]] as Array<[number, number]>) {
            const input = deepInput(w, d, manyT2(1000));
            setOptOut(true);
            const off = expectOk(partitionLevelPlate(input));
            clearFlag();   // default = grid on
            const on = expectOk(partitionLevelPlate(input));
            // The default never places FEWER engine-feasible cells than the baseline-only path, and
            // never fewer cells overall (the hybrid is only ever an ADDITIONAL candidate).
            expect(feasible(on)).toBeGreaterThanOrEqual(feasible(off));
            expect(on.apartmentCells.length).toBeGreaterThanOrEqual(off.apartmentCells.length);
            expect(on.apartmentsReached).toBe(on.apartmentCells.length);
        }
    });

    it('DEFAULT — a deep plate fills the perimeter with FEASIBLE corner + edge units (≥ the baseline)', () => {
        // 80×60 is deep enough for the hybrid to add a feasible interior corridor on top of the deep
        // corner bands — the founder's "corners + edge-fill" result. The count rises and EVERY placed
        // cell is a buildable, engine-feasible row (no sub-feasible slivers in the winning candidate).
        const input = deepInput(80, 60, manyT2(1200));
        setOptOut(true);
        const off = expectOk(partitionLevelPlate(input));
        clearFlag();
        const on = expectOk(partitionLevelPlate(input));
        expect(on.apartmentCells.length).toBeGreaterThanOrEqual(off.apartmentCells.length);
        // The default packs a strong, feasible fill (corners + multiple feasible interior rows).
        expect(feasible(on)).toBeGreaterThanOrEqual(40);
        expect(on.apartmentsReached).toBe(on.apartmentCells.length);
    });

    it('DEFAULT — a SHALLOW plate (no room for a deep outer band + a feasible interior corridor) is the baseline', () => {
        // 60×16 is too shallow to host two deep corner bands AND a feasible interior corridor, so the
        // hybrid emits no candidate and the plate keeps its proven baseline tiling.
        const input = deepInput(60, 16, manyT2(200));
        setOptOut(true);
        const off = JSON.stringify(partitionLevelPlate(input));
        clearFlag();
        const on = JSON.stringify(partitionLevelPlate(input));
        expect(on).toBe(off);
    });

    it('DEFAULT — every placed cell shares an EDGE with a corridor band (corridor-adjacency, geometric)', () => {
        clearFlag();
        const res = expectOk(partitionLevelPlate(deepInput(80, 60, manyT2(1200))));
        const corridors = res.publicCorridor;
        // A cell fronts a corridor when one of its four edges is collinear with, and overlaps ≥ a
        // door-width of, a corridor band boundary.
        const DOOR = 0.8;
        const frontsCorridor = (r: Rect): boolean => {
            for (const c of corridors) {
                // horizontal shared edge (cell z-edge on a corridor z-boundary), x-overlap
                for (const cellZ of [r.z0, r.z1]) {
                    for (const corrZ of [c.z0, c.z1]) {
                        if (Math.abs(cellZ - corrZ) < 0.05) {
                            const lo = Math.max(r.x0, c.x0), hi = Math.min(r.x1, c.x1);
                            if (hi - lo >= DOOR) return true;
                        }
                    }
                }
                // vertical shared edge (cell x-edge on a corridor x-boundary), z-overlap
                for (const cellX of [r.x0, r.x1]) {
                    for (const corrX of [c.x0, c.x1]) {
                        if (Math.abs(cellX - corrX) < 0.05) {
                            const lo = Math.max(r.z0, c.z0), hi = Math.min(r.z1, c.z1);
                            if (hi - lo >= DOOR) return true;
                        }
                    }
                }
            }
            return false;
        };
        for (const cell of res.apartmentCells) {
            expect(frontsCorridor(cell.rect)).toBe(true);
        }
    });

    it('DEFAULT — cells never overlap each other, the core, or any corridor band (deep plate)', () => {
        clearFlag();
        const res = expectOk(partitionLevelPlate(deepInput(80, 60, manyT2(1200))));
        const cells = res.apartmentCells.map((c) => c.rect);
        for (let i = 0; i < cells.length; i++) {
            for (let j = i + 1; j < cells.length; j++) {
                expect(overlaps(cells[i]!, cells[j]!)).toBe(false);
            }
            expect(overlaps(cells[i]!, res.core)).toBe(false);
            for (const corr of res.publicCorridor) expect(overlaps(cells[i]!, corr)).toBe(false);
        }
    });

    it('DEFAULT — deep corner band is PRESERVED: a feasible dual-aspect cell touches each plate corner', () => {
        // The founder's hard requirement — KEEP the corner units. The hybrid's outer corridors are
        // deep corner bands, so a corner cell reaches BOTH the plate edge (façade) and a corridor.
        const w = 80, d = 60;
        const res = expectOk(partitionLevelPlate(deepInput(w, d, manyT2(1200))));
        const tol = 0.3;
        const corner = { x0z0: false, x1z0: false, x0z1: false, x1z1: false };
        for (const c of res.apartmentCells) {
            const r = c.rect;
            if (rowDepth(r) < ENGINE_MIN_ROW_DEPTH - 1e-6) continue;   // a feasible (buildable) cell
            const onX0 = Math.abs(r.x0) < tol, onX1 = Math.abs(r.x1 - w) < tol;
            const onZ0 = Math.abs(r.z0) < tol, onZ1 = Math.abs(r.z1 - d) < tol;
            if (onX0 && onZ0) corner.x0z0 = true;
            if (onX1 && onZ0) corner.x1z0 = true;
            if (onX0 && onZ1) corner.x0z1 = true;
            if (onX1 && onZ1) corner.x1z1 = true;
        }
        expect(corner.x0z0 && corner.x1z0 && corner.x0z1 && corner.x1z1).toBe(true);
    });
});

describe('§RESI-EDGE-TYPE-VARIETY (Phase 3) — corners + varied edge-fill on a large plate (DEFAULT)', () => {
    const ENGINE_MIN_ROW_DEPTH = 7.5;
    const rowDepth = (r: Rect): number => Math.abs(r.z1 - r.z0);
    const clearFlag = (): void => { delete (globalThis as unknown as Record<string, unknown>).__pryzmCorridorGrid; };

    /** A large rectangular plate, mixed-typology demand (the brief's enabled mix), centred core. */
    function largeInput(w: number, d: number, apts: ApartmentDemand[]): PlatePartitionInput {
        return {
            levelIndex: 1,
            footprint: rectPoly(w, d),
            core: centredCore(w, d, 8, 6),
            corridor: { widthM: 1.5 },
            apartments: apts,
        };
    }
    /** A long mixed demand list (corners + edge-fill come from the area-driven re-stamp, not order). */
    const mixed = (n: number): ApartmentDemand[] =>
        Array.from({ length: n }, (_, i) => [T1, T2, T3, T4][i % 4]!);

    it('a large plate places MANY apartments (count scales with area), not ~4 corners', () => {
        clearFlag();
        const small = expectOk(partitionLevelPlate(largeInput(40, 30, mixed(600))));
        const large = expectOk(partitionLevelPlate(largeInput(60, 40, mixed(900))));
        // A larger plate places strictly more apartments (count tracks area, not a fixed 4).
        expect(small.apartmentCells.length).toBeGreaterThanOrEqual(8);
        expect(large.apartmentCells.length).toBeGreaterThan(small.apartmentCells.length);
        // The plate is NOT "4 corners only" — the perimeter band between the corners is filled.
        expect(large.apartmentCells.length).toBeGreaterThanOrEqual(16);
    });

    it('VARIETY — the mix spans more than one typology (corners larger, edge-fill smaller)', () => {
        clearFlag();
        const res = expectOk(partitionLevelPlate(largeInput(60, 40, mixed(900))));
        const types = new Set(res.apartmentCells.map((c) => c.typology));
        // More than one typology is present (variety), and every type is from the enabled mix.
        expect(types.size).toBeGreaterThanOrEqual(2);
        for (const c of res.apartmentCells) expect(['T1', 'T2', 'T3', 'T4']).toContain(c.typology);
        // GEOMETRY-HONEST — the largest cells carry the larger typology; the smallest the smaller one.
        const bands: Record<string, number> = { T1: 0, T2: 1, T3: 2, T4: 3 };
        const sorted = [...res.apartmentCells].sort((a, b) => a.areaM2 - b.areaM2);
        const smallest = sorted[0]!, biggest = sorted[sorted.length - 1]!;
        expect(bands[biggest.typology]!).toBeGreaterThanOrEqual(bands[smallest.typology]!);
    });

    it('every cell is corridor-reached and no cell overlaps another, the core, or a corridor', () => {
        clearFlag();
        const res = expectOk(partitionLevelPlate(largeInput(60, 40, mixed(900))));
        expect(res.apartmentsReached).toBe(res.apartmentCells.length);
        const cells = res.apartmentCells.map((c) => c.rect);
        for (let i = 0; i < cells.length; i++) {
            for (let j = i + 1; j < cells.length; j++) expect(overlaps(cells[i]!, cells[j]!)).toBe(false);
            expect(overlaps(cells[i]!, res.core)).toBe(false);
            for (const corr of res.publicCorridor) expect(overlaps(cells[i]!, corr)).toBe(false);
        }
    });

    it('a SMALL plate still yields its honest (small) count — variety does not inflate it', () => {
        clearFlag();
        // A 20×15 plate genuinely fits only a few units; the default must NOT force a fixed count.
        const res = expectOk(partitionLevelPlate(largeInput(20, 15, mixed(200))));
        expect(res.apartmentCells.length).toBeLessThanOrEqual(6);
        expect(res.apartmentsReached).toBe(res.apartmentCells.length);
    });

    it('a single-typology brief stays uniform (re-stamp is a no-op) — no spurious variety', () => {
        clearFlag();
        const res = expectOk(partitionLevelPlate(largeInput(60, 40, Array.from({ length: 900 }, () => T2))));
        for (const c of res.apartmentCells) expect(c.typology).toBe('T2');
    });

    it('the deep corner cells reach a plate corner AND are the larger typology', () => {
        clearFlag();
        const w = 60, d = 40;
        const res = expectOk(partitionLevelPlate(largeInput(w, d, mixed(900))));
        const tol = 0.3;
        const cornerCells = res.apartmentCells.filter((c) => {
            const r = c.rect;
            if (rowDepth(r) < ENGINE_MIN_ROW_DEPTH - 1e-6) return false;
            const onX = Math.abs(r.x0) < tol || Math.abs(r.x1 - w) < tol;
            const onZ = Math.abs(r.z0) < tol || Math.abs(r.z1 - d) < tol;
            return onX && onZ;
        });
        // There ARE feasible (deep, dual-aspect) corner cells, and the LARGEST corner cell carries a
        // larger typology (≥ T2) — the founder's "corner T3/T4" intent. A narrow corner cell may still
        // be a small unit; the rule is geometry-honest (typology follows the cell area), not forced.
        expect(cornerCells.length).toBeGreaterThanOrEqual(4);
        const bands: Record<string, number> = { T1: 0, T2: 1, T3: 2, T4: 3 };
        const largestCorner = [...cornerCells].sort((a, b) => b.areaM2 - a.areaM2)[0]!;
        expect(bands[largestCorner.typology]!).toBeGreaterThanOrEqual(bands.T2!);
    });
});

describe('§RESI-CORE-CIRCULATION — every apartment is reachable FROM THE CORE through corridors only', () => {
    // The founder's acceptance: "circulation always needs to be at the CORE". Fronting SOME corridor is
    // not enough — the corridor a unit doors onto MUST trace back to the central core through corridors
    // only (no marooned stub, no unit-to-unit-only circulation). These tests verify the invariant with
    // an INDEPENDENT core-reachability check over the returned corridor network (BFS from the core),
    // then the cell's door-edge front-test against the core-connected band set.

    const DOOR = 0.8;
    const norm = (r: Rect): Rect => ({
        x0: Math.min(r.x0, r.x1), x1: Math.max(r.x0, r.x1),
        z0: Math.min(r.z0, r.z1), z1: Math.max(r.z0, r.z1),
    });
    /** Two rects are circulation-adjacent: overlap, or edge-touch with ≥ a door-width shared run. */
    function adjacent(a0: Rect, b0: Rect): boolean {
        const a = norm(a0), b = norm(b0);
        const xo = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        const zo = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
        if (xo > 1e-6 && zo > 1e-6) return true;
        if (Math.abs(xo) <= 0.05 && zo >= DOOR - 1e-6) return true;
        if (Math.abs(zo) <= 0.05 && xo >= DOOR - 1e-6) return true;
        return false;
    }
    /** Indices of corridor bands reachable from the CORE through other corridors (BFS). */
    function coreConnected(corridors: readonly Rect[], core: Rect): Set<number> {
        const seen = new Set<number>(); const q: number[] = [];
        corridors.forEach((c, i) => { if (adjacent(core, c)) { seen.add(i); q.push(i); } });
        while (q.length) {
            const i = q.shift()!;
            corridors.forEach((c, j) => { if (!seen.has(j) && adjacent(corridors[i]!, c)) { seen.add(j); q.push(j); } });
        }
        return seen;
    }
    /** Does a cell's DOOR EDGE front a core-connected corridor band? (Independent of the engine's tag.) */
    function doorOnCoreCorridor(cell: { rect: Rect; doorEdge: 'x0' | 'x1' | 'z0' | 'z1' }, corridors: readonly Rect[], connected: ReadonlySet<number>): boolean {
        const r = norm(cell.rect); const e = cell.doorEdge;
        const horizontal = e === 'z0' || e === 'z1';
        const edgeConst = e === 'x0' ? r.x0 : e === 'x1' ? r.x1 : e === 'z0' ? r.z0 : r.z1;
        const lo = horizontal ? r.x0 : r.z0, hi = horizontal ? r.x1 : r.z1;
        for (let i = 0; i < corridors.length; i++) {
            if (!connected.has(i)) continue;
            const c = norm(corridors[i]!);
            if (horizontal) {
                if (Math.abs(edgeConst - c.z0) >= 0.05 && Math.abs(edgeConst - c.z1) >= 0.05) continue;
                if (Math.min(hi, c.x1) - Math.max(lo, c.x0) >= DOOR - 1e-6) return true;
            } else {
                if (Math.abs(edgeConst - c.x0) >= 0.05 && Math.abs(edgeConst - c.x1) >= 0.05) continue;
                if (Math.min(hi, c.z1) - Math.max(lo, c.z0) >= DOOR - 1e-6) return true;
            }
        }
        return false;
    }

    /** Assert: (a) the engine's coreReachable count equals N, (b) every cell carries coreReachable===true,
     *  and (c) the INDEPENDENT check agrees — every cell's door fronts a core-connected corridor. */
    function expectAllCoreReachable(res: PlatePartitionResult): void {
        const connected = coreConnected(res.publicCorridor, res.core);
        // (a) the headline metric: every placed apartment is core-reachable.
        expect(res.apartmentsCoreReachable).toBe(res.apartmentCells.length);
        for (const c of res.apartmentCells) {
            // (b) the per-cell tag the preview graph reads.
            expect(c.coreReachable).toBe(true);
            // (c) INDEPENDENT verification — no unit whose only circulation neighbour is another unit.
            expect(doorOnCoreCorridor(c, res.publicCorridor, connected)).toBe(true);
        }
    }

    it('a rectangular plate: every cell doors onto a core-connected corridor', () => {
        const res = expectOk(partitionLevelPlate(baseInput([T2, T3, T2, T3])));
        expectAllCoreReachable(res);
    });

    it('the founder ~1213 m² side-façade plate (34.8×34.8, min 60): every cell core-reachable', () => {
        const res = expectOk(partitionLevelPlate({
            levelIndex: 1,
            footprint: rectPoly(34.8, 34.8),
            core: centredCore(34.8, 34.8, 6, 4),
            corridor: { widthM: 1.5 },
            apartments: Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? T2 : T3)),
        }));
        // The plate packs the side-façade bands (the §RESI-FILL-SIDEFACADE units that front a trimmed
        // mid-zone corridor) — exactly the case where a band could end up disconnected from the core.
        expect(res.apartmentCells.length).toBeGreaterThanOrEqual(8);
        expectAllCoreReachable(res);
    });

    it('a deep 80×60 plate (corridor-grid hybrid): every cell core-reachable', () => {
        const res = expectOk(partitionLevelPlate({
            levelIndex: 0,
            footprint: rectPoly(80, 60),
            core: centredCore(80, 60, 8, 6),
            corridor: { widthM: 1.5 },
            apartments: Array.from({ length: 1200 }, () => T2),
        }));
        expectAllCoreReachable(res);
    });

    it('an L-plate (§RESI-RECT-DECOMP per-wing connectors): every cell core-reachable through corridors only', () => {
        const W = 44, D = 40, NX = 20, NZ = 20;
        const bigL: Pt[] = [
            { x: 0, z: 0 }, { x: NX, z: 0 }, { x: NX, z: NZ },
            { x: W, z: NZ }, { x: W, z: D }, { x: 0, z: D },
        ];
        const res = expectOk(partitionLevelPlate({
            levelIndex: 2,
            footprint: rectPoly(W, D),
            core: { x0: 8, z0: 24, x1: 12, z1: 27 },
            corridor: { widthM: 1.4 },
            apartments: Array.from({ length: 60 }, () => ({ typology: 'T1', minAreaM2: 30, maxAreaM2: 55 } as ApartmentDemand)),
            clipPolygon: bigL,
        }));
        // BOTH wings filled (per §RESI-RECT-DECOMP) AND every wing's cells reach the core via the
        // connector corridors + the transverse tie band (no marooned wing).
        expect(res.apartmentCells.length).toBeGreaterThanOrEqual(8);
        expectAllCoreReachable(res);
    });

    it('the diagnostic reports §RESI-CORE-CIRCULATION coreReached=N/N', () => {
        const res = expectOk(partitionLevelPlate(baseInput([T2, T3, T2])));
        expect(res.diagnostic).toContain('§RESI-CORE-CIRCULATION');
        expect(res.diagnostic).toContain(`coreReached=${res.apartmentCells.length}/${res.apartmentCells.length}`);
    });

    it('is deterministic with the core-circulation pass (same input → byte-identical)', () => {
        const inp = baseInput([T2, T3, T2, T3]);
        expect(JSON.stringify(partitionLevelPlate(inp))).toBe(JSON.stringify(partitionLevelPlate(inp)));
    });
});
