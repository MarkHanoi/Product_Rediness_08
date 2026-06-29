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

/** One-time log guard for the §perf cell-cap clamp. */
let cellCapClampLogged = false;

/** Resolve the target cell size (m), clamped UP so the grid never exceeds the hard
 *  cell cap (bounds work on a large disc). Logs once when it clamps. */
function resolveCellSize(input: MetricGridInput, defaultCellM: number): { cellSize: number; maxCells: number } {
    const maxCells = Math.max(64, input.maxCells ?? 6000);
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

/** Default target cell edge (m) per metric — sun-hours is the heaviest (raycast per
 *  cell × sun sample × prism) so it gets a slightly larger min cell. */
function defaultCellM(metric: SiteMetric): number {
    return metric === 'sunHours' ? 5 : 3.5;
}

/**
 * Build the coloured ground cells for a ground-grid metric (sun hours / temperature
 * / wind / population) in the site-ENU frame. Returns `[]` when the metric is not a
 * ground grid (daylight) or its required data is missing. PURE + deterministic.
 *
 * NOTE: for 'sunHours' this is the SYNCHRONOUS (whole-grid) build — fine for tests
 * and small discs. The editor uses the CHUNKED `prepareSunHoursGrid` driver for the
 * large interactive disc so the per-cell raycast never freezes the viewport.
 */
export function buildSiteMetricGrid(
    metric: SiteMetric,
    input: MetricGridInput,
): MetricGridCell[] {
    if (metric === 'daylight') return [];          // BIM-view only (per-room VSC)
    if (!(input.radius > 0)) return [];
    const up = input.heightAboveGround ?? 0.16;
    const { cellSize, maxCells } = resolveCellSize(input, defaultCellM(metric));
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
    const { cellSize, maxCells } = resolveCellSize(input, defaultCellM('sunHours'));
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

    const evaluate = (c: SunHoursCell): MetricGridCell | null => {
        if (c.underBuilding) return null;                 // inside the mass — skip
        // Skip cells outside the analysis disc (round Forma-style cutout).
        if (Math.hypot(c.x, c.z) > radius * 1.02) return null;
        let lit = 0;
        for (const s of samples) {
            if (!sunBlocked(c.x, c.z, sampleUp, s, prisms)) lit++;
        }
        const hours = lit * stepHours;
        return {
            east: c.x, north: c.z, halfSize: c.size / 2, up,
            colorHex: sunHoursCellColour(maxHours > 0 ? hours / maxHours : 0),
            value: hours,
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
