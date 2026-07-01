// §ANALYSIS-REAL-POPULATION + §ANALYSIS-REAL-TEMPERATURE + §ANALYSIS-REAL-WIND
// (founder 2026-07-01, ADR-0095) — REAL free-dataset sources for the side-3D site
// analysis metrics, replacing the OSM/formula PROXIES the metrics used to invent.
//
// WHAT THIS IS
// ------------
// A thin, ASYNC, browser-side data service that fetches REAL climatology + gridded
// population for the site lat/lon from FREE, keyless, CORS-enabled public APIs, and
// caches them by rounded lat/lon so the analysis panel can seed the PURE
// `buildSiteMetricGrid` bridge with real base values instead of synthesised ones.
//
//   • TEMPERATURE + WIND → NASA POWER (https://power.larc.nasa.gov) — the free NASA
//     climatology REST API (no key, CORS-enabled). ONE request returns the long-term
//     monthly climatology of T2M (2 m air temp), WS10M (10 m wind speed) AND WD10M
//     (10 m wind direction) for a lat/lon. This gives the REAL site baseline air
//     temperature + REAL regional wind speed & prevailing direction. The built-density
//     UHI ΔT (temperature) and Lawson pedestrian shelter (wind) legitimately stay as
//     the SPATIAL modulation ON TOP of these real baselines — air temp / freestream
//     wind barely vary across a 240 m disc, so the modulation is the real spatial
//     signal, but the BASE value is now measured, not invented.
//   • POPULATION → WorldPop (https://www.worldpop.org) — free global 100 m gridded
//     population. We sample the site bbox via the WorldPop Global "pop density" REST
//     stats service to obtain REAL persons-per-hectare for the plot, so a dense
//     residential area reads high and an open monument/plaza reads honestly LOW
//     (unlike the OSM GFA footprint-density proxy, which reads a landmark's big
//     footprint as "busy").
//
// RESILIENCE (all sources): every fetch is guarded + non-fatal (a failure resolves a
// null/absent result, never throws), cached by rounded lat/lon (≈1 km) for the
// session, and de-duplicated by an in-flight promise map. On failure the caller keeps
// the metric in its clearly-labelled "estimate unavailable" state — it NEVER falls
// back to the removed synthetic radial gradient. See ADR-0095.
//
// CORS: NASA POWER + WorldPop both send permissive CORS headers, so these fetch
// directly from the browser (same pattern as the existing Open-Meteo climate HUD in
// `environment/climateData.ts`). No CF-worker proxy is required. Should a source ever
// tighten CORS, route it through the existing worker proxy the OSM/Overpass context
// fetchers use (grep `CF_WORKER_URL` / `contextBuildings.ts`); the shape here (one
// async fetch → cached scalar) makes that a one-line URL swap.
//
// Architecture: P2-safe (no THREE), P5-safe (no schema mutation), pure async I/O +
// scalar math. This module is DATA only; the PURE grid math stays in siteMetricGrids.

