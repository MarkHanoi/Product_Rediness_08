// §SITE-METRIC-HEATMAP — unit tests for the pure side-3D metric-grid bridge.
//
// The bridge composes @pryzm/street-analytics into coloured ground cells in the
// site-ENU frame + the per-metric legend, and classifies which metrics are
// renderable with the data to hand (the Forma "no data source wired" affordance).
// Pure: no Cesium / THREE / DOM — these run in the node env.

import { describe, it, expect } from 'vitest';
import { buildFallbackClimateDataset } from '@pryzm/climate-host';
import {
    buildSiteMetricGrid,
    siteMetricLegend,
    siteMetricAvailability,
    type MetricFootprint,
} from '../src/ui/climate/siteMetricGrids';

// A bundled (offline, deterministic) dataset for a temperate site — non-empty
// monthly normals + a synthesised 16-sector wind rose.
const DATASET = buildFallbackClimateDataset({
    id: 'climate:0123456789abcdef',
    siteRef: 'site-test-001',
    lat: 41.39,
    lon: 2.17,
    elevationM: 12,
    timezone: 'Europe/Madrid',
});

// One context building NE of the origin so the grids have built density to read.
const FOOTPRINTS: MetricFootprint[] = [
    {
        ring: [
            { x: 10, z: 10 }, { x: 30, z: 10 }, { x: 30, z: 30 }, { x: 10, z: 30 },
        ],
        heightM: 24,
        floors: 8,
    },
];

describe('buildSiteMetricGrid', () => {
    it('returns [] for daylight (BIM-view-only) and for sun-hours without lat/lon', () => {
        const radius = 80;
        expect(buildSiteMetricGrid('daylight', { radius, footprints: FOOTPRINTS, dataset: DATASET })).toEqual([]);
        // Sun-hours needs a site lat/lon (sun position) — absent → [].
        expect(buildSiteMetricGrid('sunHours', { radius, footprints: FOOTPRINTS, dataset: DATASET })).toEqual([]);
    });

    it('builds a sun-hours ground heatmap from lat/lon (shadows reduce hours)', () => {
        const cells = buildSiteMetricGrid('sunHours', {
            radius: 80, footprints: FOOTPRINTS, dataset: null,
            latDeg: 41.39, lngDeg: 2.17, sunDay: 'summer', sunStepMinutes: 30,
            gridCountCap: 16,
        });
        expect(cells.length).toBeGreaterThan(0);
        for (const c of cells) {
            expect(c.value).toBeGreaterThanOrEqual(0);   // hours
            expect(typeof c.colorHex).toBe('string');
            expect(c.colorHex.length).toBeGreaterThan(0);
        }
        // The building casts shadow on some cells → a spread of sun-hours values
        // (not every cell sees the full uninterrupted day).
        const values = new Set(cells.map((c) => c.value.toFixed(1)));
        expect(values.size).toBeGreaterThan(1);
        // Some cell gets meaningful sun (the open SW corner is unshaded at midday).
        expect(cells.some((c) => c.value > 1)).toBe(true);
    });

    it('winter sun-hours are no greater than summer at the same site', () => {
        const common = {
            radius: 80, footprints: FOOTPRINTS, dataset: null,
            latDeg: 41.39, lngDeg: 2.17, sunStepMinutes: 30, gridCountCap: 12,
        } as const;
        const summer = buildSiteMetricGrid('sunHours', { ...common, sunDay: 'summer' });
        const winter = buildSiteMetricGrid('sunHours', { ...common, sunDay: 'winter' });
        const maxOf = (cs: typeof summer) => cs.reduce((m, c) => Math.max(m, c.value), 0);
        expect(maxOf(winter)).toBeLessThanOrEqual(maxOf(summer) + 1e-6);
    });

    it('builds coloured temperature (UHI) cells from the climate baseline', () => {
        const cells = buildSiteMetricGrid('temperature', {
            radius: 80, footprints: FOOTPRINTS, dataset: DATASET, gridCountCap: 16,
        });
        expect(cells.length).toBeGreaterThan(0);
        for (const c of cells) {
            expect(typeof c.colorHex).toBe('string');
            expect(c.colorHex.length).toBeGreaterThan(0);
            expect(Number.isFinite(c.value)).toBe(true);   // °C
            expect(c.halfSize).toBeGreaterThan(0);
        }
    });

    it('builds wind-comfort cells and varies effective speed across the site', () => {
        const cells = buildSiteMetricGrid('wind', {
            radius: 80, footprints: FOOTPRINTS, dataset: DATASET, gridCountCap: 16,
        });
        expect(cells.length).toBeGreaterThan(0);
        const speeds = new Set(cells.map((c) => c.value.toFixed(2)));
        // Shelter near the building lowers speed → more than one distinct value.
        expect(speeds.size).toBeGreaterThan(1);
    });

    it('builds population-density cells WITHOUT a climate dataset (OSM proxy)', () => {
        const cells = buildSiteMetricGrid('population', {
            radius: 80, footprints: FOOTPRINTS, dataset: null, gridCountCap: 16,
        });
        expect(cells.length).toBeGreaterThan(0);
        // At least one cell over the building footprint reads non-zero density.
        expect(cells.some((c) => c.value > 0)).toBe(true);
    });

    it('returns [] for temperature/wind when no dataset is available', () => {
        expect(buildSiteMetricGrid('temperature', { radius: 80, footprints: FOOTPRINTS, dataset: null })).toEqual([]);
        expect(buildSiteMetricGrid('wind', { radius: 80, footprints: FOOTPRINTS, dataset: null })).toEqual([]);
    });

    it('returns [] for a non-positive radius', () => {
        expect(buildSiteMetricGrid('temperature', { radius: 0, footprints: FOOTPRINTS, dataset: DATASET })).toEqual([]);
    });
});

