// §FIX-FORMA-FACADE-ANALYSIS-QUALITY-PER-FACE (L-199) — unit tests for the PURE real-model
// drape builder. It resamples the (byte-identical BVH, ADR-0110) per-face + roof sun-hours
// intensities into a PER-FACE PLANAR wall ATLAS (each face = its own gradient cell, U =
// along-face, V = height) + a FACE TABLE (16-bit endpoints the shader uses to pick the nearest
// face) + a top-down roof lookup, that a Cesium CustomShader drapes onto the REAL placed GLB.
//
// This REPLACES L-177's CYLINDRICAL wall unwrap (U = centroid-angle), whose pole singularity at
// the footprint centre read as radial spikes from the roof apex and smeared across faces on a
// non-cylindrical (rectangular + balconied) tower. The tests pin the new per-face planar mapping:
// each face gets its own sub-texture, openings mask to alpha 0, and there is NO angular wrap
// (a face's cell is independent of every other face's direction). No Cesium / THREE / DOM here.

import { describe, it, expect } from 'vitest';
import {
    buildRealModelSunDrape,
    type FacadeDrapeFace,
} from '../src/ui/climate/siteMetricGrids';

// A unit square footprint centred on the origin (metric east=x, north=z), height 10 m.
// Four faces (CCW): south, east, north, west. Each face intensity = a constant so we can
// assert the drape samples the RIGHT face into the RIGHT atlas cell (planar, no wrap).
function squareFaces(intensityByFace: [number, number, number, number]): FacadeDrapeFace[] {
    const c = [
        { ax: -5, az: -5, bx: 5, bz: -5 }, // south edge (z=-5)
        { ax: 5, az: -5, bx: 5, bz: 5 },   // east edge (x=+5)
        { ax: 5, az: 5, bx: -5, bz: 5 },   // north edge (z=+5)
        { ax: -5, az: 5, bx: -5, bz: -5 }, // west edge (x=-5)
    ];
    return c.map((e, i) => ({
        ...e, nU: 2, nV: 2,
        intensities: new Array(4).fill(intensityByFace[i]) as number[],
        openings: [],
    }));
}

const ROOF = {
    roofIntensities: [1, 1, 1, 1], roofNU: 2, roofNV: 2,
    roofMinE: -5, roofMinN: -5, roofSpanE: 10, roofSpanN: 10,
};

/** Mirror the shader's 16-bit decode (hi,lo bytes → metres over ±encodeRange). */
function dec16(hi: number, lo: number, encodeRange: number): number {
    const u16 = hi * 256 + lo;
    return (u16 / 65535 * 2 - 1) * encodeRange;
}