/** Round lat/lon to ~1 km for cache keys (and to avoid PII-grade precision). */
function cacheKey(lat: number, lon: number): string {
    return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// §ANALYSIS-REAL-TEMPERATURE + §ANALYSIS-REAL-WIND — NASA POWER climatology
// ─────────────────────────────────────────────────────────────────────────────

/** A REAL climate baseline for a site from NASA POWER (one request → temp + wind). */
export interface RealClimateBaseline {
    /** Annual-mean 2 m air temperature (°C) — the REAL baseline the UHI ΔT modulates. */
    readonly airTempC: number;
    /** Warm-season (3 hottest months) mean 2 m air temp (°C) — the summer baseline the
     *  temperature heatmap uses (matches the old `warmBaselineC` intent, but REAL). */
    readonly warmAirTempC: number;
    /** Annual-mean 10 m wind SPEED (m/s) — the REAL freestream the Lawson field starts
     *  from (instead of a synthesised regional-normals rose mean). */
    readonly windMeanMs: number;
    /** A representative peak/gust 10 m wind speed (m/s) — the windiest month's mean,
     *  used for the wind-rose p99/gust readout. */
    readonly windGustMs: number;
    /** Prevailing wind FROM-direction (deg, 0 = N clockwise) — the REAL prevailing
     *  direction (annual vector-mean of WD10M). */
    readonly windFromDeg: number;
    /** Site latitude/longitude the baseline was fetched for. */
    readonly lat: number;
    readonly lon: number;
    /** Provenance — 'nasa-power' when live data was fetched. */
    readonly source: 'nasa-power';
    /** Epoch ms when produced. */
    readonly fetchedAt: number;
}

interface PowerResponse {
    properties?: {
        parameter?: {
            T2M?: Record<string, number>;
            WS10M?: Record<string, number>;
            WD10M?: Record<string, number>;
        };
    };
}

/** NASA POWER fill value for a missing month (returned instead of null). */
const POWER_FILL = -999;

/** The 12 climatology month keys NASA POWER returns (JAN…DEC). The "ANN" key is the
 *  13th (annual mean) — we compute our own so we can also derive warm-season means. */
const POWER_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

/** Finite monthly values (drop the -999 fills + the ANN aggregate). */
function monthlyValues(rec: Record<string, number> | undefined): number[] {
    if (!rec) return [];
    const out: number[] = [];
    for (const m of POWER_MONTHS) {
        const v = rec[m];
        if (typeof v === 'number' && Number.isFinite(v) && v > POWER_FILL + 1) out.push(v);
    }
    return out;
}

const _climateCache = new Map<string, RealClimateBaseline | null>();
const _climateInflight = new Map<string, Promise<RealClimateBaseline | null>>();
const CLIMATE_TTL_MS = 12 * 60 * 60 * 1000; // climatology is stable — 12 h is ample
const _climateStampAt = new Map<string, number>();

/**
 * Fetch the REAL NASA POWER climate baseline (T2M + WS10M + WD10M climatology) for a
 * site. Cached by rounded lat/lon; de-duped by an in-flight promise. NON-FATAL: any
 * failure (offline, HTTP error, empty/fill payload) resolves `null` — the caller then
 * keeps the metric in its "estimate unavailable" state (NO synthetic fallback).
 *
 * ONE request returns temperature AND wind (speed + direction) so wind piggybacks on
 * the temperature call, per the founder's "request all needed parameters at once".
 */
export async function fetchRealClimateBaseline(
    lat: number,
    lon: number,
): Promise<RealClimateBaseline | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const key = cacheKey(lat, lon);
    const stamp = _climateStampAt.get(key);
    if (_climateCache.has(key) && stamp !== undefined && Date.now() - stamp < CLIMATE_TTL_MS) {
        return _climateCache.get(key) ?? null;
    }
    const existing = _climateInflight.get(key);
    if (existing) return existing;

    const p = (async (): Promise<RealClimateBaseline | null> => {
        try {
            // NASA POWER climatology REST — free, keyless, CORS-enabled. ONE request →
            // T2M (2 m air temp), WS10M (10 m wind speed), WD10M (10 m wind direction).
            const url =
                'https://power.larc.nasa.gov/api/temporal/climatology/point' +
                '?parameters=T2M,WS10M,WD10M' +
                '&community=RE' +
                `&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}` +
                '&format=JSON';
            const res = await fetch(url, { method: 'GET' });
            if (!res.ok) throw new Error(`NASA POWER HTTP ${res.status}`);
            const json = (await res.json()) as PowerResponse;
            const param = json.properties?.parameter;
            const t2m = monthlyValues(param?.T2M);
            const ws = monthlyValues(param?.WS10M);
            const wd = param?.WD10M;
            if (t2m.length === 0) throw new Error('NASA POWER: empty T2M payload');

            // Annual + warm-season (3 hottest months) air temp.
            const airTempC = t2m.reduce((a, v) => a + v, 0) / t2m.length;
            const hottest = [...t2m].sort((a, b) => b - a);
            const warmAirTempC = (hottest[0]! + (hottest[1] ?? hottest[0]!) + (hottest[2] ?? hottest[0]!)) / 3;

            // Wind speed: annual mean + windiest-month peak.
            const windMeanMs = ws.length > 0 ? ws.reduce((a, v) => a + v, 0) / ws.length : 4;
            const windGustMs = ws.length > 0 ? Math.max(...ws) * 1.6 : windMeanMs * 1.6;

            // Prevailing FROM-direction: vector-mean of the monthly WD10M (weighted by
            // that month's mean speed so the windier months dominate the prevailing).
            let sx = 0, sy = 0;
            if (wd) {
                for (let i = 0; i < POWER_MONTHS.length; i++) {
                    const dRaw = wd[POWER_MONTHS[i]!];
                    if (typeof dRaw !== 'number' || !Number.isFinite(dRaw) || dRaw <= POWER_FILL + 1) continue;
                    const w = ws[i] ?? windMeanMs;
                    const rad = (dRaw * Math.PI) / 180;
                    sx += w * Math.sin(rad);
                    sy += w * Math.cos(rad);
                }
            }
            const windFromDeg = (sx !== 0 || sy !== 0)
                ? ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360
                : 225; // SW default only if POWER returned no usable direction

            const out: RealClimateBaseline = {
                airTempC, warmAirTempC, windMeanMs, windGustMs, windFromDeg,
                lat, lon, source: 'nasa-power', fetchedAt: Date.now(),
            };
            _climateCache.set(key, out);
            _climateStampAt.set(key, Date.now());
            return out;
        } catch (e) {
            console.warn('[site-real-data] §ANALYSIS-REAL-TEMPERATURE/WIND NASA POWER fetch failed (non-fatal):', e);
            // Cache the null briefly so we don't hammer POWER on every repaint; a later
            // TTL expiry retries. The caller degrades honestly (no synthetic fallback).
            _climateCache.set(key, null);
            _climateStampAt.set(key, Date.now());
            return null;
        } finally {
            _climateInflight.delete(key);
        }
    })();

    _climateInflight.set(key, p);
    return p;
}

