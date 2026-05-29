// L1-α-2 (2026-05-29) — DaylightDepthField pin tests.
//
// Pin the BRE / BS 8206-2 daylight depth model:
//   • points on a south façade score ≈ 1
//   • points 3.5 m deep on a south façade score ≈ 0.5
//   • points 7 m+ deep (the cognition-stack cap) score 0
//   • a north façade gives a much weaker score than a south one at equal depth
//   • points outside the polygon score 0

import { describe, expect, it } from 'vitest';
import { computeFacadeValueField } from '../src/workflows/apartmentLayout/environment/facadeValueField.js';
import {
    computeDaylightDepthField,
    DAYLIGHT_DEPTH_M,
} from '../src/workflows/apartmentLayout/environment/daylightDepthField.js';

// 12 × 10 rectangle: south façade is the z = 0 edge; north façade the z = 10 edge.
// Conventions match facadeValueField.ts (+z = North).
const RECT = [
    { x: 0, z: 0 }, { x: 12, z: 0 },
    { x: 12, z: 10 }, { x: 0, z: 10 },
];

describe('DaylightDepthField (L1-α-2)', () => {
    it('a point right on the south façade scores ~1.0', () => {
        const facade = computeFacadeValueField(RECT);
        const field = computeDaylightDepthField(RECT, facade);
        const score = field.at({ x: 6, z: 0.001 });          // just inside the polygon
        expect(score).toBeGreaterThan(0.95);
    });

    it('linear depth attenuation: 3.5 m from south façade ≈ 0.5', () => {
        const facade = computeFacadeValueField(RECT);
        const field = computeDaylightDepthField(RECT, facade);
        const score = field.at({ x: 6, z: 3.5 });
        // Depth attenuation = 1 - 3.5/7 = 0.5; sunlight (S) = 1.0 ⇒ ~0.5.
        expect(score).toBeGreaterThan(0.45);
        expect(score).toBeLessThan(0.55);
    });

    it('points deeper than DAYLIGHT_DEPTH_M from every façade score 0', () => {
        // 30 × 30 polygon, sample the dead centre — every façade is 15 m away.
        const big = [
            { x: 0, z: 0 }, { x: 30, z: 0 },
            { x: 30, z: 30 }, { x: 0, z: 30 },
        ];
        const facade = computeFacadeValueField(big);
        const field = computeDaylightDepthField(big, facade);
        const score = field.at({ x: 15, z: 15 });
        expect(score).toBe(0);
        // And just outside DMAX (7 + tiny) too:
        const just = field.at({ x: 15, z: DAYLIGHT_DEPTH_M + 0.01 });
        expect(just).toBe(0);
    });

    it('north façade at equal depth scores well below south façade', () => {
        const facade = computeFacadeValueField(RECT);
        const field = computeDaylightDepthField(RECT, facade);
        const south3 = field.at({ x: 6, z: 3 });          // 3 m from south façade
        const north3 = field.at({ x: 6, z: 7 });          // 3 m from north façade
        // South sunlight = 1.00; north = 0.25. Depth attenuation cancels out
        // (both 3 m). Ratio should be ~4×.
        expect(south3).toBeGreaterThan(north3 * 2);
    });

    it('points outside the polygon score 0', () => {
        const facade = computeFacadeValueField(RECT);
        const field = computeDaylightDepthField(RECT, facade);
        expect(field.at({ x: -1, z: 5 })).toBe(0);
        expect(field.at({ x: 13, z: 5 })).toBe(0);
        expect(field.at({ x: 6, z: -1 })).toBe(0);
        expect(field.at({ x: 6, z: 11 })).toBe(0);
    });

    it('degenerate polygon (< 3 vertices) returns an everywhere-zero field', () => {
        const tooShort = [{ x: 0, z: 0 }, { x: 1, z: 0 }];
        const facade = computeFacadeValueField(tooShort);
        const field = computeDaylightDepthField(tooShort, facade);
        expect(field.at({ x: 0.5, z: 0 })).toBe(0);
        expect(field.averageOverRect({ minX: 0, minZ: 0, maxX: 1, maxZ: 1 })).toBe(0);
    });

    it('averageOverRect smooths the depth gradient (centre vs corner rectangle)', () => {
        const facade = computeFacadeValueField(RECT);
        const field = computeDaylightDepthField(RECT, facade);
        // 4 × 3 room flush with the south façade (typical living room near a window).
        const south = field.averageOverRect({ minX: 4, minZ: 0, maxX: 8, maxZ: 3 });
        // Same room shape, pushed to the north end (3 m of depth from north façade).
        const north = field.averageOverRect({ minX: 4, minZ: 7, maxX: 8, maxZ: 10 });
        expect(south).toBeGreaterThan(north);
        // Sanity: south-flush averages > 0.5 (front edge at 0 m, back edge at 3 m).
        expect(south).toBeGreaterThan(0.5);
    });

    it('handles a CW polygon (winding canonicalised via facadeField)', () => {
        const cw = [
            { x: 0, z: 0 }, { x: 0, z: 10 },
            { x: 12, z: 10 }, { x: 12, z: 0 },
        ];
        const facade = computeFacadeValueField(cw);
        const field = computeDaylightDepthField(cw, facade);
        // Same south-façade interior point should still score high.
        const score = field.at({ x: 6, z: 0.001 });
        expect(score).toBeGreaterThan(0.95);
    });
});
