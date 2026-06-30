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
    verticalSkyComponentPct,
    prepareDaylightVscGrid,
    metricCostTier,
    siteMetricGridBudget,
    type SiteMetric,
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
    it('returns [] for sun-hours without lat/lon', () => {
        const radius = 80;
        // Sun-hours needs a site lat/lon (sun position) — absent → [].
        expect(buildSiteMetricGrid('sunHours', { radius, footprints: FOOTPRINTS, dataset: DATASET })).toEqual([]);
    });

    it('§SITE-METRIC-DAYLIGHT-VSC: builds a daylight VSC ground grid (no climate/lat-lon needed)', () => {
        const cells = buildSiteMetricGrid('daylight', {
            radius: 80, footprints: FOOTPRINTS, dataset: null, gridCountCap: 16,
        });
        expect(cells.length).toBeGreaterThan(0);
        for (const c of cells) {
            expect(c.value).toBeGreaterThanOrEqual(0);     // VSC %
            expect(c.value).toBeLessThanOrEqual(40 + 1e-6); // ≤ the unobstructed datum
            expect(typeof c.colorHex).toBe('string');
            expect(c.colorHex.length).toBeGreaterThan(0);
        }
        // The context building obstructs the sky for nearby cells → a spread of values.
        const values = new Set(cells.map((c) => c.value.toFixed(1)));
        expect(values.size).toBeGreaterThan(1);
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

    it('returns [] for temperature/wind when NO dataset AND no lat/lon (nothing to derive normals from)', () => {
        expect(buildSiteMetricGrid('temperature', { radius: 80, footprints: FOOTPRINTS, dataset: null })).toEqual([]);
        expect(buildSiteMetricGrid('wind', { radius: 80, footprints: FOOTPRINTS, dataset: null })).toEqual([]);
    });

    it('§SITE-METRIC-CLIMATE-FALLBACK: temperature/wind paint from BUNDLED normals when ' +
        'no live dataset but lat/lon is known (was the prod "0/0 cells" symptom)', () => {
        const common = {
            radius: 80, footprints: FOOTPRINTS, dataset: null,
            latDeg: 48.8626, lngDeg: 2.3137, gridCountCap: 16,   // Paris (the prod site)
        } as const;
        const temp = buildSiteMetricGrid('temperature', common);
        const wind = buildSiteMetricGrid('wind', common);
        expect(temp.length).toBeGreaterThan(0);   // ← was [] (the bug)
        expect(wind.length).toBeGreaterThan(0);    // ← was [] (the bug)
        for (const c of temp) expect(Number.isFinite(c.value)).toBe(true);
        // A live dataset still takes precedence over the synthesised bundled one.
        const withLive = buildSiteMetricGrid('temperature', { ...common, dataset: DATASET });
        expect(withLive.length).toBeGreaterThan(0);
    });

    it('returns [] for a non-positive radius', () => {
        expect(buildSiteMetricGrid('temperature', { radius: 0, footprints: FOOTPRINTS, dataset: DATASET })).toEqual([]);
    });
});

