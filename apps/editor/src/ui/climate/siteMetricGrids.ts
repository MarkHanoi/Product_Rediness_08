// §SITE-METRIC-HEATMAP (2026-06-27) — the Hektar/Forma-style analytical heatmap
// DATA layer for the Cesium side-3D site view.
//
// WHAT THIS IS
// ------------
// A thin, PURE (no Cesium / THREE / DOM) bridge that turns the existing analysis
// substrate into ONE flat list of coloured ground cells in the SAME site-ENU frame
// the Cesium overlays already place against (east = +x, north = +y; metres from the
// site origin). The CesiumViewport renders these cells as a colour-binned ground
// heatmap and draws a gradient legend — exactly the "switch one metric at a time"
// module pattern Forma / Hektar use.
//
// It composes the already-shipped engines — it solves nothing itself:
//   • TEMPERATURE  → @pryzm/street-analytics `computeHeatIslandGrid` (UHI ΔT over the
//                    climate baseline; warm gradient). REAL: baseline temp from the
//                    ingested ClimateDataset (Open-Meteo / PVGIS live, else bundled
//                    regional normals); built-density modulation from the OSM context.
//   • WIND         → @pryzm/street-analytics `computeWindComfortGrid` (Lawson LDC
//                    shelter proxy; blue→red gradient). REAL: mean speed + prevailing
//                    direction from the dataset wind rose; shelter from OSM context.
//   • POPULATION   → @pryzm/street-analytics `computePopulationDensityGrid` (OSM
//                    floor-count proxy; pale→deep-red). PARTIAL: a planning-grade proxy
//                    from the OSM context-building floors — NOT a census/WorldPop grid.
//   • SUN-HOURS    → a GROUND grid here too (so it renders identically to the others in
//                    the side-3D view, which shows no BIM mesh). For each cell centre we
//                    integrate direct-beam sun-hours over the analysis day: a cell is
//                    "in sun" at instant t when the ray toward the sun is NOT blocked by
//                    the massing + OSM context (a PURE analytic ray-vs-extruded-footprint
//                    test — no THREE, P2-safe). Sun positions come from the repo's own
//                    @pryzm/solar-analysis NOAA sun-sample generator (no SunCalc). The
//                    per-SURFACE BIM-mesh heatmap (`computeSunHoursOnModel`) is a separate
//                    pass kept for the BIM view.
//
// Adding a metric later (UTCI, daylight VSC, flood, a real census grid) = add one
// branch here that returns `MetricGridCell[]` — the renderer + legend are generic.

import type { ClimateDataset } from '@pryzm/schemas';
import {
    buildStreetGrid,
    computeHeatIslandGrid,
    computeWindComfortGrid,
    computePopulationDensityGrid,
    heatCellColour,
    densityCellColour,
    LAWSON_COLOURS,
    type Pt,
    type BuildingObstacle,
} from '@pryzm/street-analytics';
// §SITE-METRIC-HEATMAP — the repo's own pure NOAA sun-sample generator (no SunCalc).
import {
    generateSunSamples,
    juneSolsticeDayOfYear,
    decemberSolsticeDayOfYear,
    marchEquinoxDayOfYear,
    type SunSample,
} from '@pryzm/solar-analysis';
import { monthlyTempSeries } from './climateChartData';

/** The metrics the side-3D switcher can route to. `'sunHours'` + `'daylight'` are
 *  handled by the existing surface raycast pass, NOT by this ground-grid bridge. */
export type SiteMetric = 'sunHours' | 'temperature' | 'wind' | 'population' | 'daylight';

/** Whether a metric has a real/partial data source, and the disabled reason if not. */
export interface MetricAvailability {
    readonly metric: SiteMetric;
    readonly label: string;
    /** `true` when the metric can render with the data currently available. */
    readonly available: boolean;
    /** When `available` is false, a short user-facing reason (the disabled hint). */
    readonly reason?: string;
    /** `true` when the metric is a ground-grid this module produces; `false` for the
     *  surface-raycast metrics (sun hours / daylight) the solar pass owns. */
    readonly isGroundGrid: boolean;
}

/** One coloured ground cell in the site-ENU frame (east = +x metres, north = +y
 *  metres from the site origin). The renderer extrudes a flat square at `up`. */
export interface MetricGridCell {
    /** Cell centre — east metres from origin. */
    readonly east: number;
    /** Cell centre — north metres from origin. */
    readonly north: number;
    /** Cell half-size (m); the square is 2·halfSize wide. */
    readonly halfSize: number;
    /** Float height above ground (m). */
    readonly up: number;
    /** Resolved CSS colour for this cell. */
    readonly colorHex: string;
    /** The raw metric value at this cell (°C, m/s, persons/m², …) for tooltips. */
    readonly value: number;
}

