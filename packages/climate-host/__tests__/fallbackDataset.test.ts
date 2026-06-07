// A.21.D33(f) / A.21.D27 — Offline ClimateDataset fallback tests.
//
// Proves the deterministic, lat-driven offline climatology produces a complete,
// schema-valid `ClimateDataset` with a NON-EMPTY wind rose so the Climate panel
// + 3D wind/heat overlays render instead of "NO DATASET" — without any network.

import { describe, expect, it } from 'vitest';
import { ClimateDatasetSchema } from '@pryzm/schemas';
import {
    buildFallbackClimateDataset,
    synthWindRoseFromNormals,
    BUNDLED_NORMALS_VERSION,
    bundledMonthlyNormals,
} from '../src/index.js';

const NOW = '2026-06-07T00:00:00.000Z';

function build(lat: number, lon: number) {
    return buildFallbackClimateDataset({
        id: 'climate:TEST0000000000001',
        siteRef: 'site_test',
        lat,
        lon,
        elevationM: 12,
        timezone: 'Europe/London',
        nowIso: NOW,
    });
}

describe('buildFallbackClimateDataset', () => {
    it('produces a schema-valid ClimateDataset for any in-range lat/lon', () => {
        for (const [lat, lon] of [
            [51.5, -0.12], // London
            [-33.87, 151.21], // Sydney (S hemisphere)
            [1.35, 103.82], // Singapore (equatorial)
            [78, 15], // polar
            [40.7, -74.0], // New York
        ] as const) {
            const ds = build(lat, lon);
            expect(() => ClimateDatasetSchema.parse(ds)).not.toThrow();
        }
    });

    it('is tagged fallback-defaults (so EPW / live NOAA still win at resolve)', () => {
        const ds = build(51.5, -0.12);
        expect(ds.source).toBe('fallback-defaults');
        expect(ds.provenance.source).toBe('fallback-defaults');
        expect(ds.provenance.vendor).toBe('PRYZM-builtin');
        expect(ds.provenance.datasetVersion).toBe(BUNDLED_NORMALS_VERSION);
    });

    it('has exactly 12 monthly normals and 16 wind-rose sectors', () => {
        const ds = build(45, 5);
        expect(ds.monthlyNormals).toHaveLength(12);
        expect(ds.windRose.sectors).toHaveLength(16);
    });

    it('produces a NON-EMPTY wind rose (the wind overlay would render)', () => {
        const ds = build(45, 5);
        const totalHours = ds.windRose.sectors.reduce(
            (s, sec) => s + sec.speedBinHours.reduce((a, h) => a + h, 0),
            0,
        );
        expect(totalHours).toBeGreaterThan(0);
        expect(ds.windRose.meanSpeedMps).toBeGreaterThan(0);
        expect(ds.windRose.p99SpeedMps).toBeGreaterThanOrEqual(ds.windRose.meanSpeedMps);
    });

    it('derives coherent design temps + degree-days from the monthlies', () => {
        const ds = build(55, 10); // cool continental → some HDD
        expect(ds.designTemps.cooling0_4C).toBeGreaterThan(ds.designTemps.heating99_6C);
        expect(ds.degreeDays.hddBase18).toBeGreaterThan(0);
        expect(ds.degreeDays.hddBase65F).toBeGreaterThanOrEqual(ds.degreeDays.hddBase18);
    });

    it('is deterministic — same inputs yield byte-identical output', () => {
        const a = build(48.85, 2.35);
        const b = build(48.85, 2.35);
        expect(a).toEqual(b);
    });

    it('is lat-driven — equatorial is warmer than polar', () => {
        const trop = build(2, 30);
        const polar = build(78, 15);
        const meanOf = (d: ReturnType<typeof build>) =>
            d.monthlyNormals.reduce((s, n) => s + n.avgDryBulbC, 0) / 12;
        expect(meanOf(trop)).toBeGreaterThan(meanOf(polar));
    });

    it('defaults elevation, timezone, and timestamp when omitted', () => {
        const ds = buildFallbackClimateDataset({
            id: 'climate:TEST0000000000002',
            siteRef: 'site_test2',
            lat: 51.5,
            lon: -0.12,
        });
        expect(ds.elevationM).toBe(0);
        expect(ds.timezone).toBe('UTC');
        expect(() => new Date(ds.ingestedAtUtcIso).toISOString()).not.toThrow();
    });
});

describe('synthWindRoseFromNormals', () => {
    it('credits each month ~720 hours into its prevailing sector', () => {
        const { monthlyNormals } = bundledMonthlyNormals(45, 5);
        const rose = synthWindRoseFromNormals(monthlyNormals);
        const total = rose.sectors.reduce(
            (s, sec) => s + sec.speedBinHours.reduce((a, h) => a + h, 0),
            0,
        );
        expect(total).toBe(12 * 720);
    });

    it('returns an all-zero rose for an empty input (no throw)', () => {
        const rose = synthWindRoseFromNormals([]);
        expect(rose.sectors).toHaveLength(16);
        expect(rose.meanSpeedMps).toBe(0);
        expect(rose.p99SpeedMps).toBe(0);
    });
});
