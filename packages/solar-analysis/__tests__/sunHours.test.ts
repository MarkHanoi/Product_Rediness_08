// ADR-0074 — sun-hours accumulation: sun-facing vs facing-away surfaces, the
// injected occluder zeroing samples, horizon gating, step-hours scaling,
// normal-weighting, AVG/MAX/MIN reduction, and determinism.

import { describe, expect, it } from 'vitest';
import { accumulateSunHours } from '../src/sunHours.js';
import { generateSunSamples } from '../src/sunSamples.js';
import type { IsOccluded, SolarSurface, SunSample, Vec3 } from '../src/types.js';

const LONDON = { latDeg: 51.5, lngDeg: -0.13 };
const NEVER_OCCLUDED: IsOccluded = () => false;
const ALWAYS_OCCLUDED: IsOccluded = () => true;

// World ENU normals: +X East, +Y Up, +Z South.
const SOUTH: Vec3 = { x: 0, y: 0, z: 1 };  // south-facing façade
const NORTH: Vec3 = { x: 0, y: 0, z: -1 }; // north-facing façade
const UP: Vec3 = { x: 0, y: 1, z: 0 };     // flat roof

function surface(id: string, normal: Vec3, points: Vec3[] = [{ x: 0, y: 0, z: 0 }]): SolarSurface {
    return { id, normal, samplePoints: points };
}

const equinoxSamples: SunSample[] = generateSunSamples({ ...LONDON, dayOfYear: 80, stepMinutes: 15 });

describe('accumulateSunHours — orientation', () => {
    it('a SOUTH-facing surface gets sun-hours; a NORTH-facing surface gets ~zero (N hemisphere)', () => {
        const res = accumulateSunHours(
            [surface('s', SOUTH), surface('n', NORTH)],
            equinoxSamples,
            NEVER_OCCLUDED,
            { stepMinutes: 15 },
        );
        const south = res.surfaces.find((s) => s.surfaceId === 's')!;
        const north = res.surfaces.find((s) => s.surfaceId === 'n')!;
        expect(south.sunHours).toBeGreaterThan(0);
        // On the equinox the sun stays in the southern sky all day → north façade
        // is never sun-facing → exactly zero.
        expect(north.sunHours).toBe(0);
        expect(south.sunHours).toBeGreaterThan(north.sunHours);
    });

    it('a flat UP roof receives the most hours (sun above horizon all day)', () => {
        const res = accumulateSunHours([surface('roof', UP)], equinoxSamples, NEVER_OCCLUDED, { stepMinutes: 15 });
        const roof = res.surfaces[0]!;
        // Every above-horizon sample is sun-facing for an up normal.
        expect(roof.sunHours).toBeCloseTo(res.sampleCount * (15 / 60), 9);
    });
});

describe('accumulateSunHours — injected occlusion oracle', () => {
    it('an always-occluding oracle zeroes out every surface', () => {
        const res = accumulateSunHours(
            [surface('s', SOUTH), surface('roof', UP)],
            equinoxSamples,
            ALWAYS_OCCLUDED,
            { stepMinutes: 15 },
        );
        for (const s of res.surfaces) expect(s.sunHours).toBe(0);
        expect(res.avgSunHours).toBe(0);
        expect(res.maxSunHours).toBe(0);
        expect(res.minSunHours).toBe(0);
    });

    it('occluding ONLY afternoon samples removes exactly their contribution', () => {
        const full = accumulateSunHours([surface('roof', UP)], equinoxSamples, NEVER_OCCLUDED, { stepMinutes: 15 });
        // Oracle that blocks the sun whenever it is in the western sky (afternoon:
        // azimuth > 180° ⇒ dir.x < 0 in the ENU frame).
        const blockAfternoon: IsOccluded = (_p, sunDir) => sunDir.x < 0;
        const partial = accumulateSunHours([surface('roof', UP)], equinoxSamples, blockAfternoon, { stepMinutes: 15 });
        const morningOnly = equinoxSamples.filter((s) => s.altitudeDeg > 0 && s.dir.x >= 0).length;
        expect(partial.surfaces[0]!.sunHours).toBeCloseTo(morningOnly * (15 / 60), 9);
        expect(partial.surfaces[0]!.sunHours).toBeLessThan(full.surfaces[0]!.sunHours);
    });

    it('a per-POINT occluder shadows one texel but not its neighbour', () => {
        const lit: Vec3 = { x: 0, y: 0, z: 0 };
        const shaded: Vec3 = { x: 10, y: 0, z: 0 };
        const occludeShaded: IsOccluded = (p) => p.x === shaded.x;
        const res = accumulateSunHours(
            [surface('roof', UP, [lit, shaded])],
            equinoxSamples,
            occludeShaded,
            { stepMinutes: 15 },
        );
        const roof = res.surfaces[0]!;
        expect(roof.minPointSunHours).toBe(0);                 // shaded texel
        expect(roof.maxPointSunHours).toBeGreaterThan(0);      // lit texel
        // Surface mean is the average of one lit + one fully-shaded point.
        expect(roof.sunHours).toBeCloseTo(roof.maxPointSunHours / 2, 9);
        expect(roof.samplePointCount).toBe(2);
    });
});

