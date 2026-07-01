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
    buildRealWindRose,
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
