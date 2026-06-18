/**
 * @file apps/editor/src/ui/environment/climateData.ts
 *
 * §CLIMATE-GIS-PHASE1 — REAL climate-data service for the Environment HUD.
 *
 * Replaces the meaningless slider-driven tint with REAL temperature + wind for
 * the project's site lat/lon, fetched from Open-Meteo (https://open-meteo.com) —
 * FREE, no API key, CORS-enabled. Heat + wind come from Open-Meteo; SUN comes
 * from the existing THREE-free NOAA solar-position math (@pryzm/solar-analysis)
 * via a sunrise→sunset day-length estimate; population stays a model slider
 * (clearly labelled) until the WorldPop/GHSL ingestion lands (see the plan doc
 * docs/03_PRYZM3/CLIMATE-GIS-OVERLAY-PLAN-2026-06-18.md).
 *
 * Architecture:
 *   • P2 (single THREE owner) — this file imports NO THREE. It uses only `fetch`
 *     + the pure L2 `@pryzm/solar-analysis` math (which is itself THREE-free).
 *   • P3 (single rAF) — no animation here; pure async data + sync math.
 *   • Site lat/lon comes from the SAME source the sun-hours + daylight consoles
 *     use (`getCurrentSiteOrigin()` in ui/site/siteDispatch), so the readouts are
 *     anchored to the real pinned plot.
 *   • Degrades gracefully offline: a fetch failure / no-location returns a
 *     `source: 'demo'` snapshot so the HUD still renders (clearly labelled).
 *
 * Caching: results are cached by rounded lat/lon (2 dp ≈ ~1 km) for the session
 * so HUD refreshes don't hammer the API.
 */

import { computeSolarPositionRad } from '@pryzm/solar-analysis';
import { getCurrentSiteOrigin } from '../site/siteDispatch.js';

/** Where a value came from — drives the HUD label ("real" vs "demo"). */
export type ClimateSource = 'open-meteo' | 'demo';

/** A real (or demo-fallback) climate snapshot for a site. */
export interface ClimateSnapshot {
    /** Air temperature at 2 m, °C. */
    temperatureC: number;
    /** Wind speed at 10 m, km/h. */
    windSpeedKmh: number;
    /** Wind direction (° from, meteorological — where the wind blows FROM). */
    windDirectionDeg: number;
    /** Daylight hours today (sunrise → sunset), real NOAA day-length. */
    sunHours: number;
    /** Site latitude used (decimal degrees). */
    lat: number;
    /** Site longitude used (decimal degrees). */
    lon: number;
    /** 'open-meteo' when live data was fetched; 'demo' when offline / no site. */
    source: ClimateSource;
    /** Epoch ms when this snapshot was produced. */
    fetchedAt: number;
}

/** A demo (no-data) snapshot built around a neutral baseline. */
function demoSnapshot(lat: number, lon: number): ClimateSnapshot {
    const sunHours = Number.isFinite(lat) ? estimateSunHours(lat, lon, new Date()) : 8;
    return {
        temperatureC: 20,
        windSpeedKmh: 11,
        windDirectionDeg: 315, // NW
        sunHours,
        lat,
        lon,
        source: 'demo',
        fetchedAt: Date.now(),
    };
}

// ── Site location ────────────────────────────────────────────────────────────

/**
 * Resolve the site lat/lon for climate, mirroring sunHoursConsole/daylightConsole.
 * Returns null when no REAL site is pinned (a 0/0 placeholder is treated as none).
 */
export function resolveClimateLatLon(): { lat: number; lon: number } | null {
    try {
        const origin = getCurrentSiteOrigin();
        if (origin && Number.isFinite(origin.lat) && (origin.lat !== 0 || origin.lon !== 0)) {
            return { lat: origin.lat, lon: origin.lon };
        }
    } catch { /* fall through */ }
    return null;
}

// ── Real sun-hours (THREE-free NOAA day-length) ──────────────────────────────

/**
 * Estimate today's daylight hours (sunrise → sunset) at a site by sampling the
 * NOAA solar altitude every 10 minutes across the UTC day and counting the time
 * the sun is above the horizon. Pure + THREE-free (reuses @pryzm/solar-analysis).
 *
 * This is the lightweight "real sun" readout for the HUD; the heavier
 * per-surface sun-hours heatmap (pryzmComputeSunHours) needs a built model.
 */
export function estimateSunHours(lat: number, lon: number, date: Date): number {
    const stepMin = 10;
    const base = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
    let aboveSamples = 0;
    const total = (24 * 60) / stepMin;
    for (let i = 0; i < total; i++) {
        const t = new Date(base.getTime() + i * stepMin * 60_000);
        const { altitude } = computeSolarPositionRad(lat, lon, t);
        if (altitude > 0) aboveSamples++;
    }
    return Number(((aboveSamples * stepMin) / 60).toFixed(1));
}

