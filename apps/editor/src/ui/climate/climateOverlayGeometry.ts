// climateOverlayGeometry.ts — A.21.D24 (Forma 3D climate-analysis overlays)
//
// PURE, DOM-free, THREE-free, Cesium-free geometry generators that turn the
// existing climate + solar substrate into 3D-placeable primitives for the
// Forma/Cesium site-analysis overlays:
//
//   - 3D sun-path arcs   → `sunArcEnuPoints()` / `sunArcHourMarkers()`
//                          (the sun's altitude/azimuth across a day, projected
//                          onto a dome of a given radius in the site's local
//                          ENU frame: east, north, up).
//   - 3D wind streaks     → `windStreakSegments()` (one radial streak per
//                          compass sector, length ∝ frequency, sitting just
//                          above the ground plane, pointing FROM the prevailing
//                          direction — the 3D analogue of the wind rose).
//   - wind streamlines    → `windStreamlinePaths()` (A.21.D35 — MANY smooth
//                          curved flow-lines seeded across the upwind edge and
//                          bent around the building mass; the Forma-style
//                          flowing wind field, stylised — not CFD).
//   - heat tint           → `heatTintColorHex()` (a single warm↔cool ground
//                          tint from the annual mean temperature).
//   - heat / comfort field → `heatFieldCells()` (A.21.D35 — a coarse grid of
//                          green→red ground cells from the warm-season normals +
//                          a solar-exposure proxy; the Forma-style comfort map).
//
// The Cesium rendering (entities, polylines, ENU→ECEF anchoring) lives in
// `CesiumViewport.ts`; this file has ZERO `document` / THREE / Cesium imports so
// it is unit-testable under plain `node` (mirrors `climateChartData.ts`).
//
// COORDINATE CONVENTION — every point returned here is in the site's local
// ENU frame in METRES: `{ east, north, up }`. CesiumViewport places them with
// the SAME single `eastNorthUpToFixedFrame` anchor used for the massing +
// context buildings (no parallel projector — SPEC-FORMA-SITE-VIEW §4 / §8.3).
//
// References:
//   - apps/editor/src/ui/climate/climateChartData.ts (the pure solar/wind data)
//   - docs/03-execution/specs/SPEC-FORMA-SITE-VIEW.md §6 (analysis overlays)

import type { ClimateDataset } from '@pryzm/schemas';
import {
    solarArcsForYear,
    monthlyTempSeries,
    type SunArc,
    type WindRoseChart,
} from './climateChartData.js';

/** A point in the site's local ENU frame, metres. */
export interface EnuPoint {
    readonly east: number;
    readonly north: number;
    readonly up: number;
}

/** One sun-path arc ready to draw as a 3D polyline (+ a legend label). */
export interface SunArcEnu {
    readonly label: string;
    readonly dateIso: string;
    /** The above-horizon arc points on the dome, in ENU metres. */
    readonly points: readonly EnuPoint[];
}

/** A labelled hour marker on a sun-path arc (placed on the dome). */
export interface SunHourMarker {
    readonly hourUtc: number;
    readonly point: EnuPoint;
}

/**
 * Project a single (altitude, azimuth) onto a dome of the given radius in the
 * site's local ENU frame. The sun direction (NOAA convention: azimuth
 * clockwise-from-North) maps to the unit vector
 *   east  = cos(alt)·sin(az)
 *   north = cos(alt)·cos(az)
 *   up    = sin(alt)
 * scaled by `radius`. Returns `null` for points at/below the horizon (they
 * fall outside the visible dome).
 */
export function sunDirToDomeEnu(
    altitudeRad: number,
    azimuthRad: number,
    radius: number,
): EnuPoint | null {
    if (altitudeRad <= 0) return null;
    const cosAlt = Math.cos(altitudeRad);
    return {
        east: radius * cosAlt * Math.sin(azimuthRad),
        north: radius * cosAlt * Math.cos(azimuthRad),
        up: radius * Math.sin(altitudeRad),
    };
}

/** Convert a pure `SunArc` (from climateChartData) into a 3D dome arc. The arc
 *  is clipped to the above-horizon portion (the visible part of the sky). */
export function sunArcToEnu(arc: SunArc, radius: number): SunArcEnu {
    const points: EnuPoint[] = [];
    for (const p of arc.points) {
        const e = sunDirToDomeEnu(p.altitudeRad, p.azimuthRad, radius);
        if (e) points.push(e);
    }
    return { label: arc.label, dateIso: arc.dateIso, points };
}