/** One stop of the gradient legend the renderer draws beside the heatmap. */
export interface MetricLegend {
    readonly title: string;
    /** Low→high colour stops (CSS hex / rgb) for the gradient bar. */
    readonly stops: readonly string[];
    /** Low + high axis labels (e.g. '+0°C' / '+6°C'). */
    readonly lowLabel: string;
    readonly highLabel: string;
    /** Per-cell value unit suffix for point-inspect tooltips. */
    readonly unit: string;
}

/** A building footprint in the site-ENU frame (east/north metres) + its height. */
export interface MetricFootprint {
    /** Outer ring, site-ENU metres (east = x, north = z to match StreetGrid's XZ). */
    readonly ring: readonly Pt[];
    readonly heightM: number;
    readonly floors?: number;
}

/** A sun-hours analysis day preset (Forma pattern). */
export type SunDayPreset = 'summer' | 'winter' | 'equinox';

/** Inputs for a ground-grid metric build. */
export interface MetricGridInput {
    /** Site analysis radius (m); the grid spans a square inscribing this disc. */
    readonly radius: number;
    /** OSM context + proposed building footprints in site-ENU metres. */
    readonly footprints: readonly MetricFootprint[];
    /** The ingested climate dataset (temperature/wind baselines). */
    readonly dataset: ClimateDataset | null;
    /** Float height above ground for the cells (m). Default 0.16. */
    readonly heightAboveGround?: number;
    /** Cells per side cap (perf). Default 26 → ≤ 676 cells. */
    readonly gridCountCap?: number;
    // ── Sun-hours only ───────────────────────────────────────────────────────
    /** Site latitude (deg) — REQUIRED for the 'sunHours' metric (sun position). */
    readonly latDeg?: number;
    /** Site longitude (deg) — REQUIRED for 'sunHours'. */
    readonly lngDeg?: number;
    /** Analysis-day preset for 'sunHours' (default 'summer' = June solstice). */
    readonly sunDay?: SunDayPreset;
    /** Sun sample cadence (minutes) for 'sunHours'. Default 15. */
    readonly sunStepMinutes?: number;
}

const DEFAULT_LABELS: Record<SiteMetric, string> = {
    sunHours: 'Sun hours',
    temperature: 'Temperature',
    wind: 'Wind comfort',
    population: 'Population density',
    daylight: 'Daylight (VSC)',
};

/**
 * Classify which side-3D metrics can render with the data currently to hand. The
 * switcher uses this to enable / grey-out + caption each metric chip rather than
 * faking an empty layer (the Forma "no data source wired" affordance).
 *
 * @param hasDataset   a ClimateDataset is resolvable (temperature + wind baselines).
 * @param hasLocation  a site lat/lon is known (sun-hours needs the sun position).
 */
export function siteMetricAvailability(
    hasDataset: boolean,
    hasLocation: boolean,
): MetricAvailability[] {
    const mk = (
        metric: SiteMetric,
        available: boolean,
        isGroundGrid: boolean,
        reason?: string,
    ): MetricAvailability => ({
        metric,
        label: DEFAULT_LABELS[metric],
        available,
        isGroundGrid,
        ...(reason !== undefined ? { reason } : {}),
    });
    return [
        // Sun-hours is now a GROUND grid in the side-3D view (renders like the others)
        // — it needs only the site lat/lon (sun position) + the massing/context the
        // disc already shows; no climate dataset, no BIM mesh.
        mk('sunHours', hasLocation, true, hasLocation ? undefined : 'Set a site location'),
        // Ground grids — real/partial, need the climate baseline.
        mk('temperature', hasDataset, true, hasDataset ? undefined : 'No climate data yet'),
        mk('wind', hasDataset, true, hasDataset ? undefined : 'No climate data yet'),
        // Population is an OSM proxy — it needs context footprints, not climate; it
        // renders flat (zero) with none, so gate it on having ANY footprints.
        mk('population', true, true),
        // Daylight VSC is computed per room on the BIM scene, not as a side-3D ground
        // grid — surfaced via the existing pryzmComputeDaylight pass, not here yet.
        mk('daylight', false, false, 'Open in the BIM view (VSC)'),
    ];
}

/** Prevailing wind FROM-direction (deg, 0 = N) = the sector with the most hours. */
function prevailingFromDeg(dataset: ClimateDataset): number {
    let best = 0;
    let bestHours = -1;
    for (const s of dataset.windRose.sectors) {
        const hours = s.speedBinHours.reduce((a, h) => a + h, 0);
        if (hours > bestHours) { bestHours = hours; best = s.sectorDeg; }
    }
    return best;
}