/**
 * The compass azimuth (° clockwise from N) the building's sunniest façade should
 * face — the solar azimuth at local solar noon (the sun's highest point today).
 * Used for the "(S-facing)" hint in the HUD readout.
 */
export function noonSunAzimuthDeg(lat: number, lon: number, date: Date): number {
    // Local solar noon ≈ 12:00 - lon/15 in UTC hours.
    const noonUtcHours = ((12 - lon / 15) % 24 + 24) % 24;
    const h = Math.floor(noonUtcHours);
    const m = Math.round((noonUtcHours - h) * 60);
    const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h, m, 0, 0));
    const { azimuth } = computeSolarPositionRad(lat, lon, t);
    return ((azimuth * 180) / Math.PI + 360) % 360;
}

// ── Open-Meteo fetch (heat + wind) ───────────────────────────────────────────

interface OpenMeteoResponse {
    hourly?: {
        time?: string[];
        temperature_2m?: number[];
        wind_speed_10m?: number[];
        wind_direction_10m?: number[];
    };
}

/** Round lat/lon to ~1 km for cache keys (and to avoid PII-grade precision). */
function cacheKey(lat: number, lon: number): string {
    return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

const _cache = new Map<string, ClimateSnapshot>();
const _inflight = new Map<string, Promise<ClimateSnapshot>>();

/** Cache TTL — climate doesn't change minute-to-minute; 30 min is plenty. */
const CACHE_TTL_MS = 30 * 60 * 1000;

/** Pick the hourly index nearest to "now" (Open-Meteo returns whole-day hourly). */
function nearestHourIndex(times: string[] | undefined, now: Date): number {
    if (!times || times.length === 0) return 0;
    const nowMs = now.getTime();
    let best = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < times.length; i++) {
        const ms = Date.parse(times[i]!);
        if (!Number.isFinite(ms)) continue;
        const d = Math.abs(ms - nowMs);
        if (d < bestDelta) { bestDelta = d; best = i; }
    }
    return best;
}

/**
 * Fetch the REAL climate snapshot for a site. Resolves the site lat/lon itself
 * (or accepts an explicit override). Caches by rounded lat/lon. On ANY failure
 * (offline, no site, bad response) it resolves a `source: 'demo'` snapshot so the
 * HUD always has something coherent to show.
 */
export async function fetchClimateSnapshot(
    override?: { lat: number; lon: number },
): Promise<ClimateSnapshot> {
    const loc = override ?? resolveClimateLatLon();
    if (!loc) {
        // No real site pinned — demo around a neutral lat so sun-hours is plausible.
        return demoSnapshot(51.5, -0.12);
    }
    const { lat, lon } = loc;
    const key = cacheKey(lat, lon);

    const cached = _cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached;

    const existing = _inflight.get(key);
    if (existing) return existing;

    const p = (async (): Promise<ClimateSnapshot> => {
        try {
            const url =
                'https://api.open-meteo.com/v1/forecast' +
                `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
                '&hourly=temperature_2m,wind_speed_10m,wind_direction_10m' +
                '&wind_speed_unit=kmh&timezone=UTC&forecast_days=1';
            const res = await fetch(url, { method: 'GET' });
            if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
            const json = (await res.json()) as OpenMeteoResponse;
            const h = json.hourly;
            if (!h || !h.temperature_2m || h.temperature_2m.length === 0) {
                throw new Error('Open-Meteo: empty hourly payload');
            }
            const now = new Date();
            const idx = nearestHourIndex(h.time, now);
            const temperatureC = num(h.temperature_2m[idx], 20);
            const windSpeedKmh = num(h.wind_speed_10m?.[idx], 11);
            const windDirectionDeg = num(h.wind_direction_10m?.[idx], 315);
            const sunHours = estimateSunHours(lat, lon, now);

            const snap: ClimateSnapshot = {
                temperatureC,
                windSpeedKmh,
                windDirectionDeg,
                sunHours,
                lat,
                lon,
                source: 'open-meteo',
                fetchedAt: Date.now(),
            };
            _cache.set(key, snap);
            return snap;
        } catch (e) {
            console.warn('[climate] §CLIMATE-GIS-PHASE1 Open-Meteo fetch failed — demo fallback:', e);
            const snap = demoSnapshot(lat, lon);
            // Cache the demo briefly too so we don't retry on every HUD render.
            _cache.set(key, snap);
            return snap;
        } finally {
            _inflight.delete(key);
        }
    })();

    _inflight.set(key, p);
    return p;
}

function num(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Compass abbreviation (8-point) for a meteorological "from" direction. */
export function compass8(deg: number): string {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
    return dirs[i]!;
}