/**
 * The three canonical 3D solar arcs (summer solstice / equinox / winter
 * solstice) for a site, each as a dome polyline in ENU metres. `radius` sets
 * the dome size (≈ the plot half-extent works well). `stepMinutes` controls
 * arc resolution.
 */
export function sunArcEnuPoints(
    lat: number,
    lon: number,
    year: number,
    radius: number,
    stepMinutes = 15,
): SunArcEnu[] {
    return solarArcsForYear(lat, lon, year, stepMinutes).map((a) => sunArcToEnu(a, radius));
}

/**
 * Whole-hour markers on a single day's sun arc (the summer solstice by
 * default), for labelling the arc with "6h / 9h / 12h …" dome dots. Only
 * above-horizon hours are returned.
 */
export function sunArcHourMarkers(
    lat: number,
    lon: number,
    year: number,
    radius: number,
): SunHourMarker[] {
    // One marker per integer hour on the longest (summer) arc.
    const [summer] = solarArcsForYear(lat, lon, year, 60);
    if (!summer) return [];
    const markers: SunHourMarker[] = [];
    for (const p of summer.points) {
        const whole = Math.round(p.hourUtc);
        if (Math.abs(p.hourUtc - whole) > 1e-6) continue;
        const e = sunDirToDomeEnu(p.altitudeRad, p.azimuthRad, radius);
        if (e) markers.push({ hourUtc: whole, point: e });
    }
    return markers;
}

/** One 3D wind streak: a ground-plane segment from the rim toward the centre,
 *  plus the metadata needed to colour/scale it. */
export interface WindStreak {
    readonly sectorDeg: number;
    readonly label: string;
    /** [0,1] share of this sector relative to the strongest sector. */
    readonly frac: number;
    /** Mean speed band index 0..5 (calm→gust) for colouring. */
    readonly dominantBand: number;
    /** Outer (rim) end — where the wind comes FROM, in ENU metres. */
    readonly from: EnuPoint;
    /** Inner end — toward the site centre, in ENU metres. */
    readonly to: EnuPoint;
}

/**
 * Build one radial wind streak per non-empty compass sector from a
 * `WindRoseAggregate`. Each streak starts on a ring of radius `radius` in the
 * direction the wind blows FROM (NOAA wind-rose convention) and points inward
 * by a length proportional to that sector's frequency — so the longest streaks
 * mark the prevailing winds. Streaks sit at `up = heightAboveGround` so they
 * float just over the ground plane. Returns [] when the rose is all-zero.
 */
export function windStreakSegments(
    rose: WindRoseChart,
    radius: number,
    heightAboveGround = 1.0,
): WindStreak[] {
    if (rose.maxFrequency <= 0) return [];
    const streaks: WindStreak[] = [];
    for (const bar of rose.bars) {
        if (bar.frequency <= 0) continue;
        const frac = bar.frequency / rose.maxFrequency;
        const rad = (bar.sectorDeg * Math.PI) / 180;
        // Unit vector pointing FROM the prevailing direction (out to the rim).
        const ux = Math.sin(rad);   // east
        const uy = Math.cos(rad);   // north
        const from: EnuPoint = { east: ux * radius, north: uy * radius, up: heightAboveGround };
        // Inner end: pull toward centre by frac (longer = stronger). Keep a
        // minimum visible length so even weak sectors render a small streak.
        const innerR = radius * (1 - Math.max(0.12, frac));
        const to: EnuPoint = { east: ux * innerR, north: uy * innerR, up: heightAboveGround };
        streaks.push({
            sectorDeg: bar.sectorDeg,
            label: bar.label,
            frac,
            dominantBand: dominantSpeedBand(bar.speedBinHours),
            from,
            to,
        });
    }
    return streaks;
}