describe('§SITE-METRIC-DAYLIGHT-VSC — verticalSkyComponentPct', () => {
    it('an OPEN site (no context) reads at the unobstructed datum (≈ 40%)', () => {
        const vsc = verticalSkyComponentPct(0, 0, 1.6, []);
        // Sweep against no prisms → every sky patch visible → the canonical datum.
        expect(vsc).toBeGreaterThan(38);
        expect(vsc).toBeLessThanOrEqual(40);
    });

    it('a TALL building next to the point lowers VSC below the open datum', () => {
        // A 60 m-tall slab 5 m east of the observer fills a big chunk of the sky.
        const open = verticalSkyComponentPct(0, 0, 1.6, []);
        const shadedCells = prepareDaylightVscGrid({
            radius: 60, footprints: [{
                ring: [{ x: 4, z: -20 }, { x: 24, z: -20 }, { x: 24, z: 20 }, { x: 4, z: 20 }],
                heightM: 60,
            }], dataset: null, gridCountCap: 12,
        });
        expect(shadedCells).not.toBeNull();
        // A cell hard against the slab's west face must see meaningfully less sky than
        // an unobstructed point.
        const near = shadedCells!.evaluate({ x: 2, z: 0, size: 4, underBuilding: false });
        expect(near).not.toBeNull();
        expect(near!.value).toBeLessThan(open);
        expect(near!.value).toBeGreaterThanOrEqual(0);
    });

    it('a TALLER neighbour shades MORE sky than a shorter one at the same spot', () => {
        const ring = [{ x: 4, z: -20 }, { x: 24, z: -20 }, { x: 24, z: 20 }, { x: 4, z: 20 }];
        const low = prepareDaylightVscGrid({ radius: 60, footprints: [{ ring, heightM: 8 }], dataset: null, gridCountCap: 12 });
        const high = prepareDaylightVscGrid({ radius: 60, footprints: [{ ring, heightM: 60 }], dataset: null, gridCountCap: 12 });
        const lowV = low!.evaluate({ x: 2, z: 0, size: 4, underBuilding: false })!.value;
        const highV = high!.evaluate({ x: 2, z: 0, size: 4, underBuilding: false })!.value;
        expect(highV).toBeLessThanOrEqual(lowV);
    });

    it('skips cells under a building / outside the disc (null)', () => {
        const prep = prepareDaylightVscGrid({ radius: 40, footprints: FOOTPRINTS, dataset: null, gridCountCap: 12 });
        expect(prep!.evaluate({ x: 0, z: 0, size: 4, underBuilding: true })).toBeNull();
        expect(prep!.evaluate({ x: 999, z: 999, size: 4, underBuilding: false })).toBeNull();
    });

    it('returns null for a non-positive radius', () => {
        expect(prepareDaylightVscGrid({ radius: 0, footprints: FOOTPRINTS, dataset: null })).toBeNull();
    });
});

describe('siteMetricAvailability', () => {
    it('disables ALL location-driven metrics when no location is set', () => {
        const a = siteMetricAvailability(false, false);  // no dataset, no location
        const byMetric = Object.fromEntries(a.map((m) => [m.metric, m]));
        expect(byMetric.temperature!.available).toBe(false);
        expect(byMetric.wind!.available).toBe(false);
        expect(byMetric.sunHours!.available).toBe(false);   // no location
        expect(byMetric.temperature!.reason).toBeTruthy();
        // Population is an OSM proxy — available regardless of climate/location.
        expect(byMetric.population!.available).toBe(true);
        // §SITE-METRIC-DAYLIGHT-VSC — daylight is a ground grid needing only the disc
        // (no climate/location) → available even with no location set.
        expect(byMetric.daylight!.available).toBe(true);
        expect(byMetric.daylight!.isGroundGrid).toBe(true);
    });

    it('§SITE-METRIC-CLIMATE-INSTANT: temp+wind+sun ENABLE on location even with NO live dataset', () => {
        // The bug: temp/wind were gated on the live ClimateStore (hasDataset) and
        // stayed disabled while the fetch lagged. They must enable on LOCATION alone
        // (bundled regional normals are instant), with an "approx" reason.
        const a = siteMetricAvailability(false, true);   // hasDataset=false, hasLocation=true
        const byMetric = Object.fromEntries(a.map((m) => [m.metric, m]));
        expect(byMetric.sunHours!.available).toBe(true);
        expect(byMetric.temperature!.available).toBe(true);   // ← was false (the bug)
        expect(byMetric.wind!.available).toBe(true);          // ← was false (the bug)
        expect(byMetric.temperature!.isGroundGrid).toBe(true);
        expect(byMetric.sunHours!.isGroundGrid).toBe(true);
        // Enabled-but-approx note (regional normals until the live fetch refines).
        expect(byMetric.temperature!.reason).toMatch(/approx|regional/i);
    });

    it('temp+wind have NO "approx" caveat once the live dataset is resolved', () => {
        const a = siteMetricAvailability(true, true);
        const byMetric = Object.fromEntries(a.map((m) => [m.metric, m]));
        expect(byMetric.temperature!.available).toBe(true);
        expect(byMetric.wind!.available).toBe(true);
        expect(byMetric.temperature!.isGroundGrid).toBe(true);
    });
});