describe('accumulateSunHours — horizon + step scaling', () => {
    it('below-horizon samples never contribute even when daylightOnly:false', () => {
        const all = generateSunSamples({ ...LONDON, dayOfYear: 80, stepMinutes: 15, daylightOnly: false });
        const onlyDay = generateSunSamples({ ...LONDON, dayOfYear: 80, stepMinutes: 15, daylightOnly: true });
        const a = accumulateSunHours([surface('roof', UP)], all, NEVER_OCCLUDED, { stepMinutes: 15 });
        const b = accumulateSunHours([surface('roof', UP)], onlyDay, NEVER_OCCLUDED, { stepMinutes: 15 });
        expect(a.surfaces[0]!.sunHours).toBeCloseTo(b.surfaces[0]!.sunHours, 9);
        expect(a.sampleCount).toBe(b.sampleCount); // both count only above-horizon
    });

    it('stepHours scales linearly with stepMinutes', () => {
        const s15 = generateSunSamples({ ...LONDON, dayOfYear: 80, stepMinutes: 15 });
        const r15 = accumulateSunHours([surface('roof', UP)], s15, NEVER_OCCLUDED, { stepMinutes: 15 });
        expect(r15.stepHours).toBe(0.25);
        const r30 = accumulateSunHours([surface('roof', UP)], s15, NEVER_OCCLUDED, { stepMinutes: 30 });
        // Same samples, doubled Δt ⇒ doubled hours.
        expect(r30.surfaces[0]!.sunHours).toBeCloseTo(r15.surfaces[0]!.sunHours * 2, 9);
    });
});

describe('accumulateSunHours — normal weighting', () => {
    it('normalWeighted hours never exceed the un-weighted geometric hours', () => {
        const geom = accumulateSunHours([surface('s', SOUTH)], equinoxSamples, NEVER_OCCLUDED, { stepMinutes: 15 });
        const weighted = accumulateSunHours([surface('s', SOUTH)], equinoxSamples, NEVER_OCCLUDED, {
            stepMinutes: 15,
            normalWeighted: true,
        });
        // cos(incidence) ∈ (0,1] so the weighted total is ≤ the geometric total.
        expect(weighted.surfaces[0]!.sunHours).toBeGreaterThan(0);
        expect(weighted.surfaces[0]!.sunHours).toBeLessThanOrEqual(geom.surfaces[0]!.sunHours + 1e-9);
    });
});

describe('accumulateSunHours — AVG/MAX/MIN reduction + edge cases', () => {
    it('reports the right max/min surfaces across a building', () => {
        const res = accumulateSunHours(
            [surface('roof', UP), surface('south', SOUTH), surface('north', NORTH)],
            equinoxSamples,
            NEVER_OCCLUDED,
            { stepMinutes: 15 },
        );
        expect(res.maxSurfaceId).toBe('roof');   // up normal sees the whole day
        expect(res.minSurfaceId).toBe('north');  // north façade zero on equinox
        const mean = res.surfaces.reduce((a, s) => a + s.sunHours, 0) / res.surfaces.length;
        expect(res.avgSunHours).toBeCloseTo(mean, 9);
        expect(res.maxSunHours).toBeGreaterThanOrEqual(res.avgSunHours);
        expect(res.minSunHours).toBeLessThanOrEqual(res.avgSunHours);
    });

    it('no surfaces ⇒ zeroed summary, no surface ids', () => {
        const res = accumulateSunHours([], equinoxSamples, NEVER_OCCLUDED, { stepMinutes: 15 });
        expect(res.surfaces).toEqual([]);
        expect(res.avgSunHours).toBe(0);
        expect(res.maxSunHours).toBe(0);
        expect(res.minSunHours).toBe(0);
        expect(res.maxSurfaceId).toBeUndefined();
        expect(res.minSurfaceId).toBeUndefined();
    });

    it('a surface with no sample points yields zero hours, no crash', () => {
        const res = accumulateSunHours([surface('empty', UP, [])], equinoxSamples, NEVER_OCCLUDED, { stepMinutes: 15 });
        expect(res.surfaces[0]!.sunHours).toBe(0);
        expect(res.surfaces[0]!.samplePointCount).toBe(0);
    });
});

describe('accumulateSunHours — determinism', () => {
    it('same surfaces + samples + oracle ⇒ identical output', () => {
        const surfaces = [surface('roof', UP), surface('s', SOUTH)];
        const a = accumulateSunHours(surfaces, equinoxSamples, NEVER_OCCLUDED, { stepMinutes: 15 });
        const b = accumulateSunHours(surfaces, equinoxSamples, NEVER_OCCLUDED, { stepMinutes: 15 });
        expect(a).toEqual(b);
    });
});