/** Index of the speed bin with the most hours (0..5), or 0 when all zero. */
export function dominantSpeedBand(speedBinHours: readonly number[]): number {
    let best = 0;
    let bestHours = -1;
    for (let i = 0; i < speedBinHours.length; i++) {
        const h = speedBinHours[i] ?? 0;
        if (h > bestHours) { bestHours = h; best = i; }
    }
    return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wind streamlines (A.21.D35 — Forma-quality flowing flow-field)
// ─────────────────────────────────────────────────────────────────────────────
//
// A STYLISED approximation of Forma's wind streamlines — NOT a CFD solve. We
// seed many start points along the upwind edge of the site (perpendicular to
// the prevailing direction), then integrate each one DOWNWIND across the plot
// as a smooth curved polyline, bending the local flow vector AROUND a circular
// proxy of the building mass (a potential-flow-style deflection, not pressure-
// accurate). The result reads as flowing lines threading between/around the
// building, coloured light→dark blue by the prevailing speed band. Streamline
// COUNT + per-direction weighting come from the wind-rose frequencies, so the
// densest flow comes from the prevailing wind(s).

/** One smooth wind streamline ready to draw as a 3D polyline. */
export interface WindStreamline {
    /** The prevailing source sector this line was seeded from (deg, 0 = N). */
    readonly sourceSectorDeg: number;
    /** Mean speed band index 0..5 (calm→gust) for colouring. */
    readonly band: number;
    /** [0,1] relative strength of the seeding sector (for width/alpha). */
    readonly strength: number;
    /** The polyline points, in ENU metres (downwind order). */
    readonly points: readonly EnuPoint[];
}

/** Options controlling streamline density / extent. All have sane defaults. */
export interface WindStreamlineOptions {
    /** Max streamlines across ALL contributing sectors (shared budget). */
    readonly maxLines?: number;
    /** Number of sectors (strongest first) that seed streamlines. */
    readonly sectorCount?: number;
    /** Integration step length (m). Smaller = smoother but more points. */
    readonly stepLength?: number;
    /** Radius (m) of the circular building proxy the flow bends around. 0 = none. */
    readonly obstacleRadius?: number;
    /** ENU offset of the building proxy centre (defaults to the site origin). */
    readonly obstacleCenter?: { east: number; north: number };
    /** Height above ground the streamlines float at (m). */
    readonly heightAboveGround?: number;
}

/**
 * Build many smooth wind streamlines across a site from a `WindRoseChart`.
 *
 * Algorithm (per contributing sector, strongest first):
 *  1. The wind blows FROM `sectorDeg`, so the flow DIRECTION across the site is
 *     `−(sin,cos)` of that bearing. Seeds are laid on a chord on the UPWIND
 *     side of the disc (facing the source), spread along the axis perpendicular
 *     to the flow.
 *  2. Each seed is integrated forward in fixed steps. At every step the base
 *     flow vector is perturbed by a deflection term that pushes the line
 *     tangentially AROUND the building proxy (strength ∝ (R/r)² near the proxy,
 *     vanishing far away) — a doublet/source-style read of "flow goes around
 *     the mass", not a real pressure field.
 *  3. Integration stops when the line leaves the disc or hits the proxy.
 *
 * Number of seeds per sector ∝ its rose frequency (prevailing winds get the
 * most lines), capped by `maxLines`. Returns [] for an all-zero rose. Pure +
 * deterministic (no randomness).
 */
export function windStreamlinePaths(
    rose: WindRoseChart,
    radius: number,
    opts: WindStreamlineOptions = {},
): WindStreamline[] {
    if (rose.maxFrequency <= 0 || radius <= 0) return [];
    const maxLines = Math.max(1, Math.floor(opts.maxLines ?? 28));
    const sectorCount = Math.max(1, Math.floor(opts.sectorCount ?? 4));
    const step = Math.max(0.5, opts.stepLength ?? radius / 28);
    const obstacleR = Math.max(0, opts.obstacleRadius ?? radius * 0.18);
    const ocx = opts.obstacleCenter?.east ?? 0;
    const ocy = opts.obstacleCenter?.north ?? 0;
    const up = opts.heightAboveGround ?? 2.0;
    const maxSteps = Math.ceil((4 * radius) / step) + 4;

    // Pick the strongest sectors (deterministic: by frequency desc, then deg asc).
    const active = [...rose.bars]
        .filter((b) => b.frequency > 0)
        .sort((a, b) => (b.frequency - a.frequency) || (a.sectorDeg - b.sectorDeg))
        .slice(0, sectorCount);
    if (active.length === 0) return [];

    const totalFreq = active.reduce((s, b) => s + b.frequency, 0) || 1;
    const lines: WindStreamline[] = [];

    for (const bar of active) {
        const frac = bar.frequency / rose.maxFrequency;
        // Share of the line budget for this sector (≥1 line if it's active).
        const share = Math.max(1, Math.round((bar.frequency / totalFreq) * maxLines));
        const rad = (bar.sectorDeg * Math.PI) / 180;
        // Unit vector pointing FROM the source (toward the upwind rim).
        const fx = Math.sin(rad);
        const fy = Math.cos(rad);
        // Flow direction across the site = downwind = −from.
        const dx = -fx;
        const dy = -fy;
        // Perpendicular (in-plane) axis to spread seeds along the upwind chord.
        const px = -fy;
        const py = fx;
        const band = dominantSpeedBand(bar.speedBinHours);

        for (let i = 0; i < share; i++) {
            // Spread seeds across the upwind chord in [-0.85R, +0.85R].
            const t = share === 1 ? 0 : (i / (share - 1)) * 2 - 1; // [-1,1]
            const offset = t * radius * 0.85;
            // Seed sits on the upwind rim (toward the source) + lateral offset.
            const sx = fx * radius * 0.98 + px * offset;
            const sy = fy * radius * 0.98 + py * offset;
            const pts = integrateStreamline(
                sx, sy, dx, dy, ocx, ocy, obstacleR, radius, step, maxSteps, up,
            );
            if (pts.length >= 2) {
                lines.push({ sourceSectorDeg: bar.sectorDeg, band, strength: frac, points: pts });
            }
        }
    }
    return lines;
}

/** Integrate one streamline downwind from a seed, deflecting around the proxy.
 *  Returns the polyline (ENU metres) — empty/short if it never advances. */
function integrateStreamline(
    sx: number, sy: number,
    dx: number, dy: number,
    ocx: number, ocy: number,
    obstacleR: number,
    discR: number,
    step: number,
    maxSteps: number,
    up: number,
): EnuPoint[] {
    const pts: EnuPoint[] = [];
    let x = sx;
    let y = sy;
    // Sign of the tangential deflection: push to whichever side the seed is on,
    // so seeds on opposite flanks bend around opposite sides of the building.
    const crossSeed = sx * dy - sy * dx; // >0 = left of the flow line through centre
    const sideSign = crossSeed >= 0 ? 1 : -1;
    // The "no-go" core the recorded polyline must never enter (the building mass).
    const core = obstacleR * 0.9;
    for (let s = 0; s < maxSteps; s++) {
        // Record the current position only if it's clear of the building core —
        // the deflection below normally keeps it clear, but guard the invariant
        // so a recorded vertex never lands inside the mass.
        if (obstacleR > 0) {
            const rNow = Math.hypot(x - ocx, y - ocy);
            if (rNow < core) break; // ran into the building → stop the line
        }
        pts.push({ east: x, north: y, up });
        // Base flow.
        let vx = dx;
        let vy = dy;
        // Deflection around the circular proxy: a tangential push that grows
        // near the obstacle (∝ (R/r)²) and fades far away. Direction is the
        // in-plane perpendicular to the radial-from-obstacle vector.
        if (obstacleR > 0) {
            const rx = x - ocx;
            const ry = y - ocy;
            const r = Math.hypot(rx, ry) || 1e-6;
            const influence = (obstacleR / r) * (obstacleR / r);
            if (influence > 1e-3) {
                // Tangent (perpendicular to radial), oriented by the seed's side.
                const tx = (-ry / r) * sideSign;
                const ty = (rx / r) * sideSign;
                // Also a small radial outward push so lines don't dive inward.
                const outx = rx / r;
                const outy = ry / r;
                const k = Math.min(2.5, influence) * 1.4;
                vx += (tx + outx * 0.5) * k;
                vy += (ty + outy * 0.5) * k;
            }
        }
        const vlen = Math.hypot(vx, vy) || 1;
        x += (vx / vlen) * step;
        y += (vy / vlen) * step;
        // Stop once the line leaves the analysis disc.
        if (Math.hypot(x, y) > discR * 1.02) {
            pts.push({ east: x, north: y, up });
            break;
        }
    }
    return pts;
}

/**
 * A simple ground heat tint from the annual mean temperature: cool blue for
 * cold climates → warm orange/red for hot ones. Returns a hex string. The
 * mapping is a piecewise lerp across 0°C (cold) → 14°C (temperate) → 28°C
 * (hot), clamped at both ends. This is a deliberately COARSE comfort cue from
 * the monthly normals — NOT a microclimate simulation (see SPEC §6 follow-up).
 */
export function heatTintColorHex(dataset: ClimateDataset): string {
    const series = monthlyTempSeries(dataset);
    const n = series.points.length || 1;
    let sum = 0;
    for (const p of series.points) sum += p.avgC;
    const meanC = sum / n;
    return tempToHex(meanC);
}

/** Cold(#3a6fd6) → temperate(#8fcaa8) → warm(#e8923a) → hot(#d6402a) lerp. */
export function tempToHex(c: number): string {
    const stops: Array<{ t: number; rgb: [number, number, number] }> = [
        { t: -5, rgb: [0x2f, 0x55, 0xc8] },
        { t: 8, rgb: [0x6f, 0xc0, 0xd6] },
        { t: 16, rgb: [0x9c, 0xd6, 0x8f] },
        { t: 24, rgb: [0xe8, 0x92, 0x3a] },
        { t: 32, rgb: [0xd6, 0x40, 0x2a] },
    ];
    if (c <= stops[0]!.t) return rgbHex(stops[0]!.rgb);
    if (c >= stops[stops.length - 1]!.t) return rgbHex(stops[stops.length - 1]!.rgb);
    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i]!;
        const b = stops[i + 1]!;
        if (c >= a.t && c <= b.t) {
            const f = (c - a.t) / (b.t - a.t || 1);
            return rgbHex([
                Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f),
                Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f),
                Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f),
            ]);
        }
    }
    return rgbHex(stops[0]!.rgb);
}

