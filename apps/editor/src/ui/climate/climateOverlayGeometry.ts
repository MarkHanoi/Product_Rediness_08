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
//   - heat tint           → `heatTintColorHex()` (a single warm↔cool ground
//                          tint from the annual mean temperature).
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

function rgbHex([r, g, b]: [number, number, number]): string {
    const h = (n: number) => n.toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}