/** Warm-season baseline air temp (°C) = mean of the 3 hottest months' avg. */
function warmBaselineC(dataset: ClimateDataset): number {
    const series = monthlyTempSeries(dataset);
    if (series.points.length === 0) return 18;
    const avgs = series.points.map((p) => p.avgC).sort((a, b) => b - a);
    return (avgs[0]! + (avgs[1] ?? avgs[0]!) + (avgs[2] ?? avgs[0]!)) / 3;
}

/** Build a square site boundary inscribing the analysis disc (StreetGrid XZ frame:
 *  x = east, z = north). */
function discBoundary(radius: number): Pt[] {
    const r = radius;
    return [{ x: -r, z: -r }, { x: r, z: -r }, { x: r, z: r }, { x: -r, z: r }];
}

function toObstacles(footprints: readonly MetricFootprint[]): {
    polys: Pt[][];
    obstacles: BuildingObstacle[];
} {
    const polys: Pt[][] = [];
    const obstacles: BuildingObstacle[] = [];
    for (const f of footprints) {
        if (f.ring.length < 3) continue;
        const ring = f.ring.map((p) => ({ x: p.x, z: p.z }));
        polys.push(ring);
        obstacles.push({
            polygon: ring,
            heightM: Math.max(0, f.heightM),
            ...(f.floors !== undefined ? { floors: f.floors } : {}),
        });
    }
    return { polys, obstacles };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sun-hours ground grid (§SITE-METRIC-HEATMAP) — PURE analytic occlusion
// ─────────────────────────────────────────────────────────────────────────────
//
// Per cell we integrate direct-beam sun-hours over the analysis day. A cell is "in
// sun" at instant t when the ray from the cell centre TOWARD the sun is not blocked
// by any building. Buildings are the footprint polygons EXTRUDED vertically from
// ground (up = 0) to `heightM`. The occlusion test is a pure analytic ray-vs-prism:
// project the shadow ray to the horizontal plane, find where it crosses each
// footprint polygon, and if the ray's height at that crossing is below the prism's
// roof the sun is blocked. No THREE / three-mesh-bvh (P2-safe), deterministic.
//
// FRAME: we work in (east, north, up) metres. Footprint rings are StreetGrid XZ
// (x = east, z = north). Sun-sample `dir` is the solar-analysis ENU frame
// { x = East, y = Up, z = South }, so north = −dir.z, up = dir.y, east = dir.x.

/** An extruded-footprint prism for the analytic shadow-ray test. */
interface Prism {
    /** Footprint ring in (east, north) metres. */
    readonly ring: ReadonlyArray<{ e: number; n: number }>;
    /** Axis-aligned bbox of the ring (cheap reject). */
    readonly minE: number; readonly maxE: number; readonly minN: number; readonly maxN: number;
    readonly heightM: number;
}

function toPrisms(footprints: readonly MetricFootprint[]): Prism[] {
    const out: Prism[] = [];
    for (const f of footprints) {
        if (f.ring.length < 3 || !(f.heightM > 0)) continue;
        const ring = f.ring.map((p) => ({ e: p.x, n: p.z }));
        let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
        for (const v of ring) {
            if (v.e < minE) minE = v.e; if (v.e > maxE) maxE = v.e;
            if (v.n < minN) minN = v.n; if (v.n > maxN) maxN = v.n;
        }
        out.push({ ring, minE, maxE, minN, maxN, heightM: f.heightM });
    }
    return out;
}

/** Point-in-polygon (ray casting) in (east, north). */
function pointInRing(e: number, n: number, ring: ReadonlyArray<{ e: number; n: number }>): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ei = ring[i]!.e, ni = ring[i]!.n;
        const ej = ring[j]!.e, nj = ring[j]!.n;
        const intersect = (ni > n) !== (nj > n) &&
            e < ((ej - ei) * (n - ni)) / (nj - ni) + ei;
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Is the ray from `(e0, n0, up0)` in horizontal direction `(de, dn)` (unit) rising
 * at `slope` (= up.per.horizontal-metre, > 0 toward the sun) BLOCKED by `prism`
 * before it clears the roof? We march the horizontal ray a few steps across the
 * prism's footprint extent; if any step lies inside the ring AND the ray height
 * there is below the roof, it's blocked. Coarse but pure + adequate for a planning
 * heatmap (a stylised shadow, not a survey). */
function rayBlockedByPrism(
    e0: number, n0: number, up0: number,
    de: number, dn: number, slope: number,
    prism: Prism,
): boolean {
    // How far ahead (horizontal metres) the prism bbox is — quick reject if the ray
    // points away from it.
    const cx = (prism.minE + prism.maxE) / 2;
    const cz = (prism.minN + prism.maxN) / 2;
    const toCx = cx - e0, toCz = cz - n0;
    if (toCx * de + toCz * dn <= 0) return false; // prism is behind the ray
    // March from the bbox near edge to the far edge in ~1.5 m steps.
    const span = Math.hypot(prism.maxE - prism.minE, prism.maxN - prism.minN);
    const reach = Math.hypot(toCx, toCz) + span; // generous upper bound
    const step = Math.max(1.0, span / 8);
    for (let d = 1.0; d <= reach; d += step) {
        const e = e0 + de * d;
        const n = n0 + dn * d;
        if (e < prism.minE - 1 || e > prism.maxE + 1 || n < prism.minN - 1 || n > prism.maxN + 1) {
            // Past the prism extent in the march direction → stop early if we've gone by.
            if (d > 1.0 && (e - cx) * de + (n - cz) * dn > span) break;
            continue;
        }
        if (!pointInRing(e, n, prism.ring)) continue;
        const heightAtD = up0 + slope * d;
        if (heightAtD < prism.heightM) return true; // ray passes through the solid
    }
    return false;
}

/** True when the sun (sample `s`) is occluded for the cell at `(e0, n0)`. */
function sunBlocked(
    e0: number, n0: number, up0: number,
    s: SunSample,
    prisms: readonly Prism[],
): boolean {
    // Sun direction TOWARD the sun in (east, north, up): east = dir.x, north = −dir.z,
    // up = dir.y. Build the horizontal unit + the vertical slope per horizontal metre.
    const he = s.dir.x;
    const hn = -s.dir.z;
    const hmag = Math.hypot(he, hn);
    if (hmag < 1e-6) return false;          // sun overhead → unobstructed
    const de = he / hmag, dn = hn / hmag;
    const slope = s.dir.y / hmag;           // up per horizontal metre (>0 above horizon)
    for (const p of prisms) {
        if (rayBlockedByPrism(e0, n0, up0, de, dn, slope, p)) return true;
    }
    return false;
}

/** Resolve the analysis day-of-year from a preset (default summer solstice). */
function sunDayOfYear(preset: SunDayPreset | undefined): number {
    switch (preset) {
        case 'winter': return decemberSolsticeDayOfYear();
        case 'equinox': return marchEquinoxDayOfYear();
        case 'summer':
        default: return juneSolsticeDayOfYear();
    }
}

/** Sun-hours intensity (0 = shaded … 1 = full sun) → blue→teal→gold→warm ramp.
 *  Matches `siteMetricLegend('sunHours')` so the legend reads the same scale. */
function sunHoursCellColour(intensity: number): string {
    const t = Math.max(0, Math.min(1, intensity));
    const stops: ReadonlyArray<readonly [number, number, number, number]> = [
        [0.00, 0x2C, 0x3E, 0x80], // #2C3E80 — shaded (deep blue)
        [0.40, 0x3F, 0xA7, 0x96], // #3FA796 — teal
        [0.75, 0xF6, 0xC4, 0x45], // #F6C445 — gold
        [1.00, 0xF4, 0x75, 0x3A], // #F4753A — full sun (warm)
    ];
    for (let i = 1; i < stops.length; i++) {
        if (t <= stops[i]![0]) {
            const [t0, r0, g0, b0] = stops[i - 1]!;
            const [t1, r1, g1, b1] = stops[i]!;
            const s = (t - t0) / (t1 - t0 || 1);
            const r = Math.round(r0 + s * (r1 - r0));
            const g = Math.round(g0 + s * (g1 - g0));
            const b = Math.round(b0 + s * (b1 - b0));
            return `rgb(${r},${g},${b})`;
        }
    }
    return '#F4753A';
}

/**
 * Build the coloured ground cells for a ground-grid metric (sun hours / temperature
 * / wind / population) in the site-ENU frame. Returns `[]` when the metric is not a
 * ground grid (daylight) or its required data is missing. PURE + deterministic.
 */
export function buildSiteMetricGrid(
    metric: SiteMetric,
    input: MetricGridInput,
): MetricGridCell[] {
    if (metric === 'daylight') return [];          // BIM-view only (per-room VSC)
    if (!(input.radius > 0)) return [];
    const up = input.heightAboveGround ?? 0.16;
    const cap = Math.max(6, input.gridCountCap ?? 26);
    // Cell size so the grid spans [-R, R] with ≤ cap cells per side.
    const cellSize = (2 * input.radius) / cap;
    const { polys, obstacles } = toObstacles(input.footprints);
    const cells = buildStreetGrid(discBoundary(input.radius), polys, {
        cellSize,
        margin: 0,
        maxCells: cap * cap + 4,
    });
    if (cells.length === 0) return [];

    if (metric === 'sunHours') {
        const lat = input.latDeg, lng = input.lngDeg;
        if (lat == null || lng == null) return [];   // sun position needs lat/lon
        const samples = generateSunSamples({
            latDeg: lat,
            lngDeg: lng,
            dayOfYear: sunDayOfYear(input.sunDay),
            stepMinutes: input.sunStepMinutes && input.sunStepMinutes > 0 ? input.sunStepMinutes : 15,
            daylightOnly: true,                      // drop below-horizon instants
        });
        const stepHours = (input.sunStepMinutes && input.sunStepMinutes > 0 ? input.sunStepMinutes : 15) / 60;
        const prisms = toPrisms(input.footprints);
        const sampleUp = 0.5;                        // test ray ~0.5 m above ground
        // Max possible = every above-horizon sample unobstructed.
        const maxHours = samples.length * stepHours;
        const raw = cells.map((c) => {
            // Don't paint cells UNDER a building (they're inside the mass).
            if (c.underBuilding) return { c, hours: 0, skip: true };
            let lit = 0;
            for (const s of samples) {
                if (!sunBlocked(c.x, c.z, sampleUp, s, prisms)) lit++;
            }
            return { c, hours: lit * stepHours, skip: false };
        });
        return raw
            .filter((r) => !r.skip)
            .map(({ c, hours }) => ({
                east: c.x, north: c.z, halfSize: c.size / 2, up,
                colorHex: sunHoursCellColour(maxHours > 0 ? hours / maxHours : 0),
                value: hours,
            }));
    }

    if (metric === 'population') {
        const { cells: pop } = computePopulationDensityGrid(cells, obstacles);
        return pop.map((c) => ({
            east: c.x, north: c.z, halfSize: c.size / 2, up,
            colorHex: densityCellColour(c.intensity), value: c.density,
        }));
    }

    // temperature + wind both need the climate baselines.
    const ds = input.dataset;
    if (!ds) return [];
    const wind = { meanMs: ds.windRose.meanSpeedMps, prevailingFromDeg: prevailingFromDeg(ds) };

    if (metric === 'wind') {
        const w = computeWindComfortGrid(cells, wind, obstacles);
        return w.map((c) => ({
            east: c.x, north: c.z, halfSize: c.size / 2, up,
            colorHex: LAWSON_COLOURS[c.lawsonClass], value: c.effectiveSpeedMs,
        }));
    }

    // temperature (UHI).
    const heat = computeHeatIslandGrid(cells, { baselineTempC: warmBaselineC(ds) }, wind, obstacles);
    return heat.map((c) => ({
        east: c.x, north: c.z, halfSize: c.size / 2, up,
        colorHex: heatCellColour(c.intensity), value: c.tempC,
    }));
}

/** The gradient legend + unit for a metric (drawn beside the heatmap). */
export function siteMetricLegend(
    metric: SiteMetric,
    dataset: ClimateDataset | null,
): MetricLegend | null {
    switch (metric) {
        case 'temperature': {
            const base = dataset ? warmBaselineC(dataset) : 0;
            return {
                title: 'Urban heat island',
                stops: ['#FDE047', '#FB923C', '#B91C1C'],
                lowLabel: `${base.toFixed(0)}°C`,
                highLabel: `+6°C`,
                unit: '°C',
            };
        }
        case 'wind':
            return {
                title: 'Pedestrian wind (Lawson)',
                stops: [LAWSON_COLOURS.comfortable, LAWSON_COLOURS.acceptable, LAWSON_COLOURS.uncomfortable, LAWSON_COLOURS.dangerous],
                lowLabel: 'Calm',
                highLabel: 'Gusty',
                unit: 'm/s',
            };
        case 'population':
            return {
                title: 'Population density (OSM proxy)',
                stops: ['#FFFFC8', '#FFB864', '#FF7832', '#B41E14'],
                lowLabel: 'Low',
                highLabel: 'High',
                unit: 'p/m²',
            };
        case 'sunHours':
            return {
                title: 'Sun hours',
                stops: ['#2C3E80', '#3FA796', '#F6C445', '#F4753A'],
                lowLabel: 'Shaded',
                highLabel: 'Sunny',
                unit: 'h',
            };
        default:
            return null;
    }
}