// ─────────────────────────────────────────────────────────────────────────────
// Heat / comfort ground field (A.21.D35)
// ─────────────────────────────────────────────────────────────────────────────
//
// A coarse grid of coloured ground cells around the plot — green (comfortable)
// → yellow → orange → red (hot / exposed) — replacing the single flat tint.
// The base warmth comes from the climate normals (warm-season mean temp); the
// per-cell variation is a STYLISED solar-exposure proxy: cells on the equator-
// facing / sunny side of the building and away from its shadow read hotter,
// cells tucked behind the mass (self-shaded, sheltered) read cooler. This is a
// comfort *cue*, NOT a microclimate sim.

/** One coloured ground cell of the heat/comfort field. */
export interface HeatFieldCell {
    /** Cell centre, ENU metres (up = the float height above ground). */
    readonly center: EnuPoint;
    /** Cell half-size (m) — cells are square; width = 2·halfSize. */
    readonly halfSize: number;
    /** Comfort score [0,1]: 0 = comfortable (green), 1 = hot/exposed (red). */
    readonly score: number;
    /** Resolved colour hex (green→yellow→orange→red ramp). */
    readonly colorHex: string;
}

/** Options for the heat field. */
export interface HeatFieldOptions {
    /** Cells per side of the square grid (default 12 → up to 144 cells). */
    readonly gridCount?: number;
    /** Radius (m) of the building proxy that casts the "cool/shaded" region. */
    readonly obstacleRadius?: number;
    /** ENU centre of the building proxy (defaults to origin). */
    readonly obstacleCenter?: { east: number; north: number };
    /** Bearing (deg, 0 = N) the sun comes FROM at peak — the hot side. Defaults
     *  to South (180) in the N-hemisphere convention. */
    readonly sunBearingDeg?: number;
    /** Height above ground the field floats at (m). */
    readonly heightAboveGround?: number;
}

