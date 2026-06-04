// A.10.c (Phase A · Sprint 2) — Bundled monthly-normals tests.

import { describe, expect, it } from 'vitest';
import { NOAANormalSchema } from '@pryzm/schemas';
import {
    bundledMonthlyNormals,
    nearestZoneTemplate,
    BUNDLED_NORMALS_VERSION,
} from '../src/bundledNormals.js';

describe('bundledMonthlyNormals', () => {
    it('returns exactly 12 normals Jan..Dec, all schema-valid', () => {
        const { monthlyNormals } = bundledMonthlyNormals(51.5, -0.12); // London
        expect(monthlyNormals).toHaveLength(12);
        monthlyNormals.forEach((n, i) => {
            expect(n.month).toBe(i + 1);
            // Each entry must pass the L0 schema (bounds + types).
            expect(() => NOAANormalSchema.parse(n)).not.toThrow();
        });
    });

    it('is deterministic — same lat/lon yields identical output', () => {
        const a = bundledMonthlyNormals(40.7, -74.0);
        const b = bundledMonthlyNormals(40.7, -74.0);
        expect(a).toEqual(b);
    });

    it('picks a warmer template near the equator than near the pole', () => {
        const tropical = bundledMonthlyNormals(2, 30);
        const polar = bundledMonthlyNormals(78, 15);
        const tropMean =
            tropical.monthlyNormals.reduce((s, n) => s + n.avgDryBulbC, 0) / 12;
        const polarMean =
            polar.monthlyNormals.reduce((s, n) => s + n.avgDryBulbC, 0) / 12;
        expect(tropMean).toBeGreaterThan(polarMean);
        expect(tropMean).toBeGreaterThan(20);
        expect(polarMean).toBeLessThan(0);
    });

    it('flips the seasonal phase for the southern hemisphere', () => {
        // Same |lat|, opposite hemisphere → warmest months swap (Jul vs Jan).
        const north = bundledMonthlyNormals(45, 5);
        const south = bundledMonthlyNormals(-45, 5);
        const julN = north.monthlyNormals[6]!.avgDryBulbC; // July
        const janN = north.monthlyNormals[0]!.avgDryBulbC; // January
        const julS = south.monthlyNormals[6]!.avgDryBulbC;
        const janS = south.monthlyNormals[0]!.avgDryBulbC;
        expect(julN).toBeGreaterThan(janN); // N: July warm
        expect(janS).toBeGreaterThan(julS); // S: January warm
    });

    it('stamps the bundled dataset version', () => {
        const { datasetVersion } = bundledMonthlyNormals(51.5, -0.12);
        expect(datasetVersion).toBe(BUNDLED_NORMALS_VERSION);
    });
});

describe('nearestZoneTemplate', () => {
    it('selects by absolute latitude band', () => {
        expect(nearestZoneTemplate(0).id).toBe('tropical');
        expect(nearestZoneTemplate(46).id).toBe('temperate'); // 45 closer than 55
        expect(nearestZoneTemplate(-78).id).toBe('polar');
    });
});
