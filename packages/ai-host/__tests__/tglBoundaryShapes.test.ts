// LAYOUT-QUALITY-DEEP (2026-06-04) — the apartment generator must lay rooms inside
// the ACTUAL drawn boundary polygon, not collapse to a bounding rectangle.
//
// These tests pin the three target shape classes end-to-end through the offline
// D-TGL engine (generateDeterministicLayouts):
//   • rectilinear L / U / T shells — decompose into cells, rooms tile the real
//     shape, NOTHING pokes into the notch;
//   • a SKEWED (off-axis) quad — the principal-axis pre-rotation lays rooms that
//     follow the plot orientation (rooms inside the real polygon, no 1-room bailout).
// Plus unit tests for the new principal-axis rotation helpers.

import { describe, expect, it } from 'vitest';
import {
    decomposeToRects, rectArea, rectCenter, polygonBBox,
    principalAxisAngle, rotatePoly, rotatePt,
    type Pt, type Rect,
} from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import { generateDeterministicLayouts } from '../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentConstraints, ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

const sumArea = (rs: Rect[]): number => rs.reduce((s, r) => s + rectArea(r), 0);

/** Shoelace area (m²) of an arbitrary simple polygon. */
function polyArea(poly: readonly Pt[]): number {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

/** Even-odd point-in-polygon (metres, plan frame). */
function pointInPoly(pt: { x: number; z: number }, poly: readonly Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const pi = poly[i]!, pj = poly[j]!;
        const intersect = (pi.z > pt.z) !== (pj.z > pt.z) &&
            pt.x < ((pj.x - pi.x) * (pt.z - pi.z)) / (pj.z - pi.z) + pi.x;
        if (intersect) inside = !inside;
    }
    return inside;
}

/** A LayoutOption's interior rooms, mapped to metre-frame centroids ({x,z}). */
function roomCentroidsM(rooms: { centroid?: { x: number; y: number } }[]): { x: number; z: number }[] {
    return rooms
        .filter(r => r.centroid)
        .map(r => ({ x: r.centroid!.x / 1000, z: r.centroid!.y / 1000 }));
}

// ── principal-axis helpers ──────────────────────────────────────────────────
describe('principalAxisAngle / rotate helpers (§PRINCIPAL-AXIS)', () => {
    it('an axis-aligned rectangle returns ≈ 0 (no rotation)', () => {
        const rect: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }];
        expect(Math.abs(principalAxisAngle(rect))).toBeLessThan(1e-6);
    });

    it('an L-shape (rectilinear) returns ≈ 0 — already axis-aligned', () => {
        const L: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 6 }, { x: 6, z: 6 }, { x: 6, z: 10 }, { x: 0, z: 10 }];
        expect(Math.abs(principalAxisAngle(L))).toBeLessThan(1e-6);
    });

    it('a rectangle rotated by θ recovers −θ (so rotating by −angle re-aligns it)', () => {
        const rect: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }];
        const theta = 0.35;                               // ~20°
        const rotated = rotatePoly(rect, theta, { x: 5, z: 4 });
        const recovered = principalAxisAngle(rotated);
        expect(recovered).toBeCloseTo(theta, 4);
        // Rotating back by −recovered lands the edges on the axes again.
        const realigned = rotatePoly(rotated, -recovered, { x: 5, z: 4 });
        // Every edge of a re-aligned rectangle is horizontal or vertical.
        for (let i = 0; i < realigned.length; i++) {
            const a = realigned[i]!, b = realigned[(i + 1) % realigned.length]!;
            const dx = Math.abs(b.x - a.x), dz = Math.abs(b.z - a.z);
            expect(Math.min(dx, dz)).toBeLessThan(1e-6);  // one component ≈ 0 → axis-aligned
        }
    });

    it('rotatePt is an exact inverse with the negated angle', () => {
        const p: Pt = { x: 3, z: 7 };
        const about: Pt = { x: 1, z: 1 };
        const there = rotatePt(p, 0.6, about);
        const back = rotatePt(there, -0.6, about);
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.z).toBeCloseTo(p.z, 9);
    });
});