/**
 * Build a grid of coloured ground cells expressing a comfort/heat field around
 * the site. The annual *warm-season* mean temperature sets the BASE score
 * (cool climate → mostly green; hot climate → biased warm); each cell then
 * adds a solar-exposure term (cells on the sun-facing side, in the open) and
 * subtracts a shelter term (cells behind / inside the building shadow). The
 * score is clamped to [0,1] and mapped onto a green→red ramp.
 *
 * Pure + deterministic. Returns [] when the dataset has no usable normals.
 */
export function heatFieldCells(
    dataset: ClimateDataset,
    radius: number,
    opts: HeatFieldOptions = {},
): HeatFieldCell[] {
    if (radius <= 0) return [];
    // No usable climate normals → no comfort reading (neutral / empty overlay).
    if (!dataset.monthlyNormals || dataset.monthlyNormals.length === 0) return [];
    const series = monthlyTempSeries(dataset);
    if (series.points.length === 0) return [];
    // Warm-season mean = mean of the 3 hottest months' avg (a hot-stress proxy).
    const avgs = series.points.map((p) => p.avgC).sort((a, b) => b - a);
    const warmMean = (avgs[0]! + (avgs[1] ?? avgs[0]!) + (avgs[2] ?? avgs[0]!)) / 3;
    // Base score: map warm-season mean across 10°C (cool) → 32°C (hot stress).
    const base = clamp01((warmMean - 10) / (32 - 10));

    const gridCount = Math.max(2, Math.floor(opts.gridCount ?? 12));
    const obstacleR = Math.max(0, opts.obstacleRadius ?? radius * 0.18);
    const ocx = opts.obstacleCenter?.east ?? 0;
    const ocy = opts.obstacleCenter?.north ?? 0;
    const up = opts.heightAboveGround ?? 0.15;
    const sunRad = ((opts.sunBearingDeg ?? 180) * Math.PI) / 180;
    // Unit vector pointing TOWARD the sun (the hot direction) from the bearing.
    const sunx = Math.sin(sunRad);
    const suny = Math.cos(sunRad);

    const extent = radius; // grid spans [-R, +R] in both axes.
    const cellSize = (2 * extent) / gridCount;
    const half = cellSize / 2;
    const cells: HeatFieldCell[] = [];

    for (let j = 0; j < gridCount; j++) {
        for (let i = 0; i < gridCount; i++) {
            const cx = -extent + half + i * cellSize;
            const cy = -extent + half + j * cellSize;
            const dist = Math.hypot(cx, cy);
            // Round plot: skip cells well outside the analysis disc.
            if (dist > radius * 1.001) continue;

            const rx = cx - ocx;
            const ry = cy - ocy;
            const r = Math.hypot(rx, ry) || 1e-6;

            // Inside the building footprint → no comfort reading (skip).
            if (obstacleR > 0 && r < obstacleR) continue;

            let score = base;
            if (obstacleR > 0) {
                // Sun-side exposure: cells on the sun-facing side, in the open,
                // get hotter (+). dot of (cell-from-obstacle dir) with sun dir.
                const dot = (rx / r) * sunx + (ry / r) * suny;
                // Falloff with distance from the building (near = strongest cue).
                const near = clamp01(1 - (r - obstacleR) / (radius - obstacleR || 1));
                score += dot * 0.28 * near;
                // Shelter / shadow on the FAR side from the sun (−).
                if (dot < 0) score -= -dot * 0.22 * near;
            }
            // Edge of the disc reads slightly cooler (more open, less radiated).
            score -= clamp01(dist / radius) * 0.06;

            score = clamp01(score);
            cells.push({
                center: { east: cx, north: cy, up },
                halfSize: half,
                score,
                colorHex: comfortToHex(score),
            });
        }
    }
    return cells;
}