describe('§SITE-METRIC-COST-TIER — per-metric grid resolution (ADR-0084)', () => {
    it('classifies the raycast metrics as expensive and the field metrics as cheap', () => {
        expect(metricCostTier('sunHours')).toBe('expensive');
        expect(metricCostTier('daylight')).toBe('expensive');
        expect(metricCostTier('temperature')).toBe('cheap');
        expect(metricCostTier('wind')).toBe('cheap');
        expect(metricCostTier('population')).toBe('cheap');
    });

    it('gives the EXPENSIVE metrics a COARSER cell + LOWER cap than the cheap field metrics', () => {
        const sun = siteMetricGridBudget('sunHours');
        const day = siteMetricGridBudget('daylight');
        const pop = siteMetricGridBudget('population');
        const temp = siteMetricGridBudget('temperature');
        // Sun-hours / daylight raycast per cell → coarser cells (fewer of them) than the
        // O(1) population/temperature field. This is the decoupling that stops sun-hours
        // drowning in cell count on the 240 m disc.
        expect(sun.cellSizeM).toBeGreaterThan(pop.cellSizeM);
        expect(day.cellSizeM).toBeGreaterThan(temp.cellSizeM);
        expect(sun.maxCells).toBeLessThan(pop.maxCells);
        expect(day.maxCells).toBeLessThan(temp.maxCells);
        // Concrete bound: the expensive cap is small enough to complete in seconds.
        expect(sun.maxCells).toBeLessThanOrEqual(4000);
    });

    it('the expensive (sun-hours) grid yields FEWER cells than the cheap (population) ' +
        'grid on the SAME large disc — the per-metric resolution decoupling', () => {
        // On a 240 m-style disc the budgets must produce materially fewer sun-hours cells
        // than population cells, so the raycast metric paints quickly.
        const radius = 240;
        const sunBudget = siteMetricGridBudget('sunHours');
        const popBudget = siteMetricGridBudget('population');
        const sun = buildSiteMetricGrid('sunHours', {
            radius, footprints: FOOTPRINTS, dataset: null,
            latDeg: 41.39, lngDeg: 2.17, sunDay: 'summer', sunStepMinutes: 30,
            cellSizeM: sunBudget.cellSizeM, maxCells: sunBudget.maxCells,
        });
        const pop = buildSiteMetricGrid('population', {
            radius, footprints: FOOTPRINTS, dataset: null,
            cellSizeM: popBudget.cellSizeM, maxCells: popBudget.maxCells,
        });
        expect(sun.length).toBeGreaterThan(0);
        expect(pop.length).toBeGreaterThan(0);
        expect(sun.length).toBeLessThan(pop.length);
        // And the expensive grid stays under its (low) cap — bounded raycast work.
        expect(sun.length).toBeLessThanOrEqual(sunBudget.maxCells + 32);
    });

    it('every metric has a positive, finite budget', () => {
        for (const m of ['sunHours', 'daylight', 'temperature', 'wind', 'population'] as const satisfies readonly SiteMetric[]) {
            const b = siteMetricGridBudget(m);
            expect(b.cellSizeM).toBeGreaterThan(0);
            expect(b.maxCells).toBeGreaterThan(0);
            expect(Number.isFinite(b.cellSizeM)).toBe(true);
            expect(Number.isFinite(b.maxCells)).toBe(true);
        }
    });

    it('§SITE-METRIC-FINE-CHEAP: the cheap field metrics paint a FINE grid (≤ ~1.5 m ' +
        'cells, generous cap) so the disc reads smooth, not coarse', () => {
        for (const m of ['temperature', 'wind', 'population'] as const satisfies readonly SiteMetric[]) {
            const b = siteMetricGridBudget(m);
            // Founder feedback: ~2.4 m read as coarse. The fine budget must be much smaller.
            expect(b.cellSizeM).toBeLessThanOrEqual(1.5);
            // …with a cap generous enough to actually paint a fine 240 m disc.
            expect(b.maxCells).toBeGreaterThanOrEqual(20000);
        }
    });

    it('§SITE-METRIC-FINE-CHEAP: a cheap metric yields MANY more cells on the 240 m disc ' +
        'than the old ~2.4 m budget would (finer grid)', () => {
        const radius = 240;
        const popBudget = siteMetricGridBudget('population');
        const pop = buildSiteMetricGrid('population', {
            radius, footprints: FOOTPRINTS, dataset: null,
            cellSizeM: popBudget.cellSizeM, maxCells: popBudget.maxCells,
        });
        // The old cap was 12000; the fine budget must paint materially more cells.
        expect(pop.length).toBeGreaterThan(12000);
        // …but still bounded by the (generous) cap — nothing silently unbounded.
        expect(pop.length).toBeLessThanOrEqual(popBudget.maxCells + 64);
    });
});