describe('siteMetricAvailability', () => {
    it('disables climate metrics without a dataset and sun hours without a location', () => {
        const a = siteMetricAvailability(false, false);
        const byMetric = Object.fromEntries(a.map((m) => [m.metric, m]));
        expect(byMetric.temperature!.available).toBe(false);
        expect(byMetric.wind!.available).toBe(false);
        expect(byMetric.sunHours!.available).toBe(false);   // no location
        expect(byMetric.temperature!.reason).toBeTruthy();
        // Population is an OSM proxy — available regardless of climate.
        expect(byMetric.population!.available).toBe(true);
        // Daylight is BIM-view only here.
        expect(byMetric.daylight!.available).toBe(false);
    });

    it('enables sun hours once a location exists (no climate dataset needed)', () => {
        const a = siteMetricAvailability(false, true);   // hasDataset=false, hasLocation=true
        const byMetric = Object.fromEntries(a.map((m) => [m.metric, m]));
        expect(byMetric.sunHours!.available).toBe(true);
        // Sun-hours is a GROUND grid now (renders like the others).
        expect(byMetric.sunHours!.isGroundGrid).toBe(true);
        // Climate metrics still gated on the dataset.
        expect(byMetric.temperature!.available).toBe(false);
    });

    it('enables climate metrics once a dataset exists', () => {
        const a = siteMetricAvailability(true, true);
        const byMetric = Object.fromEntries(a.map((m) => [m.metric, m]));
        expect(byMetric.temperature!.available).toBe(true);
        expect(byMetric.wind!.available).toBe(true);
        expect(byMetric.temperature!.isGroundGrid).toBe(true);
    });
});

describe('siteMetricLegend', () => {
    it('returns a gradient legend for each ground + surface metric', () => {
        for (const m of ['temperature', 'wind', 'population', 'sunHours'] as const) {
            const legend = siteMetricLegend(m, DATASET);
            expect(legend).not.toBeNull();
            expect(legend!.stops.length).toBeGreaterThanOrEqual(2);
            expect(legend!.title.length).toBeGreaterThan(0);
            expect(legend!.unit.length).toBeGreaterThan(0);
        }
    });

    it('returns null for daylight (no side-3D legend)', () => {
        expect(siteMetricLegend('daylight', DATASET)).toBeNull();
    });
});