/** Comfort ramp: 0 = green (comfortable) → 0.5 = yellow/orange → 1 = red (hot). */
export function comfortToHex(score: number): string {
    const s = clamp01(score);
    const stops: Array<{ t: number; rgb: [number, number, number] }> = [
        { t: 0.0, rgb: [0x3f, 0xb5, 0x50] }, // green
        { t: 0.4, rgb: [0xc9, 0xd8, 0x3a] }, // yellow-green
        { t: 0.65, rgb: [0xf2, 0xb0, 0x33] }, // orange
        { t: 0.85, rgb: [0xe8, 0x6a, 0x24] }, // deep orange
        { t: 1.0, rgb: [0xd6, 0x33, 0x2a] }, // red
    ];
    if (s <= stops[0]!.t) return rgbHex(stops[0]!.rgb);
    if (s >= stops[stops.length - 1]!.t) return rgbHex(stops[stops.length - 1]!.rgb);
    for (let i = 0; i < stops.length - 1; i++) {
        const a = stops[i]!;
        const b = stops[i + 1]!;
        if (s >= a.t && s <= b.t) {
            const f = (s - a.t) / (b.t - a.t || 1);
            return rgbHex([
                Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f),
                Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f),
                Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f),
            ]);
        }
    }
    return rgbHex(stops[stops.length - 1]!.rgb);
}

function clamp01(x: number): number {
    return x < 0 ? 0 : x > 1 ? 1 : x;
}

function rgbHex([r, g, b]: [number, number, number]): string {
    const h = (n: number) => n.toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}
