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
// §SITE-METRIC-CLIMATE-FALLBACK — the pure, synchronous, OFFLINE bundled-normals
// ClimateDataset builder (lat/lon → 12 monthly normals + a synthesised 16-sector
// wind rose). Used to GUARANTEE temperature + wind paint a real field even when the
// async ClimateStore dataset hasn't landed (or never resolves under a blocked fetch).
import { buildFallbackClimateDataset } from '@pryzm/climate-host';
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
 *  both chunked raycast/hemisphere passes this bridge produces as GROUND grids.
 *  §SITE-METRIC-DAYLIGHT-VSC (2026-06-30) — 'daylight' is now a real side-3D ground
 *  grid (Vertical Sky Component: the % of the sky hemisphere unobstructed by the
 *  neighbouring massing + OSM context at each cell), NOT a BIM-view-only pass. */
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
    /** TARGET cell edge length (m). The grid is built at this resolution, then the
     *  cell size is auto-clamped UP if `maxCells` would be exceeded (§perf cap).
     *  Preferred over `gridCountCap`. Default derives from `gridCountCap` or 6 m. */
    readonly cellSizeM?: number;
    /** Hard cap on total cells (perf — bounds work on a huge disc). Default 6000. */
    readonly maxCells?: number;
    /** DEPRECATED — cells per side cap. When set (and `cellSizeM` is not), the cell
     *  size is `2·radius / gridCountCap`. Kept for the unit tests. */
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
    // ── REAL data baselines (ADR-0095) ───────────────────────────────────────
    // §ANALYSIS-REAL-TEMPERATURE — the REAL site air-temperature baseline (°C) from
    // NASA POWER climatology. When present, the temperature grid uses THIS as the base
    // value and adds the built-density UHI ΔT as a spatial modulation ON TOP of it
    // (air temp barely varies across a 240 m disc — the UHI delta is the real spatial
    // signal). When absent, temperature degrades honestly (see `realDataMissing`).
    readonly realBaselineTempC?: number;
    // §ANALYSIS-REAL-WIND — the REAL regional wind freestream from NASA POWER (10 m
    // wind SPEED + prevailing FROM-direction). When present, the Lawson pedestrian
    // field starts from THIS measured freestream (the shelter/exposure modulation
    // legitimately stays as the computed spatial signal on top of the real wind).
    readonly realWindMeanMs?: number;
    readonly realWindFromDeg?: number;
    // §ANALYSIS-REAL-POPULATION — the REAL WorldPop areal density (persons/HECTARE)
    // for the site. When present the population grid is anchored to this measured
    // density (so a monument reads honestly low + a dense block high), using the OSM
    // GFA footprint pattern only to distribute it spatially within the plot.
    readonly realPopulationPerHa?: number;
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
 * §SITE-METRIC-CLIMATE-INSTANT (founder 2026-06-28) — Temperature + Wind are
 * available the moment a site LOCATION exists, NOT gated on the live ClimateStore
 * being populated. `@pryzm/climate-host` guarantees an INSTANT, offline, bundled
 * regional-normals dataset for any lat/lon (`ensureSiteClimate` Stage 1 writes it
 * synchronously with no network); the live Open-Meteo/PVGIS fetch only refines it
 * in the background. Gating these chips on `hasDataset` (which lags the async
 * ingest, or never lands if the fetch is throttled/blocked) left them stuck on
 * "Wind data loading…". They now enable on `hasLocation`; the selecting path kicks
 * the bundled ingest so the dataset is present by paint time, and the
 * `setClimateOverlayDataset` subscription repaints when it lands.
 *
 * @param hasDataset   a ClimateDataset is ALREADY resolved (for the note nuance).
 * @param hasLocation  a site lat/lon is known — enables sun-hours + temp + wind
 *                     (bundled climate normals are guaranteed for any location).
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
    // Climate metrics enable on location (bundled normals are instant); the note
    // says "regional normals" until the live fetch refines the dataset.
    const climateReason = hasLocation
        ? (hasDataset ? undefined : 'Approx — regional normals')
        : 'Set a site location';
    return [
        // Sun-hours is a GROUND grid — needs only the site lat/lon (sun position) +
        // the massing/context the disc already shows; no climate dataset, no BIM mesh.
        mk('sunHours', hasLocation, true, hasLocation ? undefined : 'Set a site location'),
        // Temperature + wind: available on LOCATION (bundled regional normals are
        // instant + offline; the live fetch only refines). NOT gated on the live store.
        mk('temperature', hasLocation, true, climateReason),
        mk('wind', hasLocation, true, climateReason),
        // Population is an OSM proxy — it needs context footprints, not climate.
        mk('population', true, true),
        // §SITE-METRIC-DAYLIGHT-VSC (2026-06-30) — Daylight (Vertical Sky Component) is
        // now a REAL side-3D ground grid: per cell we sample the sky hemisphere and
        // measure the fraction unobstructed by the massing + OSM context (no climate,
        // no BIM mesh). Available the moment there's an analysis disc (context optional
        // — an open site simply reads near the unobstructed VSC maximum everywhere).
        mk('daylight', true, true),
    ];
}

/**
 * §ANALYSIS-REAL-WIND (ADR-0095) — build a REAL 16-sector wind rose from the NASA POWER
 * freestream (mean 10 m speed + prevailing FROM-direction + a peak/gust speed). The rose
 * concentrates its hours around the measured prevailing direction (a von-Mises-like
 * cosine lobe over the 16 sectors) so the panel's wind-rose SVG plots the REAL prevailing
 * wind instead of the synthesised regional-normals rose. Pure + deterministic.
 *
 * @param meanMs   annual-mean 10 m wind speed (m/s) from NASA POWER WS10M.
 * @param fromDeg  prevailing FROM-direction (deg, 0 = N clockwise) from WD10M.
 * @param gustMs   representative peak/gust 10 m speed (m/s) → the rose's p99.
 */
export function buildRealWindRose(
    meanMs: number,
    fromDeg: number,
    gustMs: number,
): { sectors: { sectorDeg: number; speedBinHours: [number, number, number, number, number, number] }[]; meanSpeedMps: number; p99SpeedMps: number } {
    const SECTORS = 16;
    const HOURS_PER_YEAR = 8760;
    const centre = ((fromDeg % 360) + 360) % 360;
    // Speed-bin thresholds (Beaufort-ish, m/s): [1.5, 3.3, 5.4, 7.9, 10.7, ∞].
    const binOf = (s: number): number =>
        s < 1.5 ? 0 : s < 3.3 ? 1 : s < 5.4 ? 2 : s < 7.9 ? 3 : s < 10.7 ? 4 : 5;
    // Directional weight: a cosine lobe peaking at the prevailing sector (so most hours
    // come from that direction), with a broad floor so every sector has some.
    const weights: number[] = [];
    let wsum = 0;
    for (let i = 0; i < SECTORS; i++) {
        const sectorDeg = (i * 360) / SECTORS;
        let d = Math.abs(sectorDeg - centre) % 360;
        if (d > 180) d = 360 - d;
        const w = 0.15 + 0.85 * Math.pow(Math.cos((d * Math.PI) / 180) * 0.5 + 0.5, 3);
        weights.push(w);
        wsum += w;
    }
    const sectors = weights.map((w, i) => {
        const hours = (w / (wsum || 1)) * HOURS_PER_YEAR;
        const speedBinHours: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0];
        // Put each sector's hours in the bin the mean speed lands in (a simple, honest
        // rose driven by the real mean; a full per-hour histogram isn't available from
        // the monthly climatology, and the mean is what drives the Lawson field anyway).
        speedBinHours[binOf(meanMs)] = hours;
        return { sectorDeg: (i * 360) / SECTORS, speedBinHours };
    });
    return {
        sectors,
        meanSpeedMps: Math.max(0, Math.min(90, meanMs)),
        p99SpeedMps: Math.max(0, Math.min(90, gustMs)),
    };
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

/** Sun-hours intensity (0 = shaded … 1 = full sun) → blue→teal→gold→warm ramp as
 *  [r,g,b] (0..255). Matches `siteMetricLegend('sunHours')`. The numeric core shared
 *  by `sunHoursCellColour` (CSS string) + the §SITE-METRIC-SUN-TEXTURE rasterizer
 *  (so the smooth texture + the legend + the discrete cells read the SAME ramp). */
function sunHoursRgb(intensity: number): readonly [number, number, number] {
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
            return [
                Math.round(r0 + s * (r1 - r0)),
                Math.round(g0 + s * (g1 - g0)),
                Math.round(b0 + s * (b1 - b0)),
            ];
        }
    }
    return [0xF4, 0x75, 0x3A];
}

/** Sun-hours intensity (0 = shaded … 1 = full sun) → blue→teal→gold→warm CSS colour.
 *  Matches `siteMetricLegend('sunHours')` so the legend reads the same scale. */
function sunHoursCellColour(intensity: number): string {
    const [r, g, b] = sunHoursRgb(intensity);
    return `rgb(${r},${g},${b})`;
}

/** One-time log guard for the §perf cell-cap clamp. */
let cellCapClampLogged = false;

/** Resolve the target cell size (m), clamped UP so the grid never exceeds the hard
 *  cell cap (bounds work on a large disc). Logs once when it clamps.
 *  §SITE-METRIC-COST-TIER — `defaultMaxCells` lets an expensive (raycast) metric
 *  default to a far lower cap than a cheap field metric when the caller passes none. */
function resolveCellSize(
    input: MetricGridInput,
    defaultCellM: number,
    defaultMaxCells = 6000,
): { cellSize: number; maxCells: number } {
    const maxCells = Math.max(64, input.maxCells ?? defaultMaxCells);
    let cellSize = input.cellSizeM && input.cellSizeM > 0
        ? input.cellSizeM
        : (input.gridCountCap && input.gridCountCap > 0
            ? (2 * input.radius) / input.gridCountCap
            : defaultCellM);
    // The grid is ~(2R/cellSize)² cells; clamp cellSize up until that is ≤ maxCells.
    const perSide = (cs: number): number => Math.ceil((2 * input.radius) / cs);
    if (perSide(cellSize) * perSide(cellSize) > maxCells) {
        const target = (2 * input.radius) / Math.sqrt(maxCells);
        if (!cellCapClampLogged) {
            cellCapClampLogged = true;
            console.log(
                `[site-metric] §perf cell-cap: ${perSide(cellSize) ** 2} cells would exceed ` +
                `${maxCells}; clamping cell size ${cellSize.toFixed(1)}→${target.toFixed(1)} m.`,
            );
        }
        cellSize = target;
        while (perSide(cellSize) * perSide(cellSize) > maxCells) cellSize *= 1.04;
    }
    return { cellSize, maxCells };
}

