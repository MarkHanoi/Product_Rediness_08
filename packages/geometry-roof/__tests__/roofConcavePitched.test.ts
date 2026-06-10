// §ROOF-CONCAVE-DECOMPOSE (founder L-shape defect, 2026-06-10) — behavioural test
// that RoofGeometryBuilder.generate() produces a REAL PITCHED roof (ridge above the
// eave, multiple wings) over a concave L footprint instead of a flat slab.

import { describe, it, expect } from 'vitest';
import { RoofGeometryBuilder } from '../src/RoofGeometryBuilder';
import type { RoofData } from '../src/RoofTypes';

const L_POLY: [number, number][] = [[0, 0], [6, 0], [6, 3], [3, 3], [3, 6], [0, 6]];
const RECT_POLY: [number, number][] = [[0, 0], [10, 0], [10, 4], [0, 4]];

function makeRoof(poly: [number, number][], roofType: RoofData['roofType']): RoofData {
    return {
        id: 'r1', type: 'roof', levelId: 'L0',
        footprint: { polygon: poly, centroid: [0, 0] },
        roofType, slope: 0.5, overhang: 0.4, baseOffset: 0, thickness: 0.2,
        properties: {},
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 't', version: 1 },
    } as RoofData;
}

/** Max Y of the top (roof) vertices — proves a ridge rises above the eave (Y=0). */
function maxY(geo: { getAttribute(n: string): { array: ArrayLike<number> } | undefined }): number {
    const pos = geo.getAttribute('position');
    if (!pos) return 0;
    let m = -Infinity;
    for (let i = 1; i < pos.array.length; i += 3) m = Math.max(m, pos.array[i]!);
    return m;
}

describe('RoofGeometryBuilder — concave pitched (§ROOF-CONCAVE-DECOMPOSE)', () => {
    it('L-shape gable → a PITCHED roof (ridge rises above the eave plane)', () => {
        const geo = RoofGeometryBuilder.generate(makeRoof(L_POLY, 'gable'));
        // A flat roof keeps every top vertex at Y=0; a real pitched roof has a ridge > 0.
        expect(maxY(geo as any)).toBeGreaterThan(0.3);
    });

    it('L-shape hip → also routed through the decompose path (pitched)', () => {
        const geo = RoofGeometryBuilder.generate(makeRoof(L_POLY, 'hip'));
        expect(maxY(geo as any)).toBeGreaterThan(0.3);
    });

    it('plain rectangle gable → UNCHANGED single-ridge gable (no regression)', () => {
        const geo = RoofGeometryBuilder.generate(makeRoof(RECT_POLY, 'gable'));
        // half-perp = 2 (4m deep), slope 0.5 → ridge ≈ 1.0 (+ overhang). Still pitched.
        expect(maxY(geo as any)).toBeGreaterThan(0.8);
    });

    it('flat roofType on an L → stays flat (concave branch is pitched-only)', () => {
        const geo = RoofGeometryBuilder.generate(makeRoof(L_POLY, 'flat'));
        expect(maxY(geo as any)).toBeCloseTo(0, 6);
    });

    it('is DETERMINISTIC — same L footprint → identical vertex buffer (ADR-0061)', () => {
        const a = RoofGeometryBuilder.generate(makeRoof(L_POLY, 'gable'));
        const b = RoofGeometryBuilder.generate(makeRoof(L_POLY, 'gable'));
        const pa = (a as any).getAttribute('position').array as Float32Array;
        const pb = (b as any).getAttribute('position').array as Float32Array;
        expect(Array.from(pa)).toEqual(Array.from(pb));
    });
});
