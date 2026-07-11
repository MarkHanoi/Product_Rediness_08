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
    prepareSunHoursGrid,
    rasterizeSunHoursTexture,
    rasterizeMetricTexture,
    metricCostTier,
    siteMetricGridBudget,
    buildFacadeSamplePoints,
    prepareFacadeSunGrid,
    rasterizeFacadeSunTexture,
    normalizeFacadeStudy,
    planFacadeSampling,
    buildRealWindRose,
    __sunHoursBvhEquivalenceProbe,
    facadeOpeningUvRects,
    computeSunIntensitiesForProbes,
    type SiteMetric,
    type MetricFootprint,
    type SunProbe,
    type FacadeOpeningRect,
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

    it('§SITE-METRIC-POP-CONTRAST: population density shows clear spatial variation (not one flat colour)', () => {
        // A dense tall block + a low-rise block + open ground → the GFA proxy must read
        // as clearly DIFFERENT density (the founder "is it all the same colour?" defect).
        const mixed: MetricFootprint[] = [
            { ring: [{ x: -40, z: -40 }, { x: -10, z: -40 }, { x: -10, z: -10 }, { x: -40, z: -10 }], heightM: 60, floors: 20 },
            { ring: [{ x: 15, z: 15 }, { x: 30, z: 15 }, { x: 30, z: 30 }, { x: 15, z: 30 }], heightM: 6, floors: 2 },
        ];
        const cells = buildSiteMetricGrid('population', {
            radius: 90, footprints: mixed, dataset: null, gridCountCap: 48,
        });
        expect(cells.length).toBeGreaterThan(0);
        // Density VALUES vary (engine real numbers) AND the displayed COLOURS vary after
        // the contrast stretch — high-density core vs low/open must not collapse to one.
        const values = new Set(cells.map((c) => c.value.toFixed(3)));
        expect(values.size).toBeGreaterThan(1);
        const colours = new Set(cells.map((c) => c.colorHex));
        expect(colours.size).toBeGreaterThan(2);   // a spread across the ramp, not flat
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

    it('§SITE-METRIC-PERF-INSTANT: the cheap field metrics compute on a SMALL, instant ' +
        'grid (the 512² texture upsamples it, so coarse looks identical but paints in one ' +
        'synchronous sub-ms pass)', () => {
        const sun = siteMetricGridBudget('sunHours');
        const day = siteMetricGridBudget('daylight');
        const pop = siteMetricGridBudget('population');
        const temp = siteMetricGridBudget('temperature');
        // §SITE-METRIC-PERF-INSTANT (founder 2026-06-30) — the cheap O(1) fields were
        // oversampled to ~55k cells (chunked across frames → "takes ages"). The DISPLAY is
        // a 512² bilinear texture regardless of cell count, so the cheap grid is now a
        // small ~64×64 (~4k) lattice that builds in ONE pass → instant paint. The expensive
        // raycast metrics keep their own (also-bounded) budget.
        expect(pop.maxCells).toBeLessThanOrEqual(5000);
        expect(temp.maxCells).toBeLessThanOrEqual(5000);
        // The expensive COMPUTE cap stays small enough to complete in seconds.
        expect(sun.maxCells).toBeLessThanOrEqual(5000);
        expect(day.maxCells).toBeLessThanOrEqual(5000);
    });

    it('§SITE-METRIC-PERF-INSTANT: the cheap grid stays well under 5000 cells on the 240 m ' +
        'disc, so the per-cell COMPUTE is a single instant pass (no §perf cell-cap clamp)', () => {
        const radius = 240;
        const popBudget = siteMetricGridBudget('population');
        const pop = buildSiteMetricGrid('population', {
            radius, footprints: FOOTPRINTS, dataset: null,
            cellSizeM: popBudget.cellSizeM, maxCells: popBudget.maxCells,
        });
        expect(pop.length).toBeGreaterThan(0);
        // Far fewer than the old ~55k — a few thousand cells, bounded by the small cap.
        expect(pop.length).toBeLessThanOrEqual(popBudget.maxCells + 64);
        expect(pop.length).toBeLessThanOrEqual(5000);
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

// §SITE-METRIC-SUN-TEXTURE — the DISPLAY/COMPUTE decouple: compute on the affordable
// raycast grid, render as ONE smooth bilinearly-interpolated texture. These pin the
// pure rasterizer: correct size/shape, the round-disc alpha cutout, interpolation
// continuity, masked-hole fill, and that the texture reads the SAME colour ramp.
describe('rasterizeSunHoursTexture (§SITE-METRIC-SUN-TEXTURE)', () => {
    const SUN_INPUT = {
        radius: 80, footprints: FOOTPRINTS, dataset: null,
        latDeg: 41.39, lngDeg: 2.17, sunDay: 'summer' as const, sunStepMinutes: 30,
        gridCountCap: 16,
    };

    it('exposes evaluateIntensity (0..1) consistent with the discrete colour cell', () => {
        const prep = prepareSunHoursGrid(SUN_INPUT);
        expect(prep).not.toBeNull();
        // Find a cell that is in the open (some sun) and one under the building.
        const lit = prep!.cells.find((c) => !c.underBuilding && Math.hypot(c.x, c.z) <= SUN_INPUT.radius);
        expect(lit).toBeDefined();
        const intensity = prep!.evaluateIntensity(lit!);
        expect(intensity).not.toBeNull();
        expect(intensity!).toBeGreaterThanOrEqual(0);
        expect(intensity!).toBeLessThanOrEqual(1);
        // The discrete cell colour must come from the SAME intensity (parity).
        const cell = prep!.evaluate(lit!);
        expect(cell).not.toBeNull();
        // Under-building cells yield null intensity (a texture hole filled by neighbours).
        const under = prep!.cells.find((c) => c.underBuilding);
        if (under) expect(prep!.evaluateIntensity(under)).toBeNull();
    });

    it('rasterises a square RGBA texture with a round transparent cutout', () => {
        const prep = prepareSunHoursGrid(SUN_INPUT)!;
        const intensities = prep.cells.map((c) => prep.evaluateIntensity(c));
        const tex = rasterizeSunHoursTexture(prep, intensities, 64);
        expect(tex.size).toBe(64);
        expect(tex.rgba.length).toBe(64 * 64 * 4);
        expect(tex.radiusM).toBe(prep.radiusM);
        expect(tex.sampleCount).toBeGreaterThan(0);
        // The CENTRE texel sits inside the disc → opaque(ish); a CORNER sits OUTSIDE the
        // inscribed circle → fully transparent (the Forma round cutout).
        const at = (tx: number, ty: number, ch: number) => tex.rgba[(ty * tex.size + tx) * 4 + ch]!;
        const mid = Math.floor(tex.size / 2);
        expect(at(mid, mid, 3)).toBeGreaterThan(0);     // centre opaque
        expect(at(0, 0, 3)).toBe(0);                    // corner outside disc → alpha 0
        expect(at(tex.size - 1, tex.size - 1, 3)).toBe(0);
    });

    it('interpolates smoothly — neighbouring texels differ by small steps (no big squares)', () => {
        const prep = prepareSunHoursGrid(SUN_INPUT)!;
        const intensities = prep.cells.map((c) => prep.evaluateIntensity(c));
        const tex = rasterizeSunHoursTexture(prep, intensities, 96);
        const mid = Math.floor(tex.size / 2);
        const red = (tx: number) => tex.rgba[(mid * tex.size + tx) * 4]!;
        // Along the central opaque row, adjacent texels should not jump by a full ramp
        // step (bilinear interpolation = gradual). Scan the inner third (well inside disc).
        let maxJump = 0;
        for (let tx = mid - 10; tx < mid + 10; tx++) {
            const a = tex.rgba[(mid * tex.size + tx) * 4 + 3]!;
            const b = tex.rgba[(mid * tex.size + tx + 1) * 4 + 3]!;
            if (a > 0 && b > 0) maxJump = Math.max(maxJump, Math.abs(red(tx + 1) - red(tx)));
        }
        // A discrete-cell render would jump by tens of units at each cell boundary; the
        // interpolated texture moves in small steps. Generous bound (just proves smoothing).
        expect(maxJump).toBeLessThan(60);
    });

    it('DEFAULT display resolution is fine (~≤1 m/texel on a 240 m disc) — the founder "10× finer" target', () => {
        // The point of the decouple: DISPLAY is ~10× finer than the coarse raycast
        // COMPUTE grid. On a 240 m (480 m-wide) disc the default texture must give
        // ~≤1 m visual texels (the cheap-metric "fine/smooth" look), NOT ~8 m squares.
        const prep = prepareSunHoursGrid({ ...SUN_INPUT, radius: 240 })!;
        const intensities = prep.cells.map((c) => prep.evaluateIntensity(c));
        const tex = rasterizeSunHoursTexture(prep, intensities);   // default texSize
        const metresPerTexel = (2 * tex.radiusM) / tex.size;
        expect(metresPerTexel).toBeLessThanOrEqual(1.0);
        // …while the COMPUTE grid stays affordable (coarse, no raycast hang).
        expect(prep.cellSizeM).toBeGreaterThanOrEqual(3);
    });

    it('masked-hole fill: a cell under the building still gets a colour from neighbours', () => {
        const prep = prepareSunHoursGrid(SUN_INPUT)!;
        const intensities = prep.cells.map((c) => prep.evaluateIntensity(c));
        const tex = rasterizeSunHoursTexture(prep, intensities, 128);
        // Sample the texel over the building centre (≈ (20,20) ENU). Even though those
        // compute cells are holes, the bilinear masked fill paints SOME opaque colour
        // (from surrounding lit cells) rather than a transparent punch-out inside the disc.
        const R = tex.radiusM;
        const east = 20, north = 20;
        const tx = Math.floor(((east + R) / (2 * R)) * tex.size);
        const ty = Math.floor(((R - north) / (2 * R)) * tex.size);
        const alpha = tex.rgba[(ty * tex.size + tx) * 4 + 3]!;
        expect(alpha).toBeGreaterThan(0);   // filled, not a transparent square
    });
});

// §SITE-METRIC-TEXTURE — the UNIVERSAL smooth render path: rasterise ANY metric's
// coloured cells into one bilinearly-interpolated texture (RGB-space, metric-agnostic),
// so EVERY metric (temperature included) displays fine + smooth with no per-cell entity
// cap. These pin: it works from the cheap metrics' OWN cells, honours their ramp colour,
// has the round cutout, and interpolates RGB smoothly.
describe('rasterizeMetricTexture (§SITE-METRIC-TEXTURE — universal smooth render)', () => {
    it('rasterises a CHEAP metric (temperature) into a smooth round texture honouring its ramp', () => {
        const cells = buildSiteMetricGrid('temperature', {
            radius: 120, footprints: FOOTPRINTS, dataset: DATASET, gridCountCap: 40,
        });
        expect(cells.length).toBeGreaterThan(0);
        // Derive the cell spacing from the cells themselves (2·halfSize).
        const cellSize = cells[0]!.halfSize * 2;
        const tex = rasterizeMetricTexture(cells, 120, cellSize, 128);
        expect(tex.size).toBe(128);
        expect(tex.rgba.length).toBe(128 * 128 * 4);
        expect(tex.sampleCount).toBeGreaterThan(0);
        const at = (tx: number, ty: number, ch: number) => tex.rgba[(ty * tex.size + tx) * 4 + ch]!;
        const mid = Math.floor(tex.size / 2);
        expect(at(mid, mid, 3)).toBeGreaterThan(0);   // centre opaque
        expect(at(0, 0, 3)).toBe(0);                  // corner outside disc → transparent
        // The texture colours come from the warm UHI ramp (red-dominant), NOT grey/black:
        // some opaque texel must be warm (R clearly above B).
        let sawWarm = false;
        for (let i = 0; i < tex.rgba.length && !sawWarm; i += 4) {
            if (tex.rgba[i + 3]! > 0 && tex.rgba[i]! > tex.rgba[i + 2]! + 20) sawWarm = true;
        }
        expect(sawWarm).toBe(true);
    });

    it('interpolates RGB smoothly across the field (no hard cell edges)', () => {
        const cells = buildSiteMetricGrid('population', {
            radius: 120, footprints: FOOTPRINTS, dataset: null, gridCountCap: 30,
        });
        const cellSize = cells[0]!.halfSize * 2;
        const tex = rasterizeMetricTexture(cells, 120, cellSize, 128);
        const mid = Math.floor(tex.size / 2);
        let maxJump = 0;
        for (let tx = mid - 12; tx < mid + 12; tx++) {
            const a3 = tex.rgba[(mid * tex.size + tx) * 4 + 3]!;
            const b3 = tex.rgba[(mid * tex.size + tx + 1) * 4 + 3]!;
            if (a3 > 0 && b3 > 0) {
                const aR = tex.rgba[(mid * tex.size + tx) * 4]!;
                const bR = tex.rgba[(mid * tex.size + tx + 1) * 4]!;
                maxJump = Math.max(maxJump, Math.abs(bR - aR));
            }
        }
        expect(maxJump).toBeLessThan(60);   // gradual, not a per-cell step
    });

    it('default display resolution is fine (~≤1 m/texel) for cheap metrics too', () => {
        const cells = buildSiteMetricGrid('temperature', {
            radius: 240, footprints: FOOTPRINTS, dataset: DATASET,
        });
        const cellSize = cells[0]!.halfSize * 2;
        const tex = rasterizeMetricTexture(cells, 240, cellSize);   // default texSize
        const metresPerTexel = (2 * tex.radiusM) / tex.size;
        expect(metresPerTexel).toBeLessThanOrEqual(1.0);   // temperature is fine, not blocky
    });
});

// ── §FORMA-FACADE-ANALYSIS (ADR-0093) — designed-building façade sun analysis ──

// A simple 10 m × 10 m building footprint (site-ENU XZ metres, x = east, z = north).
const BUILDING_RING = [
    { x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 },
];

describe('§FORMA-FACADE-ANALYSIS — buildFacadeSamplePoints', () => {
    it('generates wall + roof sample points across the footprint', () => {
        const pts = buildFacadeSamplePoints([BUILDING_RING], 6, 2.5, 4000);
        expect(pts.length).toBeGreaterThan(0);
        const walls = pts.filter((p) => p.surface === 'wall');
        const roof = pts.filter((p) => p.surface === 'roof');
        expect(walls.length).toBeGreaterThan(0);
        expect(roof.length).toBeGreaterThan(0);
    });

    it('wall points carry a unit OUTWARD normal; roof points face up (0,0)', () => {
        const pts = buildFacadeSamplePoints([BUILDING_RING], 6);
        for (const p of pts) {
            if (p.surface === 'wall') {
                const mag = Math.hypot(p.normE, p.normN);
                expect(mag).toBeCloseTo(1, 5);
                // Outward: the normal points away from the (0,0) centroid at the face.
                expect(p.east * p.normE + p.north * p.normN).toBeGreaterThan(0);
            } else {
                expect(p.normE).toBe(0);
                expect(p.normN).toBe(0);
            }
        }
    });

    it('keeps wall heights within the building height', () => {
        const H = 8;
        const pts = buildFacadeSamplePoints([BUILDING_RING], H);
        for (const p of pts) expect(p.up).toBeLessThanOrEqual(H + 0.1);
    });

    it('respects the maxSamples cap (decimates uniformly)', () => {
        const pts = buildFacadeSamplePoints([BUILDING_RING], 30, 0.5, 200);
        expect(pts.length).toBeLessThanOrEqual(200);
        expect(pts.length).toBeGreaterThan(0);
    });

    it('returns [] for a degenerate ring', () => {
        expect(buildFacadeSamplePoints([[{ x: 0, z: 0 }, { x: 1, z: 1 }]], 6)).toEqual([]);
    });
});

// ── §ANALYSIS-REAL-* (ADR-0095) — real free-dataset baselines drive the metrics ──

describe('§ANALYSIS-REAL-POPULATION — real WorldPop density anchors the population map', () => {
    it('reports REAL persons/hectare in the cell values (not the OSM GFA proxy)', () => {
        const realPerHa = 480; // a dense residential neighbourhood
        const cells = buildSiteMetricGrid('population', {
            radius: 90, footprints: FOOTPRINTS, dataset: null, gridCountCap: 32,
            realPopulationPerHa: realPerHa,
        });
        expect(cells.length).toBeGreaterThan(0);
        // Values are now persons/HECTARE anchored to the real plot mean — the plot-average
        // over the disc should be near the supplied real density (the OSM pattern only
        // redistributes it), i.e. a realistic hundreds-of-p/ha scale, not the ~0.0x p/m².
        const mean = cells.reduce((a, c) => a + c.value, 0) / cells.length;
        expect(mean).toBeGreaterThan(1);        // real p/ha scale, not the p/m² proxy
        expect(Number.isFinite(mean)).toBe(true);
    });

    it('a monument/open site with a low real density reads honestly LOW', () => {
        // Even with a big footprint (which the OSM proxy would read as "busy"), a low
        // real WorldPop density keeps the whole field honestly low.
        const cells = buildSiteMetricGrid('population', {
            radius: 90, footprints: FOOTPRINTS, dataset: null, gridCountCap: 32,
            realPopulationPerHa: 8,   // a landmark plaza — very few residents
        });
        const mean = cells.reduce((a, c) => a + c.value, 0) / cells.length;
        expect(mean).toBeLessThan(40);   // honestly low, not a fake hotspot
    });
});

describe('§ANALYSIS-REAL-TEMPERATURE — real base air temp modulated by UHI', () => {
    it('uses the REAL baseline air temp as the base value the UHI ΔT sits on', () => {
        const realBase = 31; // a hot-climate real warm-season mean
        const cells = buildSiteMetricGrid('temperature', {
            radius: 90, footprints: FOOTPRINTS, dataset: DATASET, gridCountCap: 24,
            realBaselineTempC: realBase,
        });
        expect(cells.length).toBeGreaterThan(0);
        // Every cell is at least the real base (UHI only ADDS heat over open ground).
        for (const c of cells) expect(c.value).toBeGreaterThanOrEqual(realBase - 1e-6);
        // The hottest cell is the real base + a positive UHI ΔT.
        const maxC = cells.reduce((m, c) => Math.max(m, c.value), -Infinity);
        expect(maxC).toBeGreaterThanOrEqual(realBase);
    });
});

describe('§ANALYSIS-REAL-WIND — real NASA POWER freestream drives the Lawson field', () => {
    it('varies across the disc with a real freestream + real prevailing direction', () => {
        const cells = buildSiteMetricGrid('wind', {
            radius: 120, footprints: FOOTPRINTS, dataset: DATASET, cellSizeM: 6, maxCells: 4000,
            realWindMeanMs: 6.4, realWindFromDeg: 315,   // real: 6.4 m/s from NW
        });
        expect(cells.length).toBeGreaterThan(0);
        const colours = new Set(cells.map((c) => c.colorHex));
        expect(colours.size).toBeGreaterThan(1);   // shelter modulates the real freestream
    });
});

describe('§ANALYSIS-REAL-WIND — buildRealWindRose', () => {
    it('builds a 16-sector rose peaking at the real prevailing direction', () => {
        const rose = buildRealWindRose(6.0, 90 /* from E */, 12.0);
        expect(rose.sectors.length).toBe(16);
        expect(rose.meanSpeedMps).toBeCloseTo(6.0, 5);
        expect(rose.p99SpeedMps).toBeCloseTo(12.0, 5);
        // The sector at the prevailing direction (90°) carries the most hours.
        const hoursAt = (deg: number) =>
            rose.sectors.find((s) => Math.abs(s.sectorDeg - deg) < 1e-6)!.speedBinHours.reduce((a, h) => a + h, 0);
        const prevailing = hoursAt(90);
        const opposite = hoursAt(270);
        expect(prevailing).toBeGreaterThan(opposite);
        // Total hours ≈ a year (the rose distributes 8760 h over the sectors).
        const total = rose.sectors.reduce((a, s) => a + s.speedBinHours.reduce((b, h) => b + h, 0), 0);
        expect(total).toBeGreaterThan(8000);
        expect(total).toBeLessThan(9600);
    });
});

describe('§ANALYSIS-NO-FAKE-FALLBACK — degenerate field degrades to flat, not a radial hotspot', () => {
    it('a metric with NO spatial signal renders one uniform colour (no building-centred bullseye)', () => {
        // No context footprints + no real data → the OSM density/UHI field is dead-flat.
        // The old code substituted a smooth RADIAL gradient centred on the disc; now it
        // must be a single flat colour (honest "no variation to show").
        const cells = buildSiteMetricGrid('population', {
            radius: 100, footprints: [], dataset: null, gridCountCap: 24,
        });
        expect(cells.length).toBeGreaterThan(0);
        const colours = new Set(cells.map((c) => c.colorHex));
        expect(colours.size).toBe(1);   // flat — NOT a radial gradient of many colours
    });
});

describe('§FORMA-FACADE-ANALYSIS — prepareFacadeSunGrid', () => {
    it('returns null without lat/lon or rings', () => {
        expect(prepareFacadeSunGrid({
            footprintRings: [BUILDING_RING], heightM: 6, occluders: [],
            latDeg: undefined as unknown as number, lngDeg: 2.17,
        })).toBeNull();
        expect(prepareFacadeSunGrid({
            footprintRings: [], heightM: 6, occluders: [], latDeg: 41.39, lngDeg: 2.17,
        })).toBeNull();
    });

    it('prepares points + a pure intensity evaluator in [0,1] using the sun ramp', () => {
        const prep = prepareFacadeSunGrid({
            footprintRings: [BUILDING_RING],
            heightM: 6,
            occluders: [{ ring: BUILDING_RING, heightM: 6 }],   // the building shades itself
            latDeg: 41.39,
            lngDeg: 2.17,
            sunDay: 'summer',
            sampleSpacingM: 3,
            maxSamples: 800,
        });
        expect(prep).not.toBeNull();
        const p = prep!.points[0]!;
        const intensity = prep!.evaluateIntensity(p);
        expect(intensity).toBeGreaterThanOrEqual(0);
        expect(intensity).toBeLessThanOrEqual(1);
        // The colour map is the SAME sun-hours ramp used by the ground heatmap.
        expect(prep!.colourFor(1)).toMatch(/^rgb\(/);
        expect(prep!.colourFor(0)).toMatch(/^rgb\(/);
    });
});

// §PERF-SUNHOURS-BVH (L-143) — the spatial-index acceleration must change ONLY speed, not
// the result: sun-hours intensity via the index MUST equal the naive all-prisms loop
// byte-for-byte (so @pryzm/solar-analysis's determinism claim holds under acceleration).
describe('§PERF-SUNHOURS-BVH: spatial index is byte-identical to the naive raycast', () => {
    // A dense field of context prisms around the origin (the L-143 scenario: many
    // occluders make the naive per-cell loop the dominant cost).
    const CITY: MetricFootprint[] = [];
    for (let gx = -6; gx <= 6; gx++) {
        for (let gz = -6; gz <= 6; gz++) {
            if (gx === 0 && gz === 0) continue; // leave the origin clear
            const cx = gx * 30, cz = gz * 30;
            CITY.push({
                ring: [
                    { x: cx - 8, z: cz - 8 }, { x: cx + 8, z: cz - 8 },
                    { x: cx + 8, z: cz + 8 }, { x: cx - 8, z: cz + 8 },
                ],
                heightM: 12 + ((gx * 7 + gz * 13) % 5) * 6, // varied heights
            });
        }
    }
    // Probe points scattered through the field (streets + right next to towers).
    const PROBES: Array<{ east: number; north: number }> = [];
    for (let e = -90; e <= 90; e += 17) for (let n = -90; n <= 90; n += 23) PROBES.push({ east: e, north: n });

    for (const day of ['summer', 'winter', 'equinox'] as const) {
        it(`matches naive for every probe (${day} solstice/equinox, dense city)`, () => {
            const rows = __sunHoursBvhEquivalenceProbe(CITY, PROBES, {
                latDeg: 41.39, lngDeg: 2.17, sunDay: day, stepMinutes: 15,
            });
            expect(rows.length).toBe(PROBES.length);
            let sawShade = false;
            let sawSun = false;
            for (const r of rows) {
                expect(r.indexed).toBe(r.naive);   // byte-identical
                if (r.naive < 0.99) sawShade = true;
                if (r.naive > 0.01) sawSun = true;
            }
            // The scene genuinely exercises BOTH occluded and lit outcomes (not a trivial pass).
            expect(sawShade).toBe(true);
            expect(sawSun).toBe(true);
        });
    }

    it('is deterministic — same inputs twice give identical intensities', () => {
        const cfg = { latDeg: 41.39, lngDeg: 2.17, sunDay: 'summer' as const, stepMinutes: 20 };
        const a = __sunHoursBvhEquivalenceProbe(CITY, PROBES, cfg);
        const b = __sunHoursBvhEquivalenceProbe(CITY, PROBES, cfg);
        expect(a.map((r) => r.indexed)).toEqual(b.map((r) => r.indexed));
    });
});

// §PERF-SUNHOURS-WORKER (L-143 / L-160c, ADR-0110) — the pure probe-compute core the
// off-main-thread worker runs MUST be byte-identical to the existing per-cell / per-point
// evaluators, and slicing it (as the worker does between yields, for cancellation) MUST
// equal the whole-batch result. This locks the "worker changes only speed, never the math"
// guarantee at the pure-function boundary (no Worker needed for these).
describe('§PERF-SUNHOURS-WORKER: computeSunIntensitiesForProbes core', () => {
    const CITY: MetricFootprint[] = [];
    for (let gx = -5; gx <= 5; gx++) {
        for (let gz = -5; gz <= 5; gz++) {
            if (gx === 0 && gz === 0) continue;
            const cx = gx * 28, cz = gz * 28;
            CITY.push({
                ring: [
                    { x: cx - 7, z: cz - 7 }, { x: cx + 7, z: cz - 7 },
                    { x: cx + 7, z: cz + 7 }, { x: cx - 7, z: cz + 7 },
                ],
                heightM: 15 + ((gx * 5 + gz * 11) % 4) * 7,
            });
        }
    }
    const PARAMS = { latDeg: 41.39, lngDeg: 2.17, sunDay: 'summer' as const, stepMinutes: 20 };

    it('equals prepareSunHoursGrid.evaluateIntensity for every non-masked cell (worker == main)', () => {
        const prep = prepareSunHoursGrid({
            radius: 120, footprints: CITY, dataset: null,
            latDeg: PARAMS.latDeg, lngDeg: PARAMS.lngDeg, sunDay: PARAMS.sunDay, sunStepMinutes: PARAMS.stepMinutes,
        });
        expect(prep).not.toBeNull();
        const cells = prep!.cells;
        // Build probes for the cells the render path would compute (mirror the null mask).
        const probes: SunProbe[] = [];
        const idx: number[] = [];
        for (let i = 0; i < cells.length; i++) {
            const c = cells[i]!;
            if (c.underBuilding || Math.hypot(c.x, c.z) > prep!.radiusM * 1.02) continue;
            idx.push(i);
            probes.push({ east: c.x, north: c.z, up: 0.5 });
        }
        expect(probes.length).toBeGreaterThan(50);
        const intens = computeSunIntensitiesForProbes(probes, CITY, PARAMS);
        for (let k = 0; k < idx.length; k++) {
            const ref = prep!.evaluateIntensity(cells[idx[k]!]!);
            expect(ref).not.toBeNull();
            // Byte-identical (both are lit / sampleCount with the SAME BVH + samples).
            expect(intens[k]).toBe(ref);
        }
    });

    it('is slice-invariant — computing in chunks (as the worker yields) equals the whole batch', () => {
        const probes: SunProbe[] = [];
        for (let e = -80; e <= 80; e += 11) for (let n = -80; n <= 80; n += 13) probes.push({ east: e, north: n, up: 0.5 });
        const whole = computeSunIntensitiesForProbes(probes, CITY, PARAMS);
        // Re-compute in slices (the worker's SLICE loop) and concatenate.
        const sliced = new Float64Array(probes.length);
        const SLICE = 37;
        for (let s = 0; s < probes.length; s += SLICE) {
            const part = computeSunIntensitiesForProbes(probes.slice(s, s + SLICE), CITY, PARAMS);
            sliced.set(part, s);
        }
        expect(Array.from(sliced)).toEqual(Array.from(whole));
    });

    it('honours the wall back-face cull — a wall never receives more sun than an unnormalled probe', () => {
        // A probe with an outward normal must see ≤ the sun of the same point with no normal
        // (back-facing samples are culled), and a north-facing wall in the N hemisphere summer
        // gets strictly LESS than a south-facing one.
        const probeNoNormal: SunProbe = { east: 0, north: 0, up: 2 };
        const south: SunProbe = { east: 0, north: 0, up: 2, normE: 0, normN: -1 };
        const north: SunProbe = { east: 0, north: 0, up: 2, normE: 0, normN: 1 };
        const [full] = computeSunIntensitiesForProbes([probeNoNormal], [], PARAMS);
        const [s] = computeSunIntensitiesForProbes([south], [], PARAMS);
        const [n] = computeSunIntensitiesForProbes([north], [], PARAMS);
        expect(s!).toBeLessThanOrEqual(full! + 1e-9);
        expect(n!).toBeLessThanOrEqual(full! + 1e-9);
        expect(s!).toBeGreaterThan(n!);   // south-facing beats north-facing in the N summer
    });
});

// §FIX-FACADE-ANALYSIS-REAL-GEOMETRY (L-144 / L-160b) — the façade study surface must be
// the REAL exterior walls WITH their authored window/door openings, not a solid prism.
describe('§FIX-FACADE-ANALYSIS-REAL-GEOMETRY: real openings punched into the façade', () => {
    // A 10 m face running east from the origin (along +east, up +north offset 0), height 6 m.
    const FACE = { ax: 0, az: 0, ux: 1, uz: 0, segLen: 10 };
    const HEIGHT = 6;

    it('projects an opening ON the face into the correct UV rect', () => {
        // A window from x=3..5 along the face, sill 1 m, height 2 m (so v 1/6..3/6).
        const rects = facadeOpeningUvRects(FACE, HEIGHT, [
            { a: { x: 3, z: 0 }, b: { x: 5, z: 0 }, baseElevation: 0, sill: 1, height: 2, kind: 'window' },
        ]);
        expect(rects.length).toBe(1);
        expect(rects[0]!.u0).toBeCloseTo(0.3, 5);
        expect(rects[0]!.u1).toBeCloseTo(0.5, 5);
        expect(rects[0]!.v0).toBeCloseTo(1 / 6, 5);
        expect(rects[0]!.v1).toBeCloseTo(3 / 6, 5);
    });

    it('excludes openings that are OFF the face line (different wall)', () => {
        // Same along-span but offset 3 m in +north — not on this (north=0) face.
        const rects = facadeOpeningUvRects(FACE, HEIGHT, [
            { a: { x: 3, z: 3 }, b: { x: 5, z: 3 }, baseElevation: 0, sill: 1, height: 2 },
        ]);
        expect(rects.length).toBe(0);
    });

    it('rasterises opening texels as transparent HOLES (alpha 0) and solid elsewhere', () => {
        const nU = 6, nV = 6;
        const intensities: Array<number | null> = new Array(nU * nV).fill(0.7);
        const openings: FacadeOpeningRect[] = [{ u0: 0.3, u1: 0.5, v0: 1 / 6, v1: 3 / 6 }];
        const tex = rasterizeFacadeSunTexture(intensities, nU, nV, 10 / 6, 0.98, true, openings);
        // A texel squarely inside the opening → alpha 0; a texel well outside → opaque.
        const alphaAt = (u: number, v: number): number => {
            const tx = Math.min(tex.width - 1, Math.floor(u * tex.width));
            const ty = Math.min(tex.height - 1, Math.floor((1 - v) * tex.height)); // row 0 = top
            return tex.rgba[(ty * tex.width + tx) * 4 + 3]!;
        };
        expect(alphaAt(0.4, 0.33)).toBe(0);      // centre of the opening
        expect(alphaAt(0.85, 0.85)).toBeGreaterThan(0); // solid wall corner
    });

    it('a face with NO openings stays fully solid (fallback preview tier)', () => {
        const nU = 4, nV = 4;
        const intensities: Array<number | null> = new Array(nU * nV).fill(0.5);
        const tex = rasterizeFacadeSunTexture(intensities, nU, nV, 1, 0.98, true, []);
        let anyOpaque = false;
        for (let i = 3; i < tex.rgba.length; i += 4) if (tex.rgba[i]! > 0) { anyOpaque = true; break; }
        expect(anyOpaque).toBe(true);
    });
});

// §FEAT-FACADE-ANALYSIS-MATCH-SUNHOURS-QUALITY (L-227, founder 2026-07-09) — the façade study
// must fill the SAME cold→warm span the ground heatmap uses (the regression is a flat cyan coat
// stuck in the cold band) AND render through the IDENTICAL `sunHoursRgb` ramp (no vivid variant,
// no cyan). These pure tests lock both: the range-normalisation and the one-ramp colour mapping.
describe('§FEAT-FACADE-ANALYSIS-MATCH-SUNHOURS-QUALITY: façade fills the ground ramp', () => {
    // Read one texel's RGBA from a façade texture at UV (u along 0..1, v up 0..1, v0 = bottom).
    const rgbaAt = (tex: { width: number; height: number; rgba: Uint8ClampedArray },
                    u: number, v: number): [number, number, number, number] => {
        const tx = Math.min(tex.width - 1, Math.max(0, Math.floor(u * tex.width)));
        const ty = Math.min(tex.height - 1, Math.max(0, Math.floor((1 - v) * tex.height))); // row 0 = top
        const o = (ty * tex.width + tx) * 4;
        return [tex.rgba[o]!, tex.rgba[o + 1]!, tex.rgba[o + 2]!, tex.rgba[o + 3]!];
    };

    it('normalizeFacadeStudy expands a cold-band field to fill [0,1] (real variation, not a boost)', () => {
        // A compressed façade field — a vertical wall never reaches the all-day sample count, so
        // every raw value sits in the cold half. Two faces, one brighter than the other.
        const faceHot: Array<number | null> = [0.10, 0.20, 0.35, 0.45];
        const faceCold: Array<number | null> = [0.02, 0.05, 0.08, 0.12];
        const roof: Array<number | null> = [0.55, 0.60]; // roof sees more sun than any wall
        const out = normalizeFacadeStudy([faceHot, faceCold], roof);
        // The max WALL intensity (0.45) is the divisor → the brightest wall node reaches 1.0.
        expect(out.max).toBeCloseTo(0.45, 6);
        expect(Math.max(...out.walls[0]!.map((v) => v ?? 0))).toBeCloseTo(1, 6);
        // Ratios are PRESERVED (a pure rescale of the genuine field — not saturation).
        expect(out.walls[0]![1]! / out.walls[0]![3]!).toBeCloseTo(0.20 / 0.45, 6);
        // The field now spans nearly the full ramp (regression = a flat tint with tiny range).
        const all = [...out.walls[0]!, ...out.walls[1]!].map((v) => v ?? 0);
        expect(Math.max(...all) - Math.min(...all)).toBeGreaterThan(0.9);
        // The roof (brighter than any wall) clamps to the warm end (one scale, no overflow).
        expect(out.roof.every((v) => v == null || (v >= 0 && v <= 1))).toBe(true);
        expect(Math.max(...out.roof.map((v) => v ?? 0))).toBe(1);
    });

    it('normalizeFacadeStudy preserves holes and is a no-op on a fully-dark study', () => {
        const withHoles: Array<number | null> = [0.3, null, 0.1, null];
        const out = normalizeFacadeStudy([withHoles], []);
        expect(out.walls[0]![1]).toBeNull();
        expect(out.walls[0]![3]).toBeNull();
        // Dark study (max ≈ 0) → norm defaults to 1, values unchanged (never amplify noise).
        const dark = normalizeFacadeStudy([[0, 0, 0]], [0]);
        expect(dark.max).toBe(0);
        expect(dark.walls[0]).toEqual([0, 0, 0]);
    });

    it('renders through the IDENTICAL sunHoursRgb ramp as the ground — warm at full sun, blue at shade, NEVER cyan', () => {
        // Plain ramp (vivid=false): a fully-sunlit face → the ground ramp's warm stop #F4753A.
        const hot = rasterizeFacadeSunTexture(new Array(4).fill(1), 2, 2, 1, 0.98, false, []);
        const [rH, gH, bH] = rgbaAt(hot, 0.5, 0.5);
        expect([rH, gH, bH]).toEqual([0xF4, 0x75, 0x3A]); // exact ground ramp warm end
        expect(rH).toBeGreaterThan(gH); expect(gH).toBeGreaterThan(bH); // warm: R>G>B

        // A fully-shaded face → the ground ramp's cold stop #2C3E80 (deep blue) — NOT cyan.
        const cold = rasterizeFacadeSunTexture(new Array(4).fill(0), 2, 2, 1, 0.98, false, []);
        const [rC, gC, bC] = rgbaAt(cold, 0.5, 0.5);
        expect([rC, gC, bC]).toEqual([0x2C, 0x3E, 0x80]); // exact ground ramp cold end
        expect(bC).toBeGreaterThan(rC); // cold: blue-dominant

        // "Never cyan" — cyan is high-G, high-B, low-R. The plain ramp never produces it: at the
        // teal midpoint the boosted (vivid) variant DID, so assert the plain path stays off it.
        const mid = rasterizeFacadeSunTexture(new Array(4).fill(0.4), 2, 2, 1, 0.98, false, []);
        const [rM, gM, bM] = rgbaAt(mid, 0.5, 0.5);
        const isCyan = rM < 100 && gM > 150 && bM > 150;
        expect(isCyan).toBe(false);
    });

    it('a normalised sunny façade reads warm, a shaded façade reads cold (per-face gradient, not a flat coat)', () => {
        // Two faces from a compressed study: one relatively sunny, one deeply shaded.
        const sunny: Array<number | null> = [0.40, 0.42, 0.44, 0.45];
        const shaded: Array<number | null> = [0.03, 0.04, 0.05, 0.06];
        const out = normalizeFacadeStudy([sunny, shaded], []);
        const sunnyTex = rasterizeFacadeSunTexture(out.walls[0]!, 2, 2, 1, 0.98, false, []);
        const shadedTex = rasterizeFacadeSunTexture(out.walls[1]!, 2, 2, 1, 0.98, false, []);
        const [rS, , bS] = rgbaAt(sunnyTex, 0.9, 0.9);   // brightest corner of the sunny face
        const [rD, , bD] = rgbaAt(shadedTex, 0.1, 0.1);  // darkest corner of the shaded face
        expect(rS).toBeGreaterThan(bS);  // sunny face → warm (R>B)
        expect(bD).toBeGreaterThan(rD);  // shaded face → cold (B>R)
    });
});

// §FEAT-FACADE-ANALYSIS-SMOOTH-PER-FACE (L-232, founder 2026-07-11) — the façade must read as
// smoothly as the ground. Root: the sun-hours field is quantised to the sun-sample count, and
// L-227's wall-max stretch ~doubles the visible step → per-storey bands. `planFacadeSampling`
// picks a finer cadence + sub-storey spacing, BOUNDED by a building-size work budget so a tower
// never inflates the raycast count (and the drape textures — capped elsewhere — never grow → no
// L-231 GPU-device-loss regression).
describe('§FEAT-FACADE-ANALYSIS-SMOOTH-PER-FACE: planFacadeSampling', () => {
    const GROUND_STEP = 25;
    // The internal daylight-sample estimate (mirrors the planner) — for the work-bound assertion.
    const estSamples = (step: number): number => Math.max(8, Math.round((14 * 60) / step));

    it('uses a FINER sun cadence than the ground (counters the L-227 range stretch)', () => {
        const plan = planFacadeSampling({ perimeterM: 60, heightM: 12, storeyHeightM: 3, groundStepMinutes: GROUND_STEP });
        // ~half the ground step so the stretched façade field has ~2× the intensity levels.
        expect(plan.stepMinutes).toBeLessThanOrEqual(Math.round(GROUND_STEP / 2));
        expect(plan.stepMinutes).toBeGreaterThanOrEqual(10); // floored so cost never runs away
    });

    it('uses a SUB-STOREY spatial spacing on a normal building (resolves the vertical gradient)', () => {
        const plan = planFacadeSampling({ perimeterM: 60, heightM: 12, storeyHeightM: 3, groundStepMinutes: GROUND_STEP });
        expect(plan.spacingM).toBeLessThan(3);        // finer than a storey
        expect(plan.spacingM).toBeGreaterThanOrEqual(0.75); // but not absurdly fine
    });

    it('BOUNDS the raycast work and shrinks the budget as the building grows (L-231 safety)', () => {
        const house = planFacadeSampling({ perimeterM: 40, heightM: 12, storeyHeightM: 3, groundStepMinutes: GROUND_STEP });
        const tower = planFacadeSampling({ perimeterM: 160, heightM: 120, storeyHeightM: 3, groundStepMinutes: GROUND_STEP });
        // The tower gets a SMALLER budget + node cap than the house — never a bigger one.
        expect(tower.workBudget).toBeLessThan(house.workBudget);
        expect(tower.maxNodes).toBeLessThan(house.maxNodes);
        // The node cap × the sun-sample count stays within the fitted work budget (bounded raycasts).
        for (const p of [house, tower]) {
            expect(p.maxNodes * estSamples(p.stepMinutes)).toBeLessThanOrEqual(Math.ceil(p.workBudget * 1.01));
        }
    });

    it('auto-decimates (coarsens spacing) so a large façade never exceeds the node cap', () => {
        // A very large façade at the sub-storey target would blow the cap → spacing must grow.
        const plan = planFacadeSampling({ perimeterM: 400, heightM: 200, storeyHeightM: 3, groundStepMinutes: GROUND_STEP });
        const estNodes = (400 * 200) / (plan.spacingM * plan.spacingM);
        expect(estNodes).toBeLessThanOrEqual(plan.maxNodes * 1.02);
        expect(plan.spacingM).toBeGreaterThan(0.75); // coarsened above the sub-storey floor
    });

    it('an explicit heavy-scene flag coarsens further (halves the budget)', () => {
        const normal = planFacadeSampling({ perimeterM: 160, heightM: 120, storeyHeightM: 3, groundStepMinutes: GROUND_STEP });
        const heavy = planFacadeSampling({ perimeterM: 160, heightM: 120, storeyHeightM: 3, groundStepMinutes: GROUND_STEP, heavy: true });
        expect(heavy.workBudget).toBeLessThan(normal.workBudget);
        expect(heavy.maxNodes).toBeLessThanOrEqual(normal.maxNodes);
    });
});