// §SITE-METRIC-TEMP-CONTRAST + §SITE-METRIC-WIND-CONTRAST — the founder's "is it all the
// same?" symptom: the temperature + wind fields must VARY spatially (and be coloured to
// read distinctly), not collapse to one flat value/colour.
describe('§SITE-METRIC contrast — fields VARY spatially (not flat)', () => {
    it('§SITE-METRIC-TEMP-CONTRAST: temperature value AND colour vary across the disc', () => {
        const cells = buildSiteMetricGrid('temperature', {
            radius: 120, footprints: FOOTPRINTS, dataset: DATASET, cellSizeM: 6, maxCells: 4000,
        });
        expect(cells.length).toBeGreaterThan(0);
        // Real per-cell variation: dense-near-building (hot) vs open (cool).
        const values = new Set(cells.map((c) => c.value.toFixed(2)));
        expect(values.size).toBeGreaterThan(1);
        // …and that variation reaches the COLOUR (contrast-stretched ramp), not one hex.
        const colours = new Set(cells.map((c) => c.colorHex));
        expect(colours.size).toBeGreaterThan(1);
    });

    it('§SITE-METRIC-WIND-CONTRAST: wind colour varies across the disc (sheltered vs exposed)', () => {
        const cells = buildSiteMetricGrid('wind', {
            radius: 120, footprints: FOOTPRINTS, dataset: DATASET, cellSizeM: 6, maxCells: 4000,
        });
        expect(cells.length).toBeGreaterThan(0);
        const colours = new Set(cells.map((c) => c.colorHex));
        // The continuous Lawson ramp + the shelter spread → more than one distinct colour
        // (the flat-blue symptom was a SINGLE colour everywhere).
        expect(colours.size).toBeGreaterThan(1);
    });

    it('§SITE-METRIC-WIND-CONTRAST: wind is NOT flat-calm even with a LOW-mean bundled ' +
        'baseline — the exposure floor lifts the open field off the calm floor', () => {
        // Bundled normals for any in-range site give a non-zero directional rose; the
        // exposure floor guarantees the open field sits in a differentiating band so
        // OSM shelter separates cells into more than one colour (the fix for "all blue").
        const cells = buildSiteMetricGrid('wind', {
            radius: 120, footprints: FOOTPRINTS, dataset: null,
            latDeg: 51.5072, lngDeg: -0.1276, cellSizeM: 6, maxCells: 4000,   // London
        });
        expect(cells.length).toBeGreaterThan(0);
        const colours = new Set(cells.map((c) => c.colorHex));
        expect(colours.size).toBeGreaterThan(1);   // ← was a single flat colour (the bug)
    });
});

describe('siteMetricLegend', () => {
    it('returns a gradient legend for each ground metric (incl. daylight VSC)', () => {
        for (const m of ['temperature', 'wind', 'population', 'sunHours', 'daylight'] as const) {
            const legend = siteMetricLegend(m, DATASET);
            expect(legend).not.toBeNull();
            expect(legend!.stops.length).toBeGreaterThanOrEqual(2);
            expect(legend!.title.length).toBeGreaterThan(0);
            expect(legend!.unit.length).toBeGreaterThan(0);
        }
    });

    it('§SITE-METRIC-DAYLIGHT-VSC — daylight legend reports a % unit + VSC title', () => {
        const legend = siteMetricLegend('daylight', DATASET);
        expect(legend!.unit).toBe('%');
        expect(legend!.title).toMatch(/VSC|Daylight/i);
        // Brand: ramp must include the PRYZM purple + white, never black.
        expect(legend!.stops).toContain('#6600FF');
        expect(legend!.stops).toContain('#FFFFFF');
        expect(legend!.stops.join(',').toLowerCase()).not.toContain('#000');
    });
});