// ─────────────────────────────────────────────────────────────────────────────
// §ANALYSIS-REAL-POPULATION — WorldPop gridded population (persons/hectare)
// ─────────────────────────────────────────────────────────────────────────────

/** A REAL gridded-population sample for a site from WorldPop. */
export interface RealPopulationSample {
    /** Population density (persons per HECTARE) at the site — the REAL WorldPop areal
     *  density, so dense residential reads high + open/monument honestly low. */
    readonly personsPerHa: number;
    /** Site latitude/longitude the sample was taken for. */
    readonly lat: number;
    readonly lon: number;
    /** Provenance — 'worldpop' when live gridded data was sampled. */
    readonly source: 'worldpop';
    readonly fetchedAt: number;
}

interface WorldPopStatsResponse {
    /** WorldPop async-stats task id (the service is task-based). */
    taskid?: string;
    error?: string | boolean;
    status?: string;
    data?: {
        /** Total population summed over the requested polygon. */
        total_population?: number | string;
    };
}

const _popCache = new Map<string, RealPopulationSample | null>();
const _popInflight = new Map<string, Promise<RealPopulationSample | null>>();
const POP_TTL_MS = 24 * 60 * 60 * 1000; // population raster is annual — 24 h is ample
const _popStampAt = new Map<string, number>();

/** Build a small GeoJSON square (side ≈ `sideM` metres) about a lat/lon, for the
 *  WorldPop polygon-stats request. Degenerate-safe. */
function bboxSquareGeoJson(lat: number, lon: number, sideM: number): string {
    const half = Math.max(50, sideM) / 2;
    const dLat = half / 111_320;
    const dLon = half / (111_320 * Math.max(0.05, Math.cos((lat * Math.PI) / 180)));
    const ring = [
        [lon - dLon, lat - dLat],
        [lon + dLon, lat - dLat],
        [lon + dLon, lat + dLat],
        [lon - dLon, lat + dLat],
        [lon - dLon, lat - dLat],
    ];
    return JSON.stringify({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] } });
}

/** Poll a WorldPop async-stats task to completion (bounded). Returns the total pop or
 *  null on timeout/error. WorldPop returns a taskid, then a status endpoint reports
 *  'created' until the raster sum is ready. */
