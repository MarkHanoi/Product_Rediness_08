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
    it('returns [] for the surface-raycast metrics (sun hours / daylight)', () => {
        const radius = 80;
        expect(buildSiteMetricGrid('sunHours', { radius, footprints: FOOTPRINTS, dataset: DATASET })).toEqual([]);
        expect(buildSiteMetricGrid('daylight', { radius, footprints: FOOTPRINTS, dataset: DATASET })).toEqual([]);
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
    it('disables climate metrics without a dataset and sun hours without a massing', () => {
        const a = siteMetricAvailability(false, false);
        const byMetric = Object.fromEntries(a.map((m) => [m.metric, m]));
        expect(byMetric.temperature!.available).toBe(false);
        expect(byMetric.wind!.available).toBe(false);
        expect(byMetric.sunHours!.available).toBe(false);
        expect(byMetric.temperature!.reason).toBeTruthy();
        // Population is an OSM proxy — available regardless of climate.
        expect(byMetric.population!.available).toBe(true);
        // Daylight is BIM-view only here.
        expect(byMetric.daylight!.available).toBe(false);
    });

    it('enables climate metrics + sun hours once data + massing exist', () => {
        const a = siteMetricAvailability(true, true);
        const byMetric = Object.fromEntries(a.map((m) => [m.metric, m]));
        expect(byMetric.temperature!.available).toBe(true);
        expect(byMetric.wind!.available).toBe(true);
        expect(byMetric.sunHours!.available).toBe(true);
        // Ground-grid flag distinguishes the renderer path.
        expect(byMetric.temperature!.isGroundGrid).toBe(true);
        expect(byMetric.sunHours!.isGroundGrid).toBe(false);
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
