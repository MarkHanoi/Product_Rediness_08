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
    smoothFacadeField,
    mergeCollinearFacadeEdges,
    FACADE_RECON_SIGMA_M,
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

// ─────────────────────────────────────────────────────────────────────────────
// §FIX-FACADE-ANALYSIS-DRAPE-QUALITY (L-272, founder 2026-07-13) — the DRAPE, not the engine
// ─────────────────────────────────────────────────────────────────────────────
//
// MEASURED root (head-less repro of a 34×18 m / 33 m tower + OSM context — the same engine, ramp
// and frame as the ground heatmap the founder calls beautiful):
//                  compute      DISPLAY        upsample   texel |Δ|          |Laplacian|
//   GROUND (good)  7.1 m cells  0.94 m/texel   7.5×       0.135/255          0.044/255
//   FAÇADE (bad)   1.20 m nodes 1.00 m/texel   1.17×      1.122/255 (8.3×)   0.502/255 (11.4×)
// texels/m was ALREADY at parity and normalisation was ALREADY global — the drape was rendering a
// binary-raycast field at its own Nyquist. These guards pin the two DISPLAY-side cures.

describe('§FIX-FACADE-ANALYSIS-DRAPE-QUALITY (L-272) — reconstruction kernel + coplanar panels', () => {
    it('DISPLAY is several × finer than the COMPUTE lattice (the ground’s 7.5× upsample, not 1:1)', () => {
        // A 34 m × 33 m face — the founder's tower class. Default (unforced) cell sizing.
        const face: FacadeDrapeFace = {
            ax: -17, az: -9, bx: 17, bz: -9, nU: 29, nV: 29,      // 1.2 m compute lattice
            intensities: new Array(29 * 29).fill(0.5), openings: [],
        };
        const drape = buildRealModelSunDrape({
            faces: [face], centroidE: 0, centroidN: 0, heightM: 33, ...ROOF,
        });
        const mPerTexelAlong = 34 / drape.cellW;
        const mPerTexelUp = 33 / drape.cellH;
        // Finer than the ground's 0.9 m/texel benchmark — and, critically, ≥3× finer than the
        // 1.2 m compute lattice, so the reconstruction is RESOLVED instead of re-aliased.
        expect(mPerTexelAlong).toBeLessThanOrEqual(0.5);
        expect(mPerTexelUp).toBeLessThanOrEqual(0.5);
        expect(1.2 / mPerTexelAlong).toBeGreaterThanOrEqual(3);
        // …but still inside the GPU/device-loss budget (L-231): one cell, well under the caps.
        expect(drape.wallW).toBeLessThanOrEqual(4096);
        expect(drape.cellH).toBeLessThanOrEqual(512);
    });

    it('smoothFacadeField collapses the binary-sun-sample quantisation WITHOUT eating the signal', () => {
        // A physical ramp (bottom shaded → top sunlit) + the ±1-sun-sample quantisation the raycast
        // actually produces (the blotch). σ = 2 m over a 1.2 m lattice ⇒ σ ≈ 1.67 nodes.
        const nU = 29, nV = 29, quantum = 0.027;   // 1/65 samples, stretched ×1.77 by L-227's normalise
        const field: Array<number | null> = [];
        for (let v = 0; v < nV; v++) {
            for (let u = 0; u < nU; u++) {
                const ramp = v / (nV - 1);
                const flip = ((u * 7 + v * 13) % 3) - 1;   // deterministic ±1-sample jitter
                field.push(Math.max(0, Math.min(1, ramp + flip * quantum)));
            }
        }
        const rough = (f: ReadonlyArray<number | null>): number => {
            let s = 0, n = 0;
            for (let v = 0; v < nV; v++) {
                for (let u = 0; u + 1 < nU; u++) {   // ALONG the face: the ramp is flat here, so any
                    const a = f[v * nU + u]!, b = f[v * nU + u + 1]!;   // variation is pure noise
                    s += Math.abs(a - b); n++;
                }
            }
            return n ? s / n : 0;
        };
        const contrast = (f: ReadonlyArray<number | null>): number => {
            const v = f.filter((x): x is number => x != null).sort((a, b) => a - b);
            return v[Math.floor(v.length * 0.95)]! - v[Math.floor(v.length * 0.05)]!;
        };
        const smoothed = smoothFacadeField(field, nU, nV, FACADE_RECON_SIGMA_M / 1.2);
        // Noise (the blotch) collapses…
        expect(rough(smoothed)).toBeLessThan(rough(field) / 4);
        // …while the physical gradient (the study) survives.
        expect(contrast(smoothed)).toBeGreaterThan(contrast(field) * 0.9);
        // Deterministic + shape-preserving.
        expect(smoothFacadeField(field, nU, nV, FACADE_RECON_SIGMA_M / 1.2)).toEqual(smoothed);
        expect(smoothed.length).toBe(nU * nV);
    });

    it('smoothFacadeField keeps holes as holes and never darkens toward them', () => {
        const nU = 5, nV = 5;
        const field: Array<number | null> = new Array(25).fill(0.8);
        field[12] = null;                                  // a hole in the middle
        const out = smoothFacadeField(field, nU, nV, 1.5);
        expect(out[12]).toBeNull();                        // hole preserved (drape owns hole policy)
        for (let k = 0; k < 25; k++) {
            if (k === 12) continue;
            expect(out[k]).toBeCloseTo(0.8, 6);            // renormalised — no darkening
        }
    });

    it('N adjacent COPLANAR walls become ONE panel ⇒ the ramp is continuous across the seam', () => {
        // A square whose SOUTH wall was traced (reconstructPerimeterRing on a 192-wall model) as
        // THREE collinear edges. Un-merged, that wall was 3 independent lattices + 3 atlas cells.
        const ring = [
            { x: -17, z: -9 }, { x: -5, z: -9 }, { x: 6, z: -9 },   // ← 3 collinear south edges
            { x: 17, z: -9 }, { x: 17, z: 9 }, { x: -17, z: 9 },
        ];
        const panels = mergeCollinearFacadeEdges(ring);
        // 4 physical planes: south (3 edges merged), east, north, west.
        expect(panels.length).toBe(4);
        const south = panels.find((p) => Math.abs(p.az + 9) < 1e-6 && Math.abs(p.bz + 9) < 1e-6)!;
        expect(south.edgeCount).toBe(3);
        expect(Math.hypot(south.bx - south.ax, south.bz - south.az)).toBeCloseTo(34, 6);

        // …and the drape therefore paints that wall as ONE continuous cell: sampling the atlas
        // across the former internal vertices shows a monotone ramp with NO step.
        const nU = 29, nV = 4;
        const intensities: Array<number | null> = [];
        for (let v = 0; v < nV; v++) for (let u = 0; u < nU; u++) intensities.push(u / (nU - 1));
        const drape = buildRealModelSunDrape({
            faces: [{ ax: south.ax, az: south.az, bx: south.bx, bz: south.bz, nU, nV, intensities, openings: [] }],
            centroidE: 0, centroidN: 0, heightM: 33, ...ROOF,
        });
        expect(drape.faceCount).toBe(1);                    // ONE cell for the whole plane
        const row = Math.floor(drape.cellH / 2);
        let maxStep = 0;
        for (let tx = 1; tx < drape.cellW; tx++) {
            const o0 = (row * drape.wallW + tx - 1) * 4, o1 = (row * drape.wallW + tx) * 4;
            if (drape.wallRgba[o0 + 3]! < 10 || drape.wallRgba[o1 + 3]! < 10) continue;
            for (let c = 0; c < 3; c++) {
                maxStep = Math.max(maxStep, Math.abs(drape.wallRgba[o1 + c]! - drape.wallRgba[o0 + c]!));
            }
        }
        // A continuous ramp: no texel-to-texel jump anywhere near a per-face seam discontinuity.
        expect(maxStep).toBeLessThan(12);
    });

    it('a REAL corner still ENDS a panel (the sun field is physically discontinuous there)', () => {
        const square = [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }];
        expect(mergeCollinearFacadeEdges(square).length).toBe(4);
        // A shallow (but real) corner is NOT merged away.
        const shallow = [{ x: -10, z: 0 }, { x: 0, z: 0 }, { x: 10, z: 1.5 }, { x: 0, z: 10 }];
        expect(mergeCollinearFacadeEdges(shallow).length).toBe(4);
    });

    it('the wrap-around run merges too (a collinear split ACROSS the ring closure)', () => {
        // The ring STARTS mid-wall: pts 0→1 and 3→0 are the same physical south wall.
        const ring = [
            { x: 0, z: -9 }, { x: 17, z: -9 }, { x: 17, z: 9 }, { x: -17, z: 9 }, { x: -17, z: -9 },
        ];
        const panels = mergeCollinearFacadeEdges(ring);
        expect(panels.length).toBe(4);                      // NOT 5 — the split south wall is one panel
        const south = panels.find((p) => p.edgeCount === 2)!;
        expect(Math.hypot(south.bx - south.ax, south.bz - south.az)).toBeCloseTo(34, 6);
    });

    it('openings are still carved out of the drape (no L-144 regression)', () => {
        const nU = 8, nV = 8;
        const drape = buildRealModelSunDrape({
            faces: [{
                ax: -17, az: -9, bx: 17, bz: -9, nU, nV,
                intensities: new Array(nU * nV).fill(0.6),
                openings: [{ u0: 0.4, u1: 0.6, v0: 0.3, v1: 0.7 }],
            }],
            centroidE: 0, centroidN: 0, heightM: 33, ...ROOF,
        });
        const at = (u: number, v: number): number => {
            const tx = Math.floor(u * (drape.cellW - 1));
            const ty = Math.floor(v * (drape.cellH - 1));
            return drape.wallRgba[(ty * drape.wallW + tx) * 4 + 3]!;
        };
        expect(at(0.5, 0.5)).toBe(0);        // inside the opening → transparent hole
        expect(at(0.1, 0.5)).toBeGreaterThan(200);   // wall beside it → painted
    });
});