// ── rectilinear decomposition for U / T (L already covered elsewhere) ────────
describe('decomposeToRects — U and T shells (§rectilinear)', () => {
    it('a U-shape → cells covering the U area, none in the central notch', () => {
        // 12 wide × 10 deep U: a 4-wide × 6-deep notch cut from the TOP-CENTRE.
        // Area = 120 − (4 × 6) = 96.
        const U: Pt[] = [
            { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 },
            { x: 8, z: 10 }, { x: 8, z: 4 }, { x: 4, z: 4 }, { x: 4, z: 10 }, { x: 0, z: 10 },
        ];
        const rs = decomposeToRects(U);
        expect(rs.length).toBeGreaterThanOrEqual(3);
        expect(sumArea(rs)).toBeCloseTo(96, 4);
        // No rect centre in the notch (4<x<8 AND z>4).
        for (const r of rs) {
            const c = rectCenter(r);
            expect(c.x > 4 && c.x < 8 && c.z > 4).toBe(false);
        }
    });

    it('a T-shape → cells covering the T area, none in either shoulder notch', () => {
        // T: full-width bar 12×4 along the bottom, a 4-wide stem rising to z=10
        // centred on x∈[4,8]. Area = (12×4) + (4×6) = 72.
        const T: Pt[] = [
            { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 4 },
            { x: 8, z: 4 }, { x: 8, z: 10 }, { x: 4, z: 10 }, { x: 4, z: 4 }, { x: 0, z: 4 },
        ];
        const rs = decomposeToRects(T);
        expect(rs.length).toBeGreaterThanOrEqual(3);
        expect(sumArea(rs)).toBeCloseTo(72, 4);
        // No rect centre in either shoulder (z>4 AND (x<4 OR x>8)).
        for (const r of rs) {
            const c = rectCenter(r);
            expect(c.z > 4 && (c.x < 4 || c.x > 8)).toBe(false);
        }
    });
});