describe('§FIX-FORMA-FACADE-ANALYSIS-QUALITY-PER-FACE buildRealModelSunDrape', () => {
    it('packs one PLANAR cell per face into a horizontal wall atlas (wallW = faceCount·cellW)', () => {
        const drape = buildRealModelSunDrape({
            faces: squareFaces([0.1, 0.4, 0.7, 1.0]),
            centroidE: 0, centroidN: 0, heightM: 10,
            ...ROOF, cellWidth: 16, cellHeight: 32, roofSize: 16, vivid: false,
        });
        expect(drape.faceCount).toBe(4);
        expect(drape.cellW).toBe(16);
        expect(drape.cellH).toBe(32);
        expect(drape.wallW).toBe(4 * 16); // atlas = faceCount · cellW
        expect(drape.wallH).toBe(32);
        expect(drape.wallRgba.length).toBe(64 * 32 * 4);
        expect(drape.roofRgba.length).toBe(16 * 16 * 4);
        expect(drape.wallLitTexels).toBeGreaterThan(0);
        // Metadata carries the shader frame through.
        expect(drape.centroidE).toBe(0);
        expect(drape.heightM).toBe(10);
    });

    // Sample the CENTRE texel of face `fi`'s atlas cell.
    const cellCentre = (
        drape: ReturnType<typeof buildRealModelSunDrape>, fi: number,
    ): [number, number, number, number] => {
        const tx = fi * drape.cellW + Math.floor(drape.cellW / 2);
        const ty = Math.floor(drape.cellH / 2);
        const o = (ty * drape.wallW + tx) * 4;
        return [drape.wallRgba[o]!, drape.wallRgba[o + 1]!, drape.wallRgba[o + 2]!, drape.wallRgba[o + 3]!];
    };

    it('gives each face its OWN cell (constant-intensity faces → uniform, monotone-by-sun cells, no wrap)', () => {
        const drape = buildRealModelSunDrape({
            faces: squareFaces([0.1, 0.4, 0.7, 1.0]),
            centroidE: 0, centroidN: 0, heightM: 10,
            ...ROOF, cellWidth: 16, cellHeight: 8, vivid: false,
        });
        const red = [0, 1, 2, 3].map((fi) => cellCentre(drape, fi)[0]);
        // The RED channel rises with sun-hours (same ramp as the ground heatmap): 0.1<0.4<0.7<1.0.
        expect(red[0]!).toBeLessThan(red[1]!);
        expect(red[1]!).toBeLessThan(red[2]!);
        expect(red[2]!).toBeLessThan(red[3]!);
        // Each face's cell is UNIFORM (constant intensity → constant colour across the whole cell):
        // proves the value came from THIS face's planar sample, not an angular blend of neighbours.
        const fi = 3;
        const sample = (tx: number, ty: number): number =>
            drape.wallRgba[(ty * drape.wallW + tx) * 4]!;
        const left = sample(fi * drape.cellW + 1, 1);
        const right = sample(fi * drape.cellW + drape.cellW - 2, drape.cellH - 2);
        expect(left).toBe(right);
    });

    it('maps intensity PLANARLY along the face (a horizontal gradient rises left→right in its cell)', () => {
        // One face with a left→right intensity gradient (nU = 2: u=0 → 0.0, u=1 → 1.0).
        const gradientFace: FacadeDrapeFace = {
            ax: -10, az: -5, bx: 10, bz: -5, nU: 2, nV: 2,
            intensities: [0.0, 1.0, 0.0, 1.0], // [v0u0, v0u1, v1u0, v1u1]
            openings: [],
        };
        const drape = buildRealModelSunDrape({
            faces: [gradientFace],
            centroidE: 0, centroidN: 0, heightM: 10,
            ...ROOF, cellWidth: 32, cellHeight: 8, vivid: false,
        });
        const redAt = (uCol: number): number =>
            drape.wallRgba[(4 * drape.wallW + uCol) * 4]!; // mid row
        expect(redAt(1)).toBeLessThan(redAt(drape.cellW - 2)); // planar U gradient, no angular distortion
    });

    it('punches authored openings as transparent (alpha 0) holes on the face cell', () => {
        // South face carries one opening covering its full width, sill 0.3..0.7 of height.
        const faces = squareFaces([0.5, 0.5, 0.5, 0.5]);
        const withOpening: FacadeDrapeFace[] = faces.map((f, i) =>
            i === 0 ? { ...f, openings: [{ u0: 0, u1: 1, v0: 0.3, v1: 0.7 }] } : f);
        const drape = buildRealModelSunDrape({
            faces: withOpening,
            centroidE: 0, centroidN: 0, heightM: 10,
            ...ROOF, cellWidth: 8, cellHeight: 100, vivid: false,
        });
        const alpha = (tx: number, ty: number): number =>
            drape.wallRgba[(ty * drape.wallW + tx) * 4 + 3]!;
        const tx = 0 * drape.cellW + Math.floor(drape.cellW / 2); // face 0's cell
        const tyInHole = Math.round(0.5 * drape.cellH - 0.5);
        const tyBelowHole = Math.round(0.1 * drape.cellH - 0.5);
        expect(alpha(tx, tyInHole)).toBe(0);            // inside the window → hole
        expect(alpha(tx, tyBelowHole)).toBeGreaterThan(0); // below the sill → solid wall
        // The opening is on face 0 ONLY — face 2's cell at the same height is solid (no wrap).
        const tx2 = 2 * drape.cellW + Math.floor(drape.cellW / 2);
        expect(alpha(tx2, tyInHole)).toBeGreaterThan(0);
    });

    it('emits a FACE TABLE that round-trips each face endpoint (rel centroid) within tolerance', () => {
        const drape = buildRealModelSunDrape({
            faces: squareFaces([0.5, 0.5, 0.5, 0.5]),
            centroidE: 100, centroidN: -50, heightM: 10, // non-zero centroid → tests rel-encoding
            ...ROOF, cellWidth: 8, cellHeight: 8, vivid: false,
        });
        expect(drape.faceTableW).toBe(2);
        expect(drape.faceTableH).toBe(4);
        expect(drape.encodeRange).toBeGreaterThan(0);
        // Face 1 = east edge: A=(5,-5), B=(5,5) in metric; rel centroid (100,-50) = A(-95,45) B(-95,55).
        const fi = 1;
        const rowA = (fi * drape.faceTableW + 0) * 4;
        const rowB = (fi * drape.faceTableW + 1) * 4;
        const aE = dec16(drape.faceTableRgba[rowA]!, drape.faceTableRgba[rowA + 1]!, drape.encodeRange);
        const aN = dec16(drape.faceTableRgba[rowA + 2]!, drape.faceTableRgba[rowA + 3]!, drape.encodeRange);
        const bE = dec16(drape.faceTableRgba[rowB]!, drape.faceTableRgba[rowB + 1]!, drape.encodeRange);
        const bN = dec16(drape.faceTableRgba[rowB + 2]!, drape.faceTableRgba[rowB + 3]!, drape.encodeRange);
        expect(aE).toBeCloseTo(5 - 100, 1);
        expect(aN).toBeCloseTo(-5 - (-50), 1);
        expect(bE).toBeCloseTo(5 - 100, 1);
        expect(bN).toBeCloseTo(5 - (-50), 1);
    });

    it('caps the packed atlas width to the GPU budget (many faces → cellW shrinks)', () => {
        // 200 faces at a default ~1 m/texel would blow past 4096; the builder must shrink cellW.
        const many: FacadeDrapeFace[] = Array.from({ length: 200 }, (_, i) => ({
            ax: i, az: 0, bx: i + 300, bz: 0, nU: 2, nV: 2, // 300 m wide → default cellW would be 256 (cap)
            intensities: [0.5, 0.5, 0.5, 0.5], openings: [],
        }));
        const drape = buildRealModelSunDrape({
            faces: many, centroidE: 0, centroidN: 0, heightM: 10, ...ROOF,
        });
        expect(drape.wallW).toBeLessThanOrEqual(4096);
        expect(drape.faceCount).toBe(200);
    });

    it('never throws on an empty face set (degrades to a fully transparent wall atlas)', () => {
        const drape = buildRealModelSunDrape({
            faces: [], centroidE: 0, centroidN: 0, heightM: 8,
            ...ROOF, cellWidth: 16, cellHeight: 8,
        });
        expect(drape.wallLitTexels).toBe(0);
        expect(drape.faceCount).toBe(0);
        expect(drape.faceTableH).toBe(1); // max(1, faceCount) — a valid 1-row texture, never 0
        // Every wall texel transparent (no face contributes any colour).
        let maxAlpha = 0;
        for (let i = 3; i < drape.wallRgba.length; i += 4) maxAlpha = Math.max(maxAlpha, drape.wallRgba[i]!);
        expect(maxAlpha).toBe(0);
    });
});