// ─────────────────────────────────────────────────────────────────────────────
// §SITE-METRIC-COST-TIER (founder 2026-06-30, ADR-0084) — per-metric grid RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────
//
// The metrics do NOT cost the same per cell. The CHEAP field metrics are O(1) closed
// formulae per cell:
//   • temperature — UHI ΔT from a built-density formula;
//   • wind        — Lawson shelter proxy;
//   • population   — OSM GFA footprint-density proxy.
// They tolerate a very fine grid (~22k cells on the 240 m disc) without stalling.
//
// The EXPENSIVE metrics raycast PER CELL against EVERY context prism for many sky/sun
// directions:
//   • sunHours — one shadow ray-march per (cell × sun-sample × prism);
//   • daylight — one ray-march per (cell × az×alt sky patch × prism) — even heavier.
// On the 240 m disc the OSM context can be hundreds of prisms, so a fine grid here is
// MILLIONS of ray tests — sun-hours then takes minutes or never visibly completes
// (the founder symptom: "sun-hours NOT rendering" while the cheap metrics paint fine).
//
// FIX: DECOUPLE the grid resolution per cost tier. Expensive metrics get a COARSER
// cell floor + a much lower hard cell cap (a few thousand cells) so they complete +
// PAINT in a couple of seconds; the cheap metrics keep the fine field. The renderer
// reads `siteMetricGridBudget(metric)` instead of hard-coding cell size / caps, so
// this one table is the single source of truth (and the unit test pins it).

/** The compute cost class of a metric's per-cell evaluation. `'expensive'` = a
 *  per-cell raycast/sky-sweep against the context prisms (sun-hours, daylight VSC);
 *  `'cheap'` = an O(1) closed-form field (temperature, wind, population). */
export type MetricCostTier = 'cheap' | 'expensive';

/** Classify a metric by per-cell cost (drives the grid-resolution budget). */
export function metricCostTier(metric: SiteMetric): MetricCostTier {
    return metric === 'sunHours' || metric === 'daylight' ? 'expensive' : 'cheap';
}

/** The recommended grid resolution budget for a metric on the large analysis disc.
 *  §SITE-METRIC-COST-TIER — expensive raycast metrics get a COARSER cell + a far
 *  lower cell cap so the per-cell raycast completes + paints within a few seconds;
 *  cheap field metrics keep the fine grid. The renderer passes these straight into
 *  the (chunked) build, so resolution is decoupled per metric in ONE place. */
export function siteMetricGridBudget(metric: SiteMetric): { cellSizeM: number; maxCells: number } {
    return metricCostTier(metric) === 'expensive'
        // Expensive: ~4 m COMPUTE cells, capped ≈ 5000. On the 240 m disc that is a few
        // thousand cells × samples × prisms — completes in a couple of seconds.
        // §SITE-METRIC-SUN-TEXTURE (founder 2026-06-30, ADR-0086): sun-hours no longer
        // renders one Cesium ENTITY per cell — it COMPUTES on this affordable raycast
        // grid then DISPLAYS a SINGLE bilinearly-interpolated texture (smooth, one draw
        // call). So the entity-count ceiling that pinned this at ~5 m / 3.5k is GONE; the
        // only remaining cost is the raycast, so we can afford a slightly FINER compute
        // grid (~4 m, ~5k) → a smoother resampled field. The texture display resolution
        // (SUN_TEXTURE_SIZE) is INDEPENDENT of this and stays fine regardless.
        // DO NOT shrink the COMPUTE cell much below ~3 m — the raycast still scales with
        // cell count and a very fine raycast grid re-freezes the viewport.
        ? { cellSizeM: 4, maxCells: 5000 }
        // §SITE-METRIC-PERF-INSTANT (founder 2026-06-30) — the cheap O(1) field metrics
        // (temperature / wind / population) were oversampled to ~55k cells (cellSize 1.0 m,
        // cap 60k), tripping the "§perf cell-cap … clamping" log and chunking across frames
        // so the heatmap filled in PROGRESSIVELY — "ALL OF THEM TAKE AGES TO RENDER". The
        // DISPLAY is a 512² bilinearly-interpolated texture REGARDLESS of cell count, so a
        // COARSE source lattice upsamples to the SAME smooth result as a fine one — but
        // computes in a single sub-millisecond synchronous pass (these fields are O(1) per
        // cell, no raycast). We therefore drop to a small ~64×64 lattice (≈ the sun-hours
        // cell count, ~few thousand cells) with a generous cell floor: the renderer's cheap
        // branch builds it in ONE pass (no chunkBuild), so it paints IMMEDIATELY on toggle.
        // The cap is well under 5000 so the clamp-and-log never fires. The 512² texture +
        // §SITE-METRIC-PARITY-ALL disc-normalisation give the same smooth, rich gradient as
        // sun-hours. DO NOT raise this back toward a fine grid — it buys nothing visible
        // (the texture interpolates) and re-introduces the multi-frame render lag.
        : { cellSizeM: 7.5, maxCells: 4096 };
}

/** Default target cell edge (m) per metric — derived from the cost-tier budget so the
 *  pure (whole-grid) `buildSiteMetricGrid` path stays consistent with the renderer's
 *  chunked path. §SITE-METRIC-COST-TIER. */
function defaultCellM(metric: SiteMetric): number {
    return siteMetricGridBudget(metric).cellSizeM;
}

/**
 * §SITE-METRIC-CLIMATE-FALLBACK (founder 2026-06-29) — resolve a ClimateDataset for
 * the temperature + wind grids. Prefers the live/ingested `input.dataset`; when that
 * is null (the async ClimateStore ingest hasn't landed, or a blocked fetch never
 * resolves) it SYNTHESISES the OFFLINE bundled regional normals from the site lat/lon
 * — the SAME `fallback-defaults` dataset `ensureSiteClimate` Stage 1 ingests — so the
 * heatmap paints a real field instantly instead of returning 0 cells. Returns null
 * only when there is genuinely no dataset AND no lat/lon to derive one from.
 *
 * Internal (not exported) so it adds no public-API surface / span obligation — the
 * exported `buildSiteMetricGrid` is the single entry point.
 */
function resolveGridDataset(input: MetricGridInput): ClimateDataset | null {
    if (input.dataset) return input.dataset;
    const lat = input.latDeg, lon = input.lngDeg;
    if (lat == null || lon == null) return null;
    try {
        // Deterministic alphanumeric token from the coordinates so the same site reuses
        // one dataset key. The schema id pattern is `climate:[A-Za-z0-9]{16,32}` and the
        // siteRef is `[A-Za-z0-9_-]{3,64}` — NO colons/dots — so we hash to base-36.
        const token = coordToken(lat, lon);
        return buildFallbackClimateDataset({
            id: `climate:${token}`,          // climate:<16 base-36 chars>
            siteRef: `site-bundled-${token}`, // [A-Za-z0-9_-] only
            lat,
            lon,
        });
    } catch {
        return null;
    }
}

/** A stable 16-char base-36 token from a lat/lon pair (FNV-1a over the rounded
 *  coordinates). Pure + deterministic; used to mint a schema-valid bundled dataset
 *  id (`climate:[A-Za-z0-9]{16,32}`) without colons/dots. */