// ── end-to-end: rooms land INSIDE the real polygon, no 1-room bailout ────────
describe('generateDeterministicLayouts — real-boundary placement (LAYOUT-QUALITY-DEEP)', () => {
    const make = (poly: Pt[]): ShellAnalysis => ({
        netAreaM2: polyArea(poly),
        widthM: Math.max(...poly.map(p => p.x)) - Math.min(...poly.map(p => p.x)),
        depthM: Math.max(...poly.map(p => p.z)) - Math.min(...poly.map(p => p.z)),
        perimeter: poly,
        faces: [],
    });

    it('L-shape: multiple rooms, all centroids inside the real L (not the bbox)', () => {
        // 11×11 square minus a 5×5 top-right notch → 121 − 25 = 96 m² (2-bed band).
        const L: Pt[] = [
            { x: 0, z: 0 }, { x: 11, z: 0 }, { x: 11, z: 6 },
            { x: 6, z: 6 }, { x: 6, z: 11 }, { x: 0, z: 11 },
        ];
        const out = generateDeterministicLayouts(make(L), PROGRAM, CONSTRAINTS, WEIGHTS, 3);
        expect(out.length).toBeGreaterThan(0);
        const best = out[0]!;
        // NOT the 1-room bailout — a real multi-room plan with partitions.
        expect(best.rooms.length).toBeGreaterThanOrEqual(3);
        expect(best.walls.length).toBeGreaterThan(0);
        // Every interior room centroid lies inside the real L polygon — i.e. NOT in
        // the notch (the bounding-rect bailout would place rooms there).
        for (const c of roomCentroidsM(best.rooms)) {
            expect(pointInPoly(c, L), `centroid (${c.x},${c.z}) inside L`).toBe(true);
        }
    });

    it('U-shape: multiple rooms, no room centroid in the central notch', () => {
        // 12×10 (=120) minus a 4×5 top-centre notch → 120 − 20 = 100 m² (2-bed band).
        const U: Pt[] = [
            { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 },
            { x: 8, z: 10 }, { x: 8, z: 5 }, { x: 4, z: 5 }, { x: 4, z: 10 }, { x: 0, z: 10 },
        ];
        const out = generateDeterministicLayouts(make(U), PROGRAM, CONSTRAINTS, WEIGHTS, 3);
        expect(out.length).toBeGreaterThan(0);
        const best = out[0]!;
        expect(best.rooms.length).toBeGreaterThanOrEqual(3);
        for (const c of roomCentroidsM(best.rooms)) {
            expect(pointInPoly(c, U), `centroid (${c.x},${c.z}) inside U`).toBe(true);
        }
    });

    it('skewed quad: principal-axis rotation lays rooms inside the real (off-axis) plot', () => {
        // A 12×9 (=108 m², 2-bed band) rectangle rotated ~22° about its centre — a
        // realistic off-axis plot drawn on the GIS map.
        const base: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 0, z: 9 }];
        const theta = 0.38;                               // ~22°
        const skewed = rotatePoly(base, theta, { x: 6, z: 4.5 });

        // The drawn area is preserved (rotation is rigid); the bbox is much larger,
        // so a bounding-rect layout would place rooms OUTSIDE the real plot.
        const trueArea = polyArea(skewed);
        expect(trueArea).toBeCloseTo(108, 3);
        const bb = polygonBBox(skewed);
        expect(rectArea(bb)).toBeGreaterThan(trueArea * 1.15);   // bbox ≫ real area

        const out = generateDeterministicLayouts(make(skewed), PROGRAM, CONSTRAINTS, WEIGHTS, 3);
        // No 1-room bailout — the rotation recovers a real multi-room plan.
        expect(out.length).toBeGreaterThan(0);
        const best = out[0]!;
        expect(best.rooms.length).toBeGreaterThanOrEqual(3);
        expect(best.walls.length).toBeGreaterThan(0);
        // Walls are NOT axis-aligned — they follow the plot's rotated orientation.
        const anyRotated = best.walls.some(w => {
            const dx = Math.abs(w.end.x - w.start.x), dy = Math.abs(w.end.y - w.start.y);
            return Math.min(dx, dy) > 100;                 // >0.1 m off-axis component
        });
        expect(anyRotated).toBe(true);
        // Rooms follow the plot orientation: interior centroids lie inside the real
        // skewed polygon (a bounding-rect layout would scatter them into the bbox
        // corners that the real plot does not cover).
        const centroids = roomCentroidsM(best.rooms);
        expect(centroids.length).toBeGreaterThanOrEqual(3);
        const insideCount = centroids.filter(c => pointInPoly(c, skewed)).length;
        expect(insideCount / centroids.length).toBeGreaterThanOrEqual(0.8);
    });

    it('is deterministic for a skewed plot (rotation is derived, not random)', () => {
        const base: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 9 }, { x: 0, z: 9 }];
        const skewed = rotatePoly(base, 0.38, { x: 6, z: 4.5 });
        const shell = make(skewed);
        const a = generateDeterministicLayouts(shell, PROGRAM, CONSTRAINTS, WEIGHTS, 2);
        const b = generateDeterministicLayouts(shell, PROGRAM, CONSTRAINTS, WEIGHTS, 2);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('an axis-aligned rectangle is UNCHANGED by the principal-axis pass (no regression)', () => {
        // bbox shell identical to the existing tglRunDeterministicLayout fixture.
        const rect: Pt[] = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }];
        const shell: ShellAnalysis = { netAreaM2: 120, widthM: 12, depthM: 10, perimeter: rect, faces: [] };
        const out = generateDeterministicLayouts(shell, PROGRAM, CONSTRAINTS, WEIGHTS, 3);
        expect(out.length).toBeGreaterThan(0);
        // All walls axis-aligned (angle === 0 → emitted geometry is not rotated).
        for (const w of out[0]!.walls) {
            const dx = Math.abs(w.end.x - w.start.x), dy = Math.abs(w.end.y - w.start.y);
            expect(Math.min(dx, dy)).toBeLessThan(1e-3);
        }
        const bb = polygonBBox(rect);
        for (const c of roomCentroidsM(out[0]!.rooms)) {
            expect(c.x).toBeGreaterThanOrEqual(bb.x0 - 1e-3);
            expect(c.x).toBeLessThanOrEqual(bb.x1 + 1e-3);
            expect(c.z).toBeGreaterThanOrEqual(bb.z0 - 1e-3);
            expect(c.z).toBeLessThanOrEqual(bb.z1 + 1e-3);
        }
    });
});
