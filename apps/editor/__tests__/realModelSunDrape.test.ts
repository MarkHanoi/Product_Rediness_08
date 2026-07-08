// §FIX-FACADE-ANALYSIS-ON-REAL-MODEL (L-177) — unit tests for the PURE real-model drape
// builder. It resamples the (byte-identical BVH) per-face + roof sun-hours intensities into
// a CYLINDRICAL wall lookup (U = centroid-angle, V = height) + a top-down roof lookup that a
// Cesium CustomShader drapes onto the REAL placed GLB, so the analysis lives on the real
// house's own faces instead of a separate envelope prism. No Cesium / THREE / DOM here.

import { describe, it, expect } from 'vitest';
import {
    buildRealModelSunDrape,
    type FacadeDrapeFace,
} from '../src/ui/climate/siteMetricGrids';

// A unit square footprint centred on the origin (metric east=x, north=z), height 10 m.
// Four faces (CCW): south, east, north, west. Each face intensity = a constant so we can
// assert the drape samples the RIGHT face for a given centroid-angle.
function squareFaces(intensityByFace: [number, number, number, number]): FacadeDrapeFace[] {
    const c = [
        { ax: -5, az: -5, bx: 5, bz: -5 }, // south edge (y=-5), outward normal -north
        { ax: 5, az: -5, bx: 5, bz: 5 },   // east edge (x=+5)
        { ax: 5, az: 5, bx: -5, bz: 5 },   // north edge (y=+5)
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

describe('§FIX-FACADE-ANALYSIS-ON-REAL-MODEL buildRealModelSunDrape', () => {
    it('produces wall + roof RGBA textures of the requested size', () => {
        const drape = buildRealModelSunDrape({
            faces: squareFaces([0.1, 0.4, 0.7, 1.0]),
            centroidE: 0, centroidN: 0, heightM: 10,
            ...ROOF, wallWidth: 64, wallHeight: 32, roofSize: 16, vivid: false,
        });
        expect(drape.wallW).toBe(64);
        expect(drape.wallH).toBe(32);
        expect(drape.wallRgba.length).toBe(64 * 32 * 4);
        expect(drape.roofRgba.length).toBe(16 * 16 * 4);
        expect(drape.wallLitTexels).toBeGreaterThan(0);
        // Metadata carries the unwrap frame through to the shader.
        expect(drape.centroidE).toBe(0);
        expect(drape.heightM).toBe(10);
    });

    it('samples the correct face per centroid-angle (east face brighter than south)', () => {
        // south=0.1, east=1.0. The column at angle 0 (dir = +east) must hit the east face;
        // the column at angle −π/2 (dir = −north / +south direction) must hit the south face.
        const drape = buildRealModelSunDrape({
            faces: squareFaces([0.1, 1.0, 0.5, 0.5]),
            centroidE: 0, centroidN: 0, heightM: 10,
            ...ROOF, wallWidth: 360, wallHeight: 4, vivid: false,
        });
        const colAt = (theta: number): [number, number, number] => {
            const u = (theta + Math.PI) / (2 * Math.PI);
            const tx = Math.min(drape.wallW - 1, Math.max(0, Math.round(u * drape.wallW - 0.5)));
            const ty = 2; // any mid row
            const o = (ty * drape.wallW + tx) * 4;
            return [drape.wallRgba[o]!, drape.wallRgba[o + 1]!, drape.wallRgba[o + 2]!];
        };
        // Ramp is monotonic in luminance-ish; compare the RED channel which rises with sun.
        const east = colAt(0);          // +east direction → east face (1.0, full sun = warm/red)
        const south = colAt(-Math.PI / 2); // −north direction → south face (0.1, shaded/blue)
        expect(east[0]).toBeGreaterThan(south[0]);
    });

    it('punches authored openings as transparent (alpha 0) holes on the real façade', () => {
        // South face carries one opening covering its full width, sill 0.3..0.7 of height.
        const faces = squareFaces([0.5, 0.5, 0.5, 0.5]);
        const withOpening: FacadeDrapeFace[] = faces.map((f, i) =>
            i === 0 ? { ...f, openings: [{ u0: 0, u1: 1, v0: 0.3, v1: 0.7 }] } : f);
        const drape = buildRealModelSunDrape({
            faces: withOpening,
            centroidE: 0, centroidN: 0, heightM: 10,
            ...ROOF, wallWidth: 360, wallHeight: 100, vivid: false,
        });
        // Column for the south face (angle −π/2), a row at v≈0.5 (inside the opening).
        const u = (-Math.PI / 2 + Math.PI) / (2 * Math.PI);
        const tx = Math.round(u * drape.wallW - 0.5);
        const tyInHole = Math.round(0.5 * drape.wallH - 0.5);
        const tyBelowHole = Math.round(0.1 * drape.wallH - 0.5);
        const alpha = (tx2: number, ty2: number): number =>
            drape.wallRgba[(ty2 * drape.wallW + tx2) * 4 + 3]!;
        expect(alpha(tx, tyInHole)).toBe(0);          // inside the window → hole
        expect(alpha(tx, tyBelowHole)).toBeGreaterThan(0); // below the sill → solid wall
    });

    it('never throws on an empty face set (degrades to a fully transparent wall)', () => {
        const drape = buildRealModelSunDrape({
            faces: [], centroidE: 0, centroidN: 0, heightM: 8,
            ...ROOF, wallWidth: 16, wallHeight: 8,
        });
        expect(drape.wallLitTexels).toBe(0);
        // Every wall texel transparent (no face in any direction).
        let maxAlpha = 0;
        for (let i = 3; i < drape.wallRgba.length; i += 4) maxAlpha = Math.max(maxAlpha, drape.wallRgba[i]!);
        expect(maxAlpha).toBe(0);
    });
});