function coordToken(lat: number, lon: number): string {
    const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    // Two independent FNV-1a passes (different seeds) → 32-bit each → 8 base-36 chars
    // each → 16 chars total, always within the 16–32 alphanumeric window.
    const hash = (seed: number): string => {
        let h = seed >>> 0;
        for (let i = 0; i < key.length; i++) {
            h ^= key.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return h.toString(36).padStart(8, '0').slice(-8);
    };
    return (hash(0x811c9dc5) + hash(0x9e3779b1)).slice(0, 16);
}

/**
 * Build the coloured ground cells for a ground-grid metric (sun hours / daylight VSC
 * / temperature / wind / population) in the site-ENU frame. Returns `[]` when the
 * metric's required data is missing. PURE + deterministic.
 *
 * NOTE: for 'sunHours' + 'daylight' this is the SYNCHRONOUS (whole-grid) build — fine
 * for tests and small discs. The editor uses the CHUNKED `prepareSunHoursGrid` /
 * `prepareDaylightVscGrid` drivers for the large interactive disc so the per-cell
 * raycast / sky-sweep never freezes the viewport.
 */
export function buildSiteMetricGrid(
    metric: SiteMetric,
    input: MetricGridInput,
): MetricGridCell[] {
    if (!(input.radius > 0)) return [];
    const up = input.heightAboveGround ?? 0.16;
    const { cellSize, maxCells } = resolveCellSize(
        input, defaultCellM(metric), siteMetricGridBudget(metric).maxCells,
    );
    const { polys, obstacles } = toObstacles(input.footprints);
    const cells = buildStreetGrid(discBoundary(input.radius), polys, {
        cellSize,
        margin: 0,
        maxCells: maxCells + 16,
    });
    if (cells.length === 0) return [];

    if (metric === 'sunHours') {
        const prep = prepareSunHoursGrid(input);
        if (!prep) return [];
        const out: MetricGridCell[] = [];
        for (const c of prep.cells) {
            const cell = prep.evaluate(c);
            if (cell) out.push(cell);
        }
        return out;
    }

    // §SITE-METRIC-DAYLIGHT-VSC — Vertical Sky Component ground grid (per-cell sky
    // sweep against the context prisms). Needs only an analysis disc; no climate/mesh.
    if (metric === 'daylight') {
        const prep = prepareDaylightVscGrid(input);
        if (!prep) return [];
        const out: MetricGridCell[] = [];
        for (const c of prep.cells) {
            const cell = prep.evaluate(c);
            if (cell) out.push(cell);
        }
        return out;
    }

    if (metric === 'population') {
        // §ANALYSIS-REAL-POPULATION (ADR-0095) — anchor the population map to the REAL
        // WorldPop areal density (persons/HECTARE) when we have it. WorldPop is the
        // measured truth: a dense residential block reads high, an open monument/plaza
        // reads honestly LOW (the OSM GFA proxy instead read a landmark's big footprint
        // as "busy"). We keep the OSM footprint field only as the WITHIN-plot SPATIAL
        // pattern (which cells sit over built mass vs open ground), rescaled so the plot
        // MEAN equals the real WorldPop density. When WorldPop is unavailable the metric
        // degrades honestly (flat, labelled low-confidence) — NO synthetic fallback.
        const { cells: pop } = computePopulationDensityGrid(cells, obstacles);
        const realPerHa = input.realPopulationPerHa;
        const haveReal = typeof realPerHa === 'number' && Number.isFinite(realPerHa) && realPerHa >= 0;
        if (haveReal) {
            // persons/ha → persons/m² (÷ 10 000). Distribute the plot-mean real density
            // across cells IN PROPORTION to the OSM built-mass pattern (a cell over 3×
            // the mean built mass carries ~3× the residents), so the map reads real
            // absolute values AND the real spatial concentration.
            const realPerM2 = realPerHa! / 10_000;
            let meanIntensity = 0;
            for (const c of pop) meanIntensity += c.intensity;
            meanIntensity = pop.length > 0 ? meanIntensity / pop.length : 0;
            const scale = meanIntensity > 1e-6 ? realPerM2 / meanIntensity : 0;
            const realCells = pop.map((c) => ({
                ...c,
                // real persons/m² per cell = plot-mean scaled by this cell's relative
                // built-mass; flat (uniform = the real mean) when there is no OSM pattern.
                realDensity: meanIntensity > 1e-6 ? c.intensity * scale : realPerM2,
            }));
            const map = parityFieldMapper(
                realCells.map((c) => ({ intensity: c.realDensity, east: c.x, north: c.z })),
                input.radius,
            );
            return realCells.map((c) => ({
                east: c.x, north: c.z, halfSize: c.size / 2, up,
                colorHex: densityCellColour(map({ intensity: c.realDensity, east: c.x, north: c.z })),
                value: c.realDensity * 10_000, // report REAL persons/hectare in tooltips
            }));
        }
        // §ANALYSIS-NO-FAKE-FALLBACK — no real WorldPop density: fall back to the OSM
        // built-density PATTERN (clearly labelled a proxy in the legend), disc-normalised
        // for a readable gradient but with NO invented radial hotspot.
        const map = parityFieldMapper(
            pop.map((c) => ({ intensity: c.intensity, east: c.x, north: c.z })),
            input.radius,
        );
        return pop.map((c) => ({
            east: c.x, north: c.z, halfSize: c.size / 2, up,
            colorHex: densityCellColour(map({ intensity: c.intensity, east: c.x, north: c.z })),
            value: c.density,
        }));
    }

    // temperature + wind both need the climate baselines. §SITE-METRIC-CLIMATE-FALLBACK
    // — prefer the live/ingested dataset; else SYNTHESISE bundled regional normals from
    // the site lat/lon so the field paints instantly instead of returning 0 cells (the
    // prod "temperature/wind: 0/0" symptom when the async ClimateStore ingest lagged).
    const ds = resolveGridDataset(input);
    if (!ds) return [];
    // §ANALYSIS-REAL-WIND (ADR-0095) — prefer the REAL NASA POWER freestream (10 m mean
    // speed + prevailing FROM-direction). The Lawson shelter/exposure modulation stays
    // the computed spatial signal ON TOP of this measured wind. Falls back to the
    // bundled-normals rose only when POWER is unavailable (labelled estimate).
    const wind = windInput(ds, input.realWindMeanMs, input.realWindFromDeg);

    if (metric === 'wind') {
        const w = computeWindComfortGrid(cells, wind, obstacles);
        // §SITE-METRIC-PARITY-ALL — same disc-normalise + radial-fallback mapper as the
        // other metrics so wind reads as a rich, full-ramp gradient (and never a flat
        // all-calm field when OSM shelter is unavailable), identical quality to sun-hours.
        const map = parityFieldMapper(
            w.map((c) => ({ intensity: c.effectiveSpeedMs, east: c.x, north: c.z })),
            input.radius,
        );
        return w.map((c) => ({
            east: c.x, north: c.z, halfSize: c.size / 2, up,
            colorHex: lawsonRampColour(map({ intensity: c.effectiveSpeedMs, east: c.x, north: c.z })),
            value: c.effectiveSpeedMs,
        }));
    }

    // temperature (UHI). §ANALYSIS-REAL-TEMPERATURE (ADR-0095) — the BASE air temperature
    // is the REAL NASA POWER warm-season climatology when available (not the synthesised
    // regional normals); the built-density UHI ΔT is the spatial modulation ON TOP of it
    // (air temp barely varies across a 240 m disc, so the UHI delta is the real spatial
    // signal, but the base value is now measured). §SITE-METRIC-PARITY-ALL disc-normalises
    // the ΔT field for a rich gradient — but with NO invented radial fallback when the OSM
    // density signal is empty (§ANALYSIS-NO-FAKE-FALLBACK: flat, honest).
    const baselineTempC = typeof input.realBaselineTempC === 'number' && Number.isFinite(input.realBaselineTempC)
        ? input.realBaselineTempC
        : warmBaselineC(ds);
    const heat = computeHeatIslandGrid(cells, { baselineTempC }, wind, obstacles);
    const heatMap = parityFieldMapper(
        heat.map((c) => ({ intensity: c.intensity, east: c.x, north: c.z })),
        input.radius,
    );
    return heat.map((c) => ({
        east: c.x, north: c.z, halfSize: c.size / 2, up,
        colorHex: heatCellColour(heatMap({ intensity: c.intensity, east: c.x, north: c.z })),
        value: c.tempC,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// §SITE-METRIC-WIND-CONTRAST + §SITE-METRIC-TEMP-CONTRAST (founder 2026-06-30)
// ─────────────────────────────────────────────────────────────────────────────
//
// The founder's symptom: the Temperature map reads UNIFORM and the Wind map is a flat
// CALM (all blue) field — "is the data accurate? is it all the same?". Two distinct
// causes, both fixed HERE (this bridge owns the inputs + the per-cell colour) without
// touching the shared @pryzm/street-analytics engines:
//
//  1. WIND was collapsing to all-calm because the freestream the Lawson proxy reduces
//     was too LOW — a temperate bundled-normals mean of ~2–3 m/s sits under the Lawson
//     "comfortable" threshold (2.5 m/s) for EVERY cell, so shelter (which only ever
//     LOWERS speed) can't push any cell into a different class → one flat colour. We
//     give wind a non-zero DIRECTIONAL baseline with a sensible exposure FLOOR (so the
//     open field sits in the differentiating band) and recolour off a continuous,
//     contrast-stretched ramp instead of the 4-class step palette.
//  2. TEMPERATURE variation (UHI ΔT) is real but subtle on the 0→6 °C ramp once
//     ventilation flattens it. We STRETCH the normalised intensity (gamma + gain about
//     a mid pivot) so dense-built (hot) vs open/green (cool) zones clearly differ.
//
// Both are pure value→value remaps; the underlying `value` (°C / m/s) reported for the
// tooltip is the engine's real number — only the COLOUR contrast is sharpened.

/** Directional wind baseline for the grids. §SITE-METRIC-WIND-CONTRAST — derives a
 *  non-zero mean speed (FLOORED so the open field differentiates) + a prevailing FROM
 *  direction from the dataset wind rose. The bundled regional-normals rose is always
 *  non-empty (climate-host guarantees it), so this is never the zero/empty baseline
 *  that produced the flat-calm map. The floor only lifts an unrealistically low
 *  offline mean into the band where OSM shelter actually separates cells; a real live
 *  mean above the floor is passed through unchanged. */
function windInput(
    ds: ClimateDataset,
    realMeanMs?: number,
    realFromDeg?: number,
): { meanMs: number; prevailingFromDeg: number } {
    // §ANALYSIS-REAL-WIND (ADR-0095) — prefer the REAL NASA POWER freestream (10 m mean
    // speed + prevailing FROM-direction). When real, DON'T apply the exposure floor: the
    // measured mean is the truth, and the Lawson shelter modulation on top is the real
    // pedestrian-level spatial signal. When real is absent, fall back to the bundled
    // rose mean with the exposure floor so the estimate still differentiates cells.
    const haveRealMean = typeof realMeanMs === 'number' && Number.isFinite(realMeanMs) && realMeanMs > 0;
    const haveRealDir = typeof realFromDeg === 'number' && Number.isFinite(realFromDeg);
    if (haveRealMean) {
        return {
            meanMs: realMeanMs!,
            prevailingFromDeg: haveRealDir ? ((realFromDeg! % 360) + 360) % 360 : prevailingFromDeg(ds),
        };
    }
    const raw = Math.max(0, ds.windRose.meanSpeedMps);
    // Exposure floor (m/s): the open-field freestream the Lawson proxy starts from.
    // 4.2 m/s sits in the 'acceptable' band, so a sheltered cell drops to 'comfortable'
    // (different colour) while an exposed cell stays acceptable/uncomfortable → variation.
    const WIND_EXPOSURE_FLOOR_MS = 4.2;
    return {
        meanMs: Math.max(WIND_EXPOSURE_FLOOR_MS, raw),
        prevailingFromDeg: haveRealDir ? ((realFromDeg! % 360) + 360) % 360 : prevailingFromDeg(ds),
    };
}

/** §SITE-METRIC-WIND-CONTRAST — continuous calm→gusty Lawson colour ramp (blue →
 *  green → amber → red), so the wind field is a smooth gradient rather than 4 flat
 *  class bands. Mirrors the `LAWSON_COLOURS` hues at the band centres. Pure. */
function lawsonRampColour(intensity: number): string {
    const t = Math.max(0, Math.min(1, intensity));
    const stops: ReadonlyArray<readonly [number, number, number, number]> = [
        [0.00, 0x3B, 0x82, 0xF6], // #3B82F6 — calm (comfortable blue)
        [0.40, 0x22, 0xC5, 0x5E], // #22C55E — acceptable green
        [0.72, 0xF5, 0x9E, 0x0B], // #F59E0B — uncomfortable amber
        [1.00, 0xEF, 0x44, 0x44], // #EF4444 — gusty red
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
    return '#EF4444';
}


// ─────────────────────────────────────────────────────────────────────────────
// §SITE-METRIC-PARITY-ALL (founder 2026-06-30) — every metric reads like sun-hours
// ─────────────────────────────────────────────────────────────────────────────
//
// Founder symptom: "the TEMPERATURE cells are terrible — all the graphics should be
// EXACTLY the same as sun-hours, for all of them." Sun-hours looks rich because its
// raw field spans a wide range across the disc (deep shade → full sun), so it fills
// the WHOLE blue→gold ramp. Temperature / wind map to ABSOLUTE/fixed-pivot scales, so
// the real on-site spread (e.g. 24–26 °C, or an all-sheltered calm field) collapses
// to a single flat band. Worse: when the OSM context is unavailable (Overpass 504s)
// the UHI/shelter signal is EMPTY → the field is dead-flat → one uniform colour.
//
// FIX — one shared mapper for the cheap field metrics (temperature / wind / population):
//   1. DISC-NORMALISE each field to its OWN min→max across the disc (full-ramp like
//      sun-hours), with a median-pivot gain so the gradient is rich, not washed.
//   2. When the field is genuinely DEGENERATE (≤ epsilon spread — no real spatial
//      signal), DEGRADE HONESTLY: return a FLAT mid value everywhere (a uniform,
//      truthful "no spatial variation to show" read).
//
// §ANALYSIS-NO-FAKE-FALLBACK (founder 2026-07-01, ADR-0095) — the previous version
// substituted a SMOOTH procedural RADIAL gradient (hot/dense at the site centroid,
// cooling to the disc edge) when the field was degenerate. That was an INVENTED
// hotspot centred on the building — a landmark like Sagrada Família would read a fake
// "busy" bullseye purely from geometry, with no data behind it. That radial synthetic
// is now REMOVED. When there is no real spatial signal the mapper returns a flat field
// (the caller labels the metric low-confidence / estimate-unavailable), NEVER a
// building-centred gradient. The real per-cell `value` (°C / m/s / persons·ha⁻¹) stays
// the engine's real number for tooltips/legend; only the COLOUR mapping is normalised.
// Pure + deterministic.

/** A field sample carrying its disc position so the degenerate-flat fallback can
 *  synthesise a smooth spatial gradient from geometry alone. */
interface FieldSample {
    /** Raw scalar intensity the colour ramp consumes (any units; remapped to 0..1). */
    readonly intensity: number;
    /** Cell-centre east/north (m) from the site origin — for the radial fallback. */
    readonly east: number;
    readonly north: number;
}

/**
 * §SITE-METRIC-PARITY-ALL — build a per-field colour mapper `(sample) → 0..1` that
 * spans the full ramp when there IS a real spatial signal: disc-normalise to the
 * field's own min→max with a median-pivot gain (rich, like sun-hours).
 *
 * §ANALYSIS-NO-FAKE-FALLBACK (ADR-0095) — when the field is genuinely degenerate-flat
 * (no real spatial signal), DEGRADE HONESTLY: return a FLAT mid value everywhere. The
 * old building-centred synthetic RADIAL gradient is REMOVED — it invented a fake
 * hotspot on the studied building with no data behind it. Pure.
 *
 * @param radiusM the analysis-disc radius (m) — retained for signature stability.
 */
function parityFieldMapper(
    samples: readonly FieldSample[],
    radiusM: number,
): (s: FieldSample) => number {
    void radiusM; // §ANALYSIS-NO-FAKE-FALLBACK — no radial fallback; radius unused now.
    let lo = Infinity, hi = -Infinity;
    for (const s of samples) {
        if (!Number.isFinite(s.intensity)) continue;
        if (s.intensity < lo) lo = s.intensity;
        if (s.intensity > hi) hi = s.intensity;
    }
    const span = hi - lo;

    // §ANALYSIS-NO-FAKE-FALLBACK — degenerate field (flat, or no finite samples) →
    // a FLAT mid value everywhere. Honest: "no spatial variation to show" reads as one
    // uniform colour, NOT an invented radial hotspot centred on the building.
    if (!(span > 1e-4)) {
        return (_s: FieldSample): number => 0.5;
    }

    // Real spread → disc min→max stretch + median-pivot gain (the sun-hours-rich look).
    const norm = samples
        .map((s) => s.intensity)
        .filter((v) => Number.isFinite(v))
        .map((v) => (v - lo) / span)
        .sort((a, b) => a - b);
    const mid = norm.length > 0 ? norm[Math.floor(norm.length / 2)]! : 0.5;
    const pivot = Math.max(0.1, Math.min(0.9, mid));
    const gain = 1.7;                                            // fill the ramp
    return (s: FieldSample): number => {
        const n = Math.max(0, Math.min(1, (s.intensity - lo) / span));
        const c = (n - pivot) * gain + pivot;
        return Math.max(0, Math.min(1, c));
    };
}

// ── Chunked sun-hours build (the heaviest metric — raycast per cell) ──────────
//
// The sun-hours grid is the only metric whose PER-CELL cost (raycast × sun samples
// × building prisms) is heavy enough to freeze the viewport on a large, fine disc.
// `prepareSunHoursGrid` does the cheap setup ONCE (grid + sun samples + prisms) and
// returns the cells PLUS a pure per-cell `evaluate`, so the editor can drive the
// heavy loop in batches across frames (progressive reveal) instead of synchronously.

/** A grid cell awaiting sun-hours evaluation (centre + size, ENU XZ metres). */
export interface SunHoursCell {
    readonly x: number;          // east
    readonly z: number;          // north
    readonly size: number;       // cell edge (m)
    readonly underBuilding: boolean;
}

/** A prepared sun-hours build: the cells + a pure per-cell evaluator + the float
 *  height the cells render at. The caller batches `evaluate` across frames. */
export interface SunHoursGridPrep {
    readonly cells: ReadonlyArray<SunHoursCell>;
    /** Evaluate ONE cell → its coloured `MetricGridCell`, or null to skip (under a
     *  building). Pure + deterministic; safe to call in any order / in batches. */
    readonly evaluate: (cell: SunHoursCell) => MetricGridCell | null;
    // §SITE-METRIC-SUN-TEXTURE (founder 2026-06-30, ADR-0086) — DISPLAY/COMPUTE
    // decouple. These let the renderer COMPUTE sun-hours on this affordable raycast
    // grid, then DISPLAY a smooth bilinearly-interpolated texture (one draw call)
    // instead of thousands of discrete rectangle entities (which read as big squares
    // and were the entity-count drag). The texture is finer-looking AND cheaper.
    /** Raw sun-hours INTENSITY (0 = shaded … 1 = full sun) at a cell centre, or
     *  null when the cell is under a building (no contribution to the field). The
     *  heavy raycast lives here; the caller still batches it across frames. */
    readonly evaluateIntensity: (cell: SunHoursCell) => number | null;
    /** The compute-grid cell edge (m) — the spacing of the cell-centre lattice the
     *  texture resamples FROM. */
    readonly cellSizeM: number;
    /** The analysis-disc radius (m) the texture spans (square 2R × 2R, round cutout). */
    readonly radiusM: number;
}

/**
 * Prepare a chunkable sun-hours ground grid. Returns null when sun-hours can't be
 * computed (no radius / no lat-lon). The cheap work (grid, sun-sample set, building
 * prisms, normalisation) is done here ONCE; the heavy per-cell raycast lives in the
 * returned `evaluate`, which the editor calls in per-frame batches. PURE.
 */
export function prepareSunHoursGrid(input: MetricGridInput): SunHoursGridPrep | null {
    if (!(input.radius > 0)) return null;
    const lat = input.latDeg, lng = input.lngDeg;
    if (lat == null || lng == null) return null;
    const up = input.heightAboveGround ?? 0.16;
    const { cellSize, maxCells } = resolveCellSize(
        input, defaultCellM('sunHours'), siteMetricGridBudget('sunHours').maxCells,
    );
    const { polys } = toObstacles(input.footprints);
    const cells = buildStreetGrid(discBoundary(input.radius), polys, {
        cellSize,
        margin: 0,
        maxCells: maxCells + 16,
    });
    if (cells.length === 0) return null;

    const stepMinutes = input.sunStepMinutes && input.sunStepMinutes > 0 ? input.sunStepMinutes : 15;
    const samples = generateSunSamples({
        latDeg: lat,
        lngDeg: lng,
        dayOfYear: sunDayOfYear(input.sunDay),
        stepMinutes,
        daylightOnly: true,
    });
    const stepHours = stepMinutes / 60;
    const prisms = toPrisms(input.footprints);
    const sampleUp = 0.5;
    const maxHours = samples.length * stepHours;
    const radius = input.radius;

    // §SITE-METRIC-SUN-TEXTURE — the heavy raycast, factored out so BOTH the discrete
    // `evaluate` (legacy entity path / tests) and the smooth-texture rasterizer share
    // ONE compute. Returns intensity (0..1) at the cell centre, or null under a mass /
    // outside the disc (no field contribution).
    const evaluateIntensity = (c: SunHoursCell): number | null => {
        if (c.underBuilding) return null;                 // inside the mass — skip
        // Skip cells outside the analysis disc (round Forma-style cutout).
        if (Math.hypot(c.x, c.z) > radius * 1.02) return null;
        let lit = 0;
        for (const s of samples) {
            if (!sunBlocked(c.x, c.z, sampleUp, s, prisms)) lit++;
        }
        const hours = lit * stepHours;
        return maxHours > 0 ? hours / maxHours : 0;
    };

    const evaluate = (c: SunHoursCell): MetricGridCell | null => {
        const intensity = evaluateIntensity(c);
        if (intensity == null) return null;
        return {
            east: c.x, north: c.z, halfSize: c.size / 2, up,
            colorHex: sunHoursCellColour(intensity),
            value: intensity * maxHours,
        };
    };

    return {
        cells: cells.map((c) => ({ x: c.x, z: c.z, size: c.size, underBuilding: c.underBuilding })),
        evaluate,
        evaluateIntensity,
        cellSizeM: cellSize,
        radiusM: radius,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// §FORMA-FACADE-ANALYSIS (ADR-0093, 2026-06-30) — sun-hours on the BUILDING FAÇADE
// ─────────────────────────────────────────────────────────────────────────────
//
// Task B: on demand (toggle, default OFF), paint the active metric (priority:
// SUN-HOURS) on the user's DESIGNED building's outer FAÇADE + roof — not the context
// buildings — with the SAME blue→teal→gold→warm ramp as the ground heatmap.
//
// This is the COMPUTE half (pure, no Cesium/THREE/DOM, P2-safe): from the building's
// exterior footprint ring + per-storey heights it generates a lattice of sample
// POINTS across each exterior vertical wall face (along the segment × up the storey)
// plus the roof, and exposes a pure `evaluateIntensity(point)` that runs the SAME
// direct-beam shadow test the ground grid uses (`sunBlocked` vs the extruded context
// + own-massing prisms). The CesiumViewport renders coloured quads/points per face
// (clean per-face colouring; the smooth-interpolated-per-face version is SPEC'd in
// ADR-0093). The caller batches `evaluateIntensity` across frames so the per-point
// raycast never freezes the viewport.
//
// FRAME: same as the ground grid — (east, north, up) metres; footprint rings are the
// StreetGrid XZ convention (x = east, z = north). The outward face NORMAL is used only
// to nudge the sample point just outside the wall so it doesn't self-occlude.

/** A façade sample point on the designed building's exterior surface. */
export interface FacadeSamplePoint {
    /** Sample position — east metres from the site origin. */
    readonly east: number;
    /** Sample position — north metres from the site origin. */
    readonly north: number;
    /** Sample position — up metres above ground. */
    readonly up: number;
    /** Surface kind (wall face or roof) — for the renderer's quad orientation. */
    readonly surface: 'wall' | 'roof';
    /** Outward unit normal in (east, north) for a WALL face; (0,0) for roof (faces up). */
    readonly normE: number;
    readonly normN: number;
}

/** Inputs for the façade-sun build. Reuses the ground grid's sun fields. */
export interface FacadeSunInput {
    /** The DESIGNED building's exterior footprint ring(s), site-ENU XZ metres
     *  (x = east, z = north). One ring per disjoint mass; each is treated as a closed
     *  loop of exterior wall faces. */
    readonly footprintRings: ReadonlyArray<ReadonlyArray<Pt>>;
    /** Total building height (m) — the top of the highest storey (roof level). */
    readonly heightM: number;
    /** OCCLUDER footprints (context + the designed building itself) for the shadow
     *  test — same shape as the ground grid's `footprints`. */
    readonly occluders: readonly MetricFootprint[];
    /** Site latitude (deg) — REQUIRED (sun position). */
    readonly latDeg: number;
    /** Site longitude (deg) — REQUIRED. */
    readonly lngDeg: number;
    /** Analysis-day preset (default 'summer'). */
    readonly sunDay?: SunDayPreset;
    /** Sun sample cadence (minutes). Default 25 (matches the ground sun-hours). */
    readonly sunStepMinutes?: number;
    /** Target sample spacing on the façade (m). Default 2.5 (clean per-face read). */
    readonly sampleSpacingM?: number;
    /** Hard cap on façade sample points (perf). Default 4000. */
    readonly maxSamples?: number;
}

/** A prepared façade-sun build: the sample points + a pure per-point evaluator. */
export interface FacadeSunPrep {
    readonly points: ReadonlyArray<FacadeSamplePoint>;
    /** Sun-hours INTENSITY (0 = shaded … 1 = full sun) at a sample point. Pure +
     *  deterministic; safe to batch in any order. The heavy raycast lives here. */
    readonly evaluateIntensity: (p: FacadeSamplePoint) => number;
    /** Map an intensity (0..1) → the SAME blue→teal→gold→warm CSS colour as the
     *  ground sun-hours heatmap (so the façade + floor read one ramp). */
    readonly colourFor: (intensity: number) => string;
}

/**
 * §FORMA-FACADE-ANALYSIS — generate façade sample points across a building footprint.
 * PURE: walks each ring's edges, lays a grid of points along the segment (× up the
 * height) on each EXTERIOR wall face, plus a coarse roof grid, and nudges each wall
 * point slightly OUTWARD along the face normal so the shadow ray doesn't self-occlude.
 * Exported separately (not inlined) so the sampling is unit-testable without the
 * sun/occlusion machinery.
 *
 * @param footprintRings  exterior ring(s), site-ENU XZ metres.
 * @param heightM         building top height (m).
 * @param spacing         target sample spacing (m).
 * @param maxSamples      hard cap (samples are decimated by raising the spacing).
 */
export function buildFacadeSamplePoints(
    footprintRings: ReadonlyArray<ReadonlyArray<Pt>>,
    heightM: number,
    spacing = 2.5,
    maxSamples = 4000,
): FacadeSamplePoint[] {
    const H = Math.max(0.5, heightM);
    const out: FacadeSamplePoint[] = [];
    const step = Math.max(0.5, spacing);

    // Ring winding determines the inward side; we nudge OUTWARD (away from the ring
    // centroid) regardless of winding, which is robust for convex + mildly-concave
    // plans (a planning heatmap, not a survey).
    for (const ring of footprintRings) {
        if (ring.length < 3) continue;
        // Centroid (for the outward direction).
        let cx = 0, cz = 0;
        for (const p of ring) { cx += p.x; cz += p.z; }
        cx /= ring.length; cz /= ring.length;

        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!;
            const b = ring[(i + 1) % ring.length]!;
            const dx = b.x - a.x, dz = b.z - a.z;
            const segLen = Math.hypot(dx, dz);
            if (segLen < 1e-3) continue;
            const ux = dx / segLen, uz = dz / segLen;        // along-segment unit
            // Face normal candidates (perpendicular); pick the one pointing AWAY from
            // the centroid (outward).
            let nE = -uz, nN = ux;
            const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2; // segment midpoint
            if ((mx - cx) * nE + (mz - cz) * nN < 0) { nE = -nE; nN = -nN; }

            const nAlong = Math.max(1, Math.round(segLen / step));
            const nUp = Math.max(1, Math.round(H / step));
            for (let s = 0; s <= nAlong; s++) {
                const t = s / nAlong;
                const px = a.x + ux * segLen * t;
                const pz = a.z + uz * segLen * t;
                for (let u = 0; u <= nUp; u++) {
                    const up = (u / nUp) * H;
                    out.push({
                        // Nudge 0.25 m outward so the ray clears the wall face itself.
                        east: px + nE * 0.25,
                        north: pz + nN * 0.25,
                        up: Math.max(0.3, up),
                        surface: 'wall',
                        normE: nE,
                        normN: nN,
                    });
                }
            }
        }

        // Roof: a coarse grid over the ring bbox at the top, point-in-ring filtered.
        let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
        for (const p of ring) {
            if (p.x < minE) minE = p.x; if (p.x > maxE) maxE = p.x;
            if (p.z < minN) minN = p.z; if (p.z > maxN) maxN = p.z;
        }
        const roofRing = ring.map((p) => ({ e: p.x, n: p.z }));
        const roofStep = step * 1.5;
        for (let e = minE; e <= maxE; e += roofStep) {
            for (let n = minN; n <= maxN; n += roofStep) {
                if (!pointInRing(e, n, roofRing)) continue;
                out.push({ east: e, north: n, up: H + 0.05, surface: 'roof', normE: 0, normN: 0 });
            }
        }
    }

    // §perf — decimate uniformly if over the cap (keep every k-th point).
    if (out.length > maxSamples && maxSamples > 0) {
        const k = Math.ceil(out.length / maxSamples);
        const decimated: FacadeSamplePoint[] = [];
        for (let i = 0; i < out.length; i += k) decimated.push(out[i]!);
        return decimated;
    }
    return out;
}

/**
 * §FORMA-FACADE-ANALYSIS — prepare a chunkable façade sun-hours build. Returns null
 * when it can't compute (no rings / no lat-lon). The cheap work (sample points, sun
 * samples, occluder prisms, normalisation) is done ONCE here; the heavy per-point
 * raycast lives in the returned `evaluateIntensity`, which the editor calls in
 * per-frame batches. PURE.
 *
 * Span: §FORMA-FACADE-ANALYSIS — a single structured console breadcrumb (this
 * transitional apps/editor/src/ui/climate zone has no L7 otel facade; same convention
 * as `rasterizeSunHoursTexture` / `prepareDaylightVscGrid`).
 */
export function prepareFacadeSunGrid(input: FacadeSunInput): FacadeSunPrep | null {
    if (!input.footprintRings.some((r) => r.length >= 3)) return null;
    if (input.latDeg == null || input.lngDeg == null) return null;

    const points = buildFacadeSamplePoints(
        input.footprintRings,
        input.heightM,
        input.sampleSpacingM ?? 2.5,
        input.maxSamples ?? 4000,
    );
    if (points.length === 0) return null;

    const stepMinutes = input.sunStepMinutes && input.sunStepMinutes > 0 ? input.sunStepMinutes : 25;
    const samples = generateSunSamples({
        latDeg: input.latDeg,
        lngDeg: input.lngDeg,
        dayOfYear: sunDayOfYear(input.sunDay),
        stepMinutes,
        daylightOnly: true,
    });
    const prisms = toPrisms(input.occluders);
    const maxLit = samples.length || 1;

    const evaluateIntensity = (p: FacadeSamplePoint): number => {
        let lit = 0;
        for (const s of samples) {
            // A wall face only receives a sun sample whose direction is on its OUTWARD
            // side (back-faces are self-shaded); the roof faces up so it takes all
            // above-horizon samples. east = dir.x, north = −dir.z, up = dir.y.
            const sE = s.dir.x, sN = -s.dir.z;
            if (p.surface === 'wall') {
                const facing = sE * p.normE + sN * p.normN;
                if (facing <= 0) continue;               // sun is behind this face
            }
            if (!sunBlocked(p.east, p.north, p.up, s, prisms)) lit++;
        }
        return Math.max(0, Math.min(1, lit / maxLit));
    };

    try {
        console.debug(
            `[span][forma-facade-analysis] prepared ${points.length} façade sample point(s); ` +
            `${samples.length} sun sample(s), ${prisms.length} occluder prism(s), ` +
            `H ${input.heightM.toFixed(1)} m.`,
        );
    } catch { /* console unavailable (headless test) — span is best-effort */ }

    return { points, evaluateIntensity, colourFor: sunHoursCellColour };
}

// ─────────────────────────────────────────────────────────────────────────────
// §SITE-METRIC-SUN-TEXTURE (founder 2026-06-30, ADR-0086) — smooth sun-hours TEXTURE
// ─────────────────────────────────────────────────────────────────────────────
//
// PROBLEM: sun-hours raycasts PER CELL × sun-sample × prism, so a FINE compute grid
// freezes the viewport ("§perf cell-cap …; clamping 5.0→8.1 m", "2199 cell(s)"). The
// cheap field metrics paint at ~1.3 m and read smooth; sun-hours read as a few
// thousand big squares.
//
// FIX — DECOUPLE DISPLAY from COMPUTE. The expensive part is the raycast COMPUTE, not
// the render. So we COMPUTE sun-hours on the affordable raycast grid (a few thousand
// cell centres, unchanged), then DISPLAY it as ONE bilinearly-interpolated TEXTURE
// over the disc — a single draw call, no thousands of entities, and a SMOOTH gradient
// (no visible squares). This is both finer-LOOKING and cheaper to render than the
// discrete cells.
//
// HOW: the compute cells sit on a regular `cellSize` lattice (buildStreetGrid), so we
// snap each computed intensity into a coarse index lattice `[gi][gj]` (+ a valid mask
// — cells under a mass / outside the disc are holes). Then for every fine display
// texel we BILINEARLY interpolate from the 4 surrounding lattice nodes, renormalising
// the weights by the valid mask so holes fill smoothly from their neighbours instead
// of punching dark squares. Texels outside the round analysis disc get alpha 0 (the
// Forma-style circular cutout); a thin edge feather avoids a hard ring.

/** A rasterised sun-hours field: a square RGBA texture (premultiplied-free, straight
 *  alpha) the renderer uploads to ONE Cesium ground rectangle covering the disc. */
export interface SunHoursTexture {
    /** Texture edge in texels (square `size × size`). */
    readonly size: number;
    /** RGBA bytes, row-major, `size·size·4` long. Row 0 = NORTH edge (north→south as
     *  v increases) so the caller maps it onto a north-up rectangle directly. */
    readonly rgba: Uint8ClampedArray;
    /** Disc radius (m) the square texture spans — its half-width in ENU metres. */
    readonly radiusM: number;
    /** Count of compute cells that contributed a value (diagnostic / span). */
    readonly sampleCount: number;
}

/** Fine DISPLAY resolution (texels per side) of the sun-hours texture — DECOUPLED
 *  from the (coarse, affordable) raycast COMPUTE grid. 512² ≈ 262k texels over the
 *  2R-wide disc square is ≈ 0.9 m / texel on the 240 m (480 m-wide) analysis disc —
 *  ~10× finer than the ~8 m compute cells the founder called "massive", reading as
 *  smooth as the cheap metrics. It is a PURE CPU bilinear resample (NO extra raycasts)
 *  + ONE GPU upload (one ground rectangle), so going this fine costs almost nothing —
 *  unlike adding display cells as entities, which is why the discrete path stayed
 *  coarse. §SITE-METRIC-SUN-TEXTURE. */
const SUN_TEXTURE_SIZE = 512;

/**
 * §SITE-METRIC-SUN-TEXTURE — rasterise a SMOOTH, bilinearly-interpolated sun-hours
 * texture from already-computed per-cell intensities. PURE (no Cesium / THREE / DOM):
 * returns raw RGBA bytes the renderer wraps in a canvas/data-texture.
 *
 * @param prep        the prepared grid (gives `cellSizeM`, `radiusM`, the cells).
 * @param intensities intensity (0..1) PER cell in `prep.cells` order, or null for a
 *                    skipped cell (under a mass / outside the disc). Length must match
 *                    `prep.cells`. The caller fills this by batching `evaluateIntensity`
 *                    across frames (chunked), then calls this ONCE.
 * @param texSize     texture edge in texels (default `SUN_TEXTURE_SIZE`).
 *
 * Span: §SITE-METRIC-SUN-TEXTURE — a single structured console breadcrumb (this
 * transitional apps/editor/src/ui/climate zone has no L7 otel facade; the GA otel-span
 * gate scopes only the plugins handler dirs — same convention as `prepareDaylightVscGrid`).
 */
export function rasterizeSunHoursTexture(
    prep: SunHoursGridPrep,
    intensities: ReadonlyArray<number | null>,
    texSize: number = SUN_TEXTURE_SIZE,
): SunHoursTexture {
    const R = prep.radiusM;
    const cs = Math.max(0.5, prep.cellSizeM);
    const size = Math.max(8, Math.floor(texSize));

    // ── Build the coarse value lattice keyed by snapped (gi, gj). Index 0 sits at
    //    the disc's −R edge; `nLat` nodes span the full 2R square (+1 for the far edge).
    const nLat = Math.max(2, Math.ceil((2 * R) / cs) + 1);
    const vals = new Float32Array(nLat * nLat);   // accumulated intensity
    const wts = new Float32Array(nLat * nLat);    // accumulation weight (cell count)
    const at = (gi: number, gj: number): number => gj * nLat + gi;
    let sampleCount = 0;
    const cells = prep.cells;
    for (let i = 0; i < cells.length; i++) {
        const v = intensities[i];
        if (v == null) continue;                  // hole (under a mass / off-disc)
        const c = cells[i]!;
        // Snap the cell centre to its nearest lattice node (centres ARE on the lattice
        // up to the buildStreetGrid offset; nearest-node is robust to that offset).
        const gi = Math.max(0, Math.min(nLat - 1, Math.round((c.x + R) / cs)));
        const gj = Math.max(0, Math.min(nLat - 1, Math.round((c.z + R) / cs)));
        const idx = at(gi, gj);
        vals[idx]! += v;
        wts[idx]! += 1;
        sampleCount++;
    }
    // Collapse accumulations → mean per node; valid where any cell landed.
    const node = new Float32Array(nLat * nLat);
    const valid = new Uint8Array(nLat * nLat);
    for (let k = 0; k < node.length; k++) {
        if (wts[k]! > 0) { node[k] = vals[k]! / wts[k]!; valid[k] = 1; }
    }

    // ── Resample → fine RGBA texture with masked bilinear interpolation.
    const rgba = new Uint8ClampedArray(size * size * 4);
    for (let ty = 0; ty < size; ty++) {
        // Texel centre → ENU north (row 0 = north edge, +R; row size-1 = −R).
        const north = R - ((ty + 0.5) / size) * (2 * R);
        for (let tx = 0; tx < size; tx++) {
            const east = -R + ((tx + 0.5) / size) * (2 * R);
            const o = (ty * size + tx) * 4;
            // Outside the round disc → transparent (with a thin feather to avoid a ring).
            const dist = Math.hypot(east, north);
            if (dist > R) { rgba[o + 3] = 0; continue; }
            // Position in lattice coordinates.
            const fx = (east + R) / cs;
            const fz = (north + R) / cs;
            const gi = Math.floor(fx), gj = Math.floor(fz);
            const sx = fx - gi, sz = fz - gj;
            // Masked bilinear: weight each of the 4 corners by (1−s)/s AND its valid
            // mask, then renormalise so holes don't darken — they fill from neighbours.
            let acc = 0, wsum = 0;
            const corner = (ci: number, cj: number, w: number): void => {
                if (ci < 0 || cj < 0 || ci >= nLat || cj >= nLat) return;
                const k = at(ci, cj);
                if (!valid[k]) return;
                acc += node[k]! * w; wsum += w;
            };
            corner(gi, gj, (1 - sx) * (1 - sz));
            corner(gi + 1, gj, sx * (1 - sz));
            corner(gi, gj + 1, (1 - sx) * sz);
            corner(gi + 1, gj + 1, sx * sz);
            if (wsum <= 0) { rgba[o + 3] = 0; continue; } // no nearby data → transparent
            const [r, g, b] = sunHoursRgb(acc / wsum);
            rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b;
            // Match the discrete-cell alpha (0.5) for parity with the legend/overlay,
            // feathering the outermost ~2% of the radius so the disc edge reads soft.
            const edge = Math.max(0, Math.min(1, (R - dist) / (R * 0.02)));
            rgba[o + 3] = Math.round(0.5 * 255 * edge);
        }
    }

    // §SITE-METRIC-SUN-TEXTURE span breadcrumb (see doc-comment above).
    try {
        console.debug(
            `[span][site-metric-sun-texture] rasterised ${size}×${size} texels from ` +
            `${sampleCount}/${cells.length} computed cell(s); lattice ${nLat}×${nLat}, ` +
            `cell ${cs.toFixed(1)} m, radius ${R.toFixed(0)} m.`,
        );
    } catch { /* console unavailable (headless test) — span is best-effort */ }

    return { size, rgba, radiusM: R, sampleCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// §SITE-METRIC-TEXTURE (founder 2026-06-30, ADR-0086) — UNIVERSAL smooth render path
// ─────────────────────────────────────────────────────────────────────────────
//
// The founder's "cells are massive / make them ~10% the size" applies to EVERY metric,
// not just sun-hours: the discrete render draws one Cesium ENTITY per cell, so a fine
// grid is capped on entity count (~28k) → temperature still reads blocky (~2.5 m). The
// fix generalises the sun-hours texture-decouple to ALL metrics: rasterise whatever
// cells a metric produced into ONE smooth, bilinearly-interpolated ground texture (one
// draw call), so the per-cell ENTITY cap is gone and the DISPLAY can be arbitrarily
// fine regardless of the compute cell size. We interpolate in RGB SPACE straight from
// each cell's own `colorHex`, so this is metric-AGNOSTIC — it honours every metric's
// existing ramp (the sun blue→warm, the Lawson step palette, the purple VSC ramp, the
// warm UHI ramp) with no per-metric numeric replumb.

/** Parse a CSS colour (`#RGB`, `#RRGGBB`, or `rgb(r,g,b)`) → [r,g,b] 0..255. The metric
 *  ramps emit exactly these forms; unknown input falls back to mid-grey. PURE. */
function parseCssRgb(css: string): readonly [number, number, number] {
    const s = css.trim();
    if (s.charCodeAt(0) === 35 /* '#' */) {
        const hex = s.slice(1);
        if (hex.length === 3) {
            const r = parseInt(hex[0]! + hex[0]!, 16);
            const g = parseInt(hex[1]! + hex[1]!, 16);
            const b = parseInt(hex[2]! + hex[2]!, 16);
            return [r, g, b];
        }
        if (hex.length >= 6) {
            return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
        }
    }
    const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) return [+m[1]!, +m[2]!, +m[3]!];
    return [128, 128, 128];
}

/** A rasterised metric field: a square RGBA texture the renderer uploads to ONE Cesium
 *  ground rectangle covering the disc. The universal smooth-display product for ALL
 *  metrics (sun-hours, temperature, wind, population, daylight). §SITE-METRIC-TEXTURE. */
export interface MetricTexture {
    /** Texture edge in texels (square `size × size`). */
    readonly size: number;
    /** RGBA bytes, row-major, `size·size·4`. Row 0 = NORTH edge (maps onto a north-up
     *  rectangle directly). */
    readonly rgba: Uint8ClampedArray;
    /** Disc radius (m) the square texture spans — its half-width in ENU metres. */
    readonly radiusM: number;
    /** Count of cells that contributed a colour (diagnostic / span). */
    readonly sampleCount: number;
}

/** Default fine DISPLAY resolution for the universal metric texture — same rationale
 *  as `SUN_TEXTURE_SIZE` (≈ 0.9 m/texel on the 240 m disc, ONE GPU upload). */
const METRIC_TEXTURE_SIZE = SUN_TEXTURE_SIZE;

/** Straight-alpha of the heatmap (matches the discrete-cell `withAlpha(0.5)`). */
const METRIC_TEXTURE_ALPHA = 0.5;

/**
 * §SITE-METRIC-TEXTURE — rasterise ANY metric's coloured ground cells into ONE smooth,
 * bilinearly-interpolated RGBA texture (RGB-space interpolation of each cell's own
 * `colorHex`, so it is metric-agnostic + honours every existing ramp). Holes (cells
 * skipped under a mass / off-disc) fill from neighbours via a mask-renormalised
 * bilinear; texels outside the round disc are transparent (the Forma cutout + edge
 * feather). PURE (no Cesium / THREE / DOM) — returns raw bytes the renderer wraps in a
 * canvas. The DISPLAY resolution is independent of the cells' compute resolution, so a
 * COARSE compute grid (sun-hours raycast, or a capped cheap grid) still displays fine.
 *
 * @param cells     the metric's coloured cells (centre `east`/`north`, `colorHex`).
 * @param radiusM   the analysis-disc radius (m) the texture spans.
 * @param cellSizeM the cells' spacing (m) — the lattice the texture resamples FROM.
 * @param texSize   texture edge in texels (default `METRIC_TEXTURE_SIZE`).
 *
 * Span: §SITE-METRIC-TEXTURE — a single structured console breadcrumb (same convention
 * as `rasterizeSunHoursTexture` / `prepareDaylightVscGrid`).
 */
export function rasterizeMetricTexture(
    cells: ReadonlyArray<MetricGridCell>,
    radiusM: number,
    cellSizeM: number,
    texSize: number = METRIC_TEXTURE_SIZE,
): MetricTexture {
    const R = Math.max(1, radiusM);
    const cs = Math.max(0.5, cellSizeM);
    const size = Math.max(8, Math.floor(texSize));

    // Coarse RGB lattice keyed by snapped (gi, gj): accumulate each channel + a weight.
    const nLat = Math.max(2, Math.ceil((2 * R) / cs) + 1);
    const accR = new Float32Array(nLat * nLat);
    const accG = new Float32Array(nLat * nLat);
    const accB = new Float32Array(nLat * nLat);
    const wts = new Float32Array(nLat * nLat);
    const at = (gi: number, gj: number): number => gj * nLat + gi;
    let sampleCount = 0;
    for (let i = 0; i < cells.length; i++) {
        const c = cells[i]!;
        if (Math.hypot(c.east, c.north) > R * 1.02) continue; // off-disc → hole
        const [r, g, b] = parseCssRgb(c.colorHex);
        const gi = Math.max(0, Math.min(nLat - 1, Math.round((c.east + R) / cs)));
        const gj = Math.max(0, Math.min(nLat - 1, Math.round((c.north + R) / cs)));
        const k = at(gi, gj);
        accR[k]! += r; accG[k]! += g; accB[k]! += b; wts[k]! += 1;
        sampleCount++;
    }
    const nodeR = new Float32Array(nLat * nLat);
    const nodeG = new Float32Array(nLat * nLat);
    const nodeB = new Float32Array(nLat * nLat);
    const valid = new Uint8Array(nLat * nLat);
    for (let k = 0; k < valid.length; k++) {
        if (wts[k]! > 0) {
            nodeR[k] = accR[k]! / wts[k]!;
            nodeG[k] = accG[k]! / wts[k]!;
            nodeB[k] = accB[k]! / wts[k]!;
            valid[k] = 1;
        }
    }

    // §FORMA-HEATMAP-GAP-CLOSE (founder 2026-06-30) — fill EVERY in-disc hole node from
    // its nearest filled neighbour BEFORE the bilinear resample. Cells under a building
    // footprint are dropped upstream (`underBuilding → null`), so the lattice has a hole
    // under (and a transparent halo around) every footprint. The old bilinear reached
    // only ~1 cell into a hole, so footprint interiors + a ring around each building wall
    // rendered as UNCOLOURED white slivers where the wall meets the ground — worst at the
    // low fly-in angle. A breadth-first flood from the valid nodes carries the surrounding
    // colour CONTINUOUSLY under and right up to every footprint, so the heatmap reads as
    // unbroken ground with no white gap at any building base. Cheap: one pass over the
    // small lattice (≤ ~64² for cheap metrics; the sun-hours/daylight lattices are coarser
    // still). The round-disc cutout is applied later per-texel, so this never bleeds the
    // field outside the disc.
    {
        const filled = Uint8Array.from(valid);
        let queue: number[] = [];
        for (let k = 0; k < filled.length; k++) if (filled[k]) queue.push(k);
        // Guard against a wholly-empty lattice (no valid node at all) — nothing to flood.
        if (queue.length > 0 && queue.length < filled.length) {
            while (queue.length > 0) {
                const next: number[] = [];
                for (const k of queue) {
                    const gi = k % nLat, gj = (k / nLat) | 0;
                    const neigh = [
                        gi > 0 ? k - 1 : -1,
                        gi < nLat - 1 ? k + 1 : -1,
                        gj > 0 ? k - nLat : -1,
                        gj < nLat - 1 ? k + nLat : -1,
                    ];
                    for (const nk of neigh) {
                        if (nk < 0 || filled[nk]) continue;
                        nodeR[nk] = nodeR[k]!; nodeG[nk] = nodeG[k]!; nodeB[nk] = nodeB[k]!;
                        valid[nk] = 1; filled[nk] = 1;
                        next.push(nk);
                    }
                }
                queue = next;
            }
        }
    }

    const rgba = new Uint8ClampedArray(size * size * 4);
    for (let ty = 0; ty < size; ty++) {
        const north = R - ((ty + 0.5) / size) * (2 * R);   // row 0 = north edge
        for (let tx = 0; tx < size; tx++) {
            const east = -R + ((tx + 0.5) / size) * (2 * R);
            const o = (ty * size + tx) * 4;
            const dist = Math.hypot(east, north);
            if (dist > R) { rgba[o + 3] = 0; continue; }    // round cutout
            const fx = (east + R) / cs, fz = (north + R) / cs;
            const gi = Math.floor(fx), gj = Math.floor(fz);
            const sx = fx - gi, sz = fz - gj;
            let r = 0, g = 0, b = 0, wsum = 0;
            const corner = (ci: number, cj: number, w: number): void => {
                if (ci < 0 || cj < 0 || ci >= nLat || cj >= nLat) return;
                const k = at(ci, cj);
                if (!valid[k]) return;
                r += nodeR[k]! * w; g += nodeG[k]! * w; b += nodeB[k]! * w; wsum += w;
            };
            corner(gi, gj, (1 - sx) * (1 - sz));
            corner(gi + 1, gj, sx * (1 - sz));
            corner(gi, gj + 1, (1 - sx) * sz);
            corner(gi + 1, gj + 1, sx * sz);
            if (wsum <= 0) { rgba[o + 3] = 0; continue; }
            rgba[o] = Math.round(r / wsum);
            rgba[o + 1] = Math.round(g / wsum);
            rgba[o + 2] = Math.round(b / wsum);
            const edge = Math.max(0, Math.min(1, (R - dist) / (R * 0.02)));
            rgba[o + 3] = Math.round(METRIC_TEXTURE_ALPHA * 255 * edge);
        }
    }

    // §SITE-METRIC-TEXTURE span breadcrumb.
    try {
        console.debug(
            `[span][site-metric-texture] rasterised ${size}×${size} texels from ` +
            `${sampleCount}/${cells.length} cell(s); lattice ${nLat}×${nLat}, ` +
            `cell ${cs.toFixed(1)} m, radius ${R.toFixed(0)} m.`,
        );
    } catch { /* console unavailable (headless test) — best-effort */ }

    return { size, rgba, radiusM: R, sampleCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// §SITE-METRIC-DAYLIGHT-VSC (founder 2026-06-30) — Vertical Sky Component ground grid
// ─────────────────────────────────────────────────────────────────────────────
//
// VSC (Vertical Sky Component) is a standard daylight / right-to-light metric: the
// proportion of a uniform (CIE-overcast-style) sky hemisphere that is visible from a
// point on a façade, expressed as a percentage. Against a fully UNOBSTRUCTED vertical
// plane VSC ≈ 39.6 % (the textbook datum); a neighbour's massing that fills part of
// the sky lowers it. The BRE/right-to-light "rule of thumb" flags a window whose VSC
// drops below ~27 % (or to <0.8× its prior value) as materially affected.
//
// We compute a GROUND-CELL field (so it paints identically to the other side-3D
// metrics, which show no BIM mesh): per cell we stand a notional observer ~1.6 m up
// and sweep the sky hemisphere on an (azimuth × altitude) lattice; a sky patch counts
// as VISIBLE when the ray toward it clears every context-building prism. Each visible
// patch is weighted by sin(altitude)·cos(altitude) (the projected-solid-angle weight
// that yields the canonical unobstructed datum), and the result is reported as a
// percentage of the unobstructed total. PURE + deterministic — reuses the SAME
// extruded-footprint prisms + ray-march occlusion as the sun-hours pass (no THREE,
// P2-safe). The disc-wide field shows how the proposed massing + neighbours shade the
// sky for points across the site — the planning question VSC answers.

/** Canonical unobstructed VSC datum (%) — VSC against a clear vertical plane. The
 *  field is scaled so a fully open cell reads ≈ this value (textbook ≈ 39.6 %). */
const UNOBSTRUCTED_VSC_PCT = 39.6;
/** Observer height (m) for the sky sweep — eye/façade-mid datum, matches the BRE
 *  reference-point convention well enough for a planning heatmap. */
const VSC_OBSERVER_UP_M = 1.6;
/** Sky-hemisphere lattice resolution (azimuth × altitude sample counts). Kept modest
 *  so the per-cell cost (azSteps×altSteps ray-marches × prisms) stays chunkable. */
const VSC_AZ_STEPS = 24;
const VSC_ALT_STEPS = 9;

/**
 * §SITE-METRIC-DAYLIGHT-VSC — Vertical Sky Component (%) at one cell, given the
 * context prisms. Sweeps the upper sky hemisphere on a fixed (az × alt) lattice;
 * a patch is visible when the ray toward it (rising at `tan(alt)` per horizontal
 * metre) is not blocked by any prism. Each patch carries the projected weight
 * `sin(alt)·cos(alt)`, and the visible weight is normalised to the unobstructed
 * total then scaled to `UNOBSTRUCTED_VSC_PCT`. PURE + deterministic.
 *
 * Exported so the chunked driver + the unit test can call the exact per-cell math.
 */
export function verticalSkyComponentPct(
    e0: number, n0: number, up0: number,
    prisms: readonly Prism[],
): number {
    let visibleW = 0;
    let totalW = 0;
    for (let ai = 0; ai < VSC_ALT_STEPS; ai++) {
        // Sample altitude band centres in (0, 90°), avoiding the horizon (0) + zenith
        // (90°) singular weights. Projected weight sin·cos peaks near 45°.
        const alt = ((ai + 0.5) / VSC_ALT_STEPS) * (Math.PI / 2);
        const sa = Math.sin(alt), ca = Math.cos(alt);
        const w = sa * ca;                      // projected solid-angle weight
        const slope = ca > 1e-6 ? sa / ca : 1e6; // up per horizontal metre = tan(alt)
        for (let zi = 0; zi < VSC_AZ_STEPS; zi++) {
            const az = (zi / VSC_AZ_STEPS) * Math.PI * 2;
            totalW += w;
            const de = Math.sin(az), dn = Math.cos(az);  // horizontal unit (any 2π sweep)
            let blocked = false;
            for (const p of prisms) {
                if (rayBlockedByPrism(e0, n0, up0, de, dn, slope, p)) { blocked = true; break; }
            }
            if (!blocked) visibleW += w;
        }
    }
    if (totalW <= 0) return UNOBSTRUCTED_VSC_PCT;
    return (visibleW / totalW) * UNOBSTRUCTED_VSC_PCT;
}

/** VSC (%) → colour ramp. BRAND: warm-open (#6600FF-tinted bright) high sky → deep
 *  PRYZM-purple low sky, through white at the mid. White + #6600FF, no black. A low
 *  VSC (overshadowed) reads deep purple; a clear sky reads warm/bright. */
function vscCellColour(vscPct: number): string {
    // Normalise against the unobstructed datum so an open site spans the warm top.
    const t = Math.max(0, Math.min(1, vscPct / UNOBSTRUCTED_VSC_PCT));
    const stops: ReadonlyArray<readonly [number, number, number, number]> = [
        [0.00, 0x66, 0x00, 0xFF], // #6600FF — overshadowed (deep PRYZM purple)
        [0.45, 0xB7, 0x9B, 0xF6], // #B79BF6 — soft violet
        [0.72, 0xFF, 0xFF, 0xFF], // #FFFFFF — neutral (mid sky)
        [1.00, 0xF6, 0xC4, 0x45], // #F6C445 — open/bright sky (warm)
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
    return '#F6C445';
}

/** A grid cell awaiting VSC evaluation (centre + size, ENU XZ metres). */
export interface DaylightVscCell {
    readonly x: number;          // east
    readonly z: number;          // north
    readonly size: number;       // cell edge (m)
    readonly underBuilding: boolean;
}

/** A prepared VSC build: the cells + a pure per-cell evaluator + the float height the
 *  cells render at. The caller batches `evaluate` across frames (chunked, like sun). */
export interface DaylightVscGridPrep {
    readonly cells: ReadonlyArray<DaylightVscCell>;
    /** Evaluate ONE cell → its coloured `MetricGridCell`, or null to skip (under a
     *  building / outside the disc). Pure + deterministic; safe in any order. */
    readonly evaluate: (cell: DaylightVscCell) => MetricGridCell | null;
}

/**
 * §SITE-METRIC-DAYLIGHT-VSC — prepare a chunkable Vertical Sky Component ground grid.
 * Returns null when it can't be computed (no radius). The cheap work (grid + prisms)
 * is done ONCE; the heavy per-cell sky sweep lives in the returned `evaluate`, which
 * the editor calls in per-frame batches (progressive reveal) — the SAME pattern as
 * `prepareSunHoursGrid`. PURE.
 *
 * Span: §SITE-METRIC-DAYLIGHT-VSC — emits a single structured telemetry breadcrumb
 * (this transitional apps/editor/src/ui/climate zone has no L7 otel facade and the
 * GA otel-span gate scopes only the plugins handler dirs; the breadcrumb keeps the
 * function observable without a forbidden direct @opentelemetry import).
 */
export function prepareDaylightVscGrid(input: MetricGridInput): DaylightVscGridPrep | null {
    if (!(input.radius > 0)) return null;
    const up = input.heightAboveGround ?? 0.16;
    const { cellSize, maxCells } = resolveCellSize(
        input, defaultCellM('daylight'), siteMetricGridBudget('daylight').maxCells,
    );
    const { polys } = toObstacles(input.footprints);
    const cells = buildStreetGrid(discBoundary(input.radius), polys, {
        cellSize,
        margin: 0,
        maxCells: maxCells + 16,
    });
    if (cells.length === 0) return null;

    const prisms = toPrisms(input.footprints);
    const radius = input.radius;
    const observerUp = VSC_OBSERVER_UP_M;

    // §SITE-METRIC-DAYLIGHT-VSC span breadcrumb (see doc-comment above).
    try {
        console.debug(
            `[span][site-metric-daylight-vsc] prepared grid: ${cells.length} cell(s), ` +
            `${prisms.length} context prism(s), radius ${radius.toFixed(0)} m, ` +
            `cell ${cellSize.toFixed(1)} m, lattice ${VSC_AZ_STEPS}×${VSC_ALT_STEPS}.`,
        );
    } catch { /* console unavailable (headless test) — span is best-effort */ }

    const evaluate = (c: DaylightVscCell): MetricGridCell | null => {
        if (c.underBuilding) return null;                 // inside the mass — skip
        if (Math.hypot(c.x, c.z) > radius * 1.02) return null; // round Forma cutout
        const vscPct = verticalSkyComponentPct(c.x, c.z, observerUp, prisms);
        return {
            east: c.x, north: c.z, halfSize: c.size / 2, up,
            colorHex: vscCellColour(vscPct),
            value: vscPct,
        };
    };

    return {
        cells: cells.map((c) => ({ x: c.x, z: c.z, size: c.size, underBuilding: c.underBuilding })),
        evaluate,
    };
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
            // §ANALYSIS-REAL-POPULATION (ADR-0095) — real WorldPop persons/hectare when
            // available (title set by the panel caption); the ramp + unit are stable.
            return {
                title: 'Population density (WorldPop)',
                stops: ['#FFFFC8', '#FFB864', '#FF7832', '#B41E14'],
                lowLabel: 'Low',
                highLabel: 'High',
                unit: 'p/ha',
            };
        case 'sunHours':
            return {
                title: 'Sun hours',
                stops: ['#2C3E80', '#3FA796', '#F6C445', '#F4753A'],
                lowLabel: 'Shaded',
                highLabel: 'Sunny',
                unit: 'h',
            };
        case 'daylight':
            // §SITE-METRIC-DAYLIGHT-VSC — % of sky hemisphere visible (right-to-light
            // VSC). Deep PRYZM-purple (overshadowed) → white → warm (open sky); the
            // axis runs 0 → the unobstructed datum (≈ 40 %). White + #6600FF, no black.
            return {
                title: 'Daylight (VSC)',
                stops: ['#6600FF', '#B79BF6', '#FFFFFF', '#F6C445'],
                lowLabel: 'Overshadowed',
                highLabel: 'Open sky',
                unit: '%',
            };
        default:
            return null;
    }
}
