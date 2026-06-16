// ADR-0074 P1b (C21 §10) — pure-helper tests for the sun-hours heatmap ramp +
// face-grid sampler. THREE-free + deterministic; the full pass needs a live scene
// so it is browser-verified, not unit-tested.

import { describe, it, expect } from 'vitest';
import {
    sampleRamp,
    sunHoursToColor,
    DEFAULT_SUN_HOURS_RAMP,
} from '../src/solar/heatmapRamp.js';
import { gridTriangle, type V3 } from '../src/solar/faceGrid.js';

describe('heatmapRamp — sampleRamp', () => {
    it('anchors the cold end on PRYZM purple (#6600FF ≈ 0.40,0,1)', () => {
        const c = sampleRamp(0);
        expect(c.r).toBeCloseTo(0.40, 5);
        expect(c.g).toBeCloseTo(0.0, 5);
        expect(c.b).toBeCloseTo(1.0, 5);
    });

    it('anchors the hot end on warm yellow', () => {
        const c = sampleRamp(1);
        expect(c.r).toBeCloseTo(1.0, 5);
        expect(c.g).toBeGreaterThan(0.8);
        expect(c.b).toBeLessThan(0.5);
    });

    it('clamps out-of-range t to the endpoints', () => {
        expect(sampleRamp(-5)).toEqual(sampleRamp(0));
        expect(sampleRamp(5)).toEqual(sampleRamp(1));
    });

    it('interpolates linearly between two stops', () => {
        // Midpoint of the first segment [0 → 0.35].
        const lo = DEFAULT_SUN_HOURS_RAMP[0]!;
        const hi = DEFAULT_SUN_HOURS_RAMP[1]!;
        const mid = sampleRamp((lo.t + hi.t) / 2);
        expect(mid.r).toBeCloseTo((lo.color.r + hi.color.r) / 2, 5);
        expect(mid.g).toBeCloseTo((lo.color.g + hi.color.g) / 2, 5);
        expect(mid.b).toBeCloseTo((lo.color.b + hi.color.b) / 2, 5);
    });

    it('is monotonic-ish: warmer (higher) channels rise toward the hot end', () => {
        // Red increases monotonically from cold → hot in this ramp.
        let prev = -Infinity;
        for (let t = 0; t <= 1.0001; t += 0.1) {
            const r = sampleRamp(t).r;
            expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
            prev = r;
        }
    });
});

describe('heatmapRamp — sunHoursToColor', () => {
    it('maps maxHours<=0 (no sun) to the cold end', () => {
        expect(sunHoursToColor(0, 0)).toEqual(sampleRamp(0));
        expect(sunHoursToColor(5, 0)).toEqual(sampleRamp(0));
    });

    it('normalises against maxHours', () => {
        const full = sunHoursToColor(8, 8);
        expect(full).toEqual(sampleRamp(1));
        const half = sunHoursToColor(4, 8);
        expect(half).toEqual(sampleRamp(0.5));
    });
});

describe('faceGrid — gridTriangle', () => {
    const A: V3 = { x: 0, y: 0, z: 0 };
    const B: V3 = { x: 4, y: 0, z: 0 };
    const C: V3 = { x: 0, y: 0, z: 4 }; // 4×4 right triangle in the XZ plane
    const up: V3 = { x: 0, y: 1, z: 0 };

    it('returns at least the centroid for a tiny triangle', () => {
        const tiny = gridTriangle(
            { x: 0, y: 0, z: 0 },
            { x: 0.1, y: 0, z: 0 },
            { x: 0, y: 0, z: 0.1 },
            up,
            { spacing: 0.75 },
        );
        expect(tiny.length).toBeGreaterThanOrEqual(1);
    });

    it('produces a denser grid for a larger triangle', () => {
        const sparse = gridTriangle(A, B, C, up, { spacing: 2.0 });
        const dense = gridTriangle(A, B, C, up, { spacing: 0.5 });
        expect(dense.length).toBeGreaterThan(sparse.length);
    });

    it('nudges every point OUT along the normal by `offset`', () => {
        const pts = gridTriangle(A, B, C, up, { spacing: 1.0, offset: 0.1 });
        for (const p of pts) {
            // The triangle is at y=0; every sample must sit at y ≈ +offset.
            expect(p.y).toBeCloseTo(0.1, 6);
        }
    });

    it('keeps all sample points inside the triangle footprint (x,z ≥ 0, x+z ≤ extent)', () => {
        const pts = gridTriangle(A, B, C, up, { spacing: 0.75 });
        for (const p of pts) {
            expect(p.x).toBeGreaterThanOrEqual(-1e-9);
            expect(p.z).toBeGreaterThanOrEqual(-1e-9);
            expect(p.x + p.z).toBeLessThanOrEqual(4 + 1e-6);
        }
    });

    it('respects the maxPoints cap', () => {
        const pts = gridTriangle(
            { x: 0, y: 0, z: 0 },
            { x: 100, y: 0, z: 0 },
            { x: 0, y: 0, z: 100 },
            up,
            { spacing: 0.1, maxPoints: 50 },
        );
        expect(pts.length).toBeLessThanOrEqual(50);
    });

    it('is deterministic — same inputs give byte-identical output', () => {
        const a = gridTriangle(A, B, C, up, { spacing: 0.75 });
        const b = gridTriangle(A, B, C, up, { spacing: 0.75 });
        expect(a).toEqual(b);
    });
});