async function pollWorldPopTask(taskId: string, maxWaitMs = 12_000): Promise<number | null> {
    const started = Date.now();
    const statusUrl = `https://api.worldpop.org/v1/tasks/${encodeURIComponent(taskId)}`;
    // Small backoff loop; WorldPop sums a tiny polygon quickly.
    let delay = 700;
    while (Date.now() - started < maxWaitMs) {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(2000, delay + 400);
        try {
            const res = await fetch(statusUrl, { method: 'GET' });
            if (!res.ok) continue;
            const json = (await res.json()) as WorldPopStatsResponse;
            if (json.error) return null;
            if (json.status === 'finished' && json.data) {
                const total = Number(json.data.total_population);
                return Number.isFinite(total) ? total : null;
            }
        } catch {
            // transient — keep polling until the wall-clock budget elapses
        }
    }
    return null;
}

/**
 * Fetch a REAL WorldPop population sample (persons/hectare) for a site. Requests the
 * total population within a ~`sampleAreaM`-side square about the site from the WorldPop
 * global 100 m gridded raster (task-based stats API), then divides by the polygon area
 * (hectares) → persons/ha. Cached by rounded lat/lon; de-duped in-flight. NON-FATAL:
 * any failure resolves `null`, so the caller keeps population in its "estimate
 * unavailable" state (NO synthetic fallback).
 *
 * @param sampleAreaM  the analysis square side (m) — the site plot the density averages
 *                     over (default 300 m ≈ the analysis disc, one 100 m-grid neighbourhood).
 */
export async function fetchRealPopulationSample(
    lat: number,
    lon: number,
    sampleAreaM = 300,
): Promise<RealPopulationSample | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const key = cacheKey(lat, lon);
    const stamp = _popStampAt.get(key);
    if (_popCache.has(key) && stamp !== undefined && Date.now() - stamp < POP_TTL_MS) {
        return _popCache.get(key) ?? null;
    }
    const existing = _popInflight.get(key);
    if (existing) return existing;

    const p = (async (): Promise<RealPopulationSample | null> => {
        try {
            // WorldPop global "pop density" stats — free, keyless, CORS-enabled. The
            // 2020 constrained global 100 m raster ('wpgppop') summed over our polygon.
            const geojson = bboxSquareGeoJson(lat, lon, sampleAreaM);
            const url =
                'https://api.worldpop.org/v1/services/stats' +
                '?dataset=wpgppop&year=2020' +
                `&geojson=${encodeURIComponent(geojson)}`;
            const res = await fetch(url, { method: 'GET' });
            if (!res.ok) throw new Error(`WorldPop HTTP ${res.status}`);
            const json = (await res.json()) as WorldPopStatsResponse;

            let total: number | null = null;
            if (json.data && json.data.total_population !== undefined) {
                const t = Number(json.data.total_population);
                total = Number.isFinite(t) ? t : null;
            } else if (json.taskid) {
                total = await pollWorldPopTask(json.taskid);
            }
            if (total == null || !Number.isFinite(total)) {
                throw new Error('WorldPop: no total_population in response');
            }

            // persons / hectare = total persons ÷ polygon area in hectares.
            const side = Math.max(50, sampleAreaM);
            const areaHa = (side * side) / 10_000;
            const personsPerHa = Math.max(0, total / areaHa);

            const out: RealPopulationSample = {
                personsPerHa, lat, lon, source: 'worldpop', fetchedAt: Date.now(),
            };
            _popCache.set(key, out);
            _popStampAt.set(key, Date.now());
            return out;
        } catch (e) {
            console.warn('[site-real-data] §ANALYSIS-REAL-POPULATION WorldPop fetch failed (non-fatal):', e);
            _popCache.set(key, null);
            _popStampAt.set(key, Date.now());
            return null;
        } finally {
            _popInflight.delete(key);
        }
    })();

    _popInflight.set(key, p);
    return p;
}

/** Synchronous cache peek — returns the already-fetched climate baseline for a site
 *  (or null when not yet fetched / failed). Lets the PURE render path read a real base
 *  without awaiting; the async fetch + repaint fills it in. */
export function peekRealClimateBaseline(lat: number, lon: number): RealClimateBaseline | null {
    return _climateCache.get(cacheKey(lat, lon)) ?? null;
}

/** Synchronous cache peek for the WorldPop population sample (see above). */
export function peekRealPopulationSample(lat: number, lon: number): RealPopulationSample | null {
    return _popCache.get(cacheKey(lat, lon)) ?? null;
}
