// CLIMATE-LIVE-DATA (Phase A · Sprint 2 follow-on) — Open-Meteo + PVGIS live,
// KEYLESS climate-normals adapter (PURE core).
//
// WHAT THIS IS
// ------------
// Given a site (lat, lon) + an INJECTED `fetch`-like function, this builds the
// 12 `NOAANormal` entries the climate substrate expects from FREE, NO-KEY data
// sources:
//
//   - PRIMARY — Open-Meteo Climate API (https://climate-api.open-meteo.com):
//       monthly-period DAILY series (temperature mean/min/max, wind speed +
//       dominant direction, shortwave radiation, relative humidity,
//       precipitation) over a climate-normals window, aggregated here to the
//       12 calendar months. No API key. Open-data (CC-BY-4.0 / non-commercial-
//       friendly attribution).
//   - SECONDARY — PVGIS MRcalc (https://re.jrc.ec.europa.eu, EU JRC):
//       monthly global horizontal irradiation `H(h)_m` (kWh/m²/month). Used to
//       REFINE the GHI magnitude when available; FORMA.5's sun is already
//       geometric (solarSample), so PVGIS is an additive magnitude, never a
//       hard dependency — a PVGIS failure leaves the Open-Meteo radiation in
//       place. (US sites: NREL NSRDB is the equivalent but needs a key, so it
//       is intentionally NOT wired here — keyless-only.)
//
// HEADLESS-SAFE / L2-PURE
// -----------------------
// This module performs NO network I/O on its own — exactly like the EPW
// parsers + bundledNormals. The caller injects `fetchImpl` (the L5 editor
// passes the browser `fetch`; tests pass a fixture stub). That keeps L2
// climate-host headless + deterministic and the test-suite network-free.
//
// FAILURE = null (→ bundled fallback)
// -----------------------------------
// On ANY fetch / parse / shape failure this returns `null`. The L5 wrapper maps
// `null → throw`, which `resolveNormals` catches and degrades to the bundled
// climate-zone templates per [C21 §7.4]. The adapter itself NEVER throws.
//
// References:
//   - docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md §1.2 + §7.4
//   - packages/climate-host/src/noaaNormalsReader.ts (the consumer)

import { NOAANormalSchema, type NOAANormal } from '@pryzm/schemas';
import type { LiveNormalsResult } from './noaaNormalsReader.js';

/** A minimal `fetch`-like contract (the subset we use). Injected by the
 *  caller so the core stays I/O-free + testable with a fixture stub. */
export type FetchLike = (
    url: string,
    init?: { signal?: AbortSignal },
) => Promise<{
    readonly ok: boolean;
    readonly status: number;
    json(): Promise<unknown>;
}>;

/** Options for the live adapter. */
export interface LiveNormalsAdapterOptions {
    /** Injected fetch (browser `fetch` in prod, fixture stub in tests). */
    readonly fetchImpl: FetchLike;
    /** Optional abort signal (timeout / unmount). */
    readonly signal?: AbortSignal;
    /** Climate-normals window start (YYYY-MM-DD). Default 1991-01-01. */
    readonly startDate?: string;
    /** Climate-normals window end (YYYY-MM-DD). Default 2020-12-31. */
    readonly endDate?: string;
    /** Skip the PVGIS irradiation refinement (Open-Meteo radiation only). */
    readonly skipPvgis?: boolean;
}

// ── Endpoints (keyless) ──────────────────────────────────────────────────────

/** Open-Meteo Climate API base. The browser must be allowed to reach this
 *  origin (`connect-src` in server/securityHeaders.js → buildConnectSrc). */
export const OPEN_METEO_CLIMATE_ENDPOINT =
    'https://climate-api.open-meteo.com/v1/climate';

/** PVGIS monthly-radiation (MRcalc) endpoint (EU JRC, keyless JSON). */
export const PVGIS_MRCALC_ENDPOINT =
    'https://re.jrc.ec.europa.eu/api/v5_2/MRcalc';

/** The two origins that must appear in the server CSP `connect-src`. */
export const OPEN_METEO_ORIGIN = 'https://climate-api.open-meteo.com';
export const PVGIS_ORIGIN = 'https://re.jrc.ec.europa.eu';

const VENDOR = 'Open-Meteo + PVGIS';
const DATASET_VERSION = 'open-meteo-climate-1991-2020';
const LICENSE = 'CC-BY-4.0';

// ── Open-Meteo daily field names (response.daily.<field>) ─────────────────────
const OM_DAILY = [
    'temperature_2m_mean',
    'temperature_2m_max',
    'temperature_2m_min',
    'relative_humidity_2m_mean',
    'precipitation_sum',
    'windspeed_10m_mean',
    'winddirection_10m_dominant',
    'shortwave_radiation_sum',
] as const;

interface OpenMeteoDaily {
    time?: unknown;
    temperature_2m_mean?: unknown;
    temperature_2m_max?: unknown;
    temperature_2m_min?: unknown;
    relative_humidity_2m_mean?: unknown;
    precipitation_sum?: unknown;
    windspeed_10m_mean?: unknown;
    winddirection_10m_dominant?: unknown;
    shortwave_radiation_sum?: unknown;
}

/** One month's running aggregation accumulator. */
interface MonthAgg {
    n: number;
    sumMean: number;
    sumMax: number;
    sumMin: number;
    sumRh: number;
    sumPrecip: number;
    sumWind: number;
    // Wind direction is averaged as a unit vector (circular mean).
    sumWindU: number;
    sumWindV: number;
    sumRadMjPerDay: number; // shortwave_radiation_sum is MJ/m²/day
    days: number;
}

function emptyMonth(): MonthAgg {
    return {
        n: 0, sumMean: 0, sumMax: 0, sumMin: 0, sumRh: 0, sumPrecip: 0,
        sumWind: 0, sumWindU: 0, sumWindV: 0, sumRadMjPerDay: 0, days: 0,
    };
}

function asNumberArray(v: unknown): number[] | null {
    if (!Array.isArray(v)) return null;
    const out: number[] = [];
    for (const x of v) {
        // Open-Meteo uses `null` for gaps — skip those by marking NaN.
        out.push(typeof x === 'number' ? x : Number.NaN);
    }
    return out;
}

/** Build the Open-Meteo Climate API request URL. */
export function buildOpenMeteoUrl(
    lat: number,
    lon: number,
    startDate = '1991-01-01',
    endDate = '2020-12-31',
): string {
    const q = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        start_date: startDate,
        end_date: endDate,
        // MRI-ESM2-0 is a stable downscaled model Open-Meteo serves keyless.
        models: 'MRI_AGCM3_2_S',
        daily: OM_DAILY.join(','),
        timezone: 'UTC',
    });
    return `${OPEN_METEO_CLIMATE_ENDPOINT}?${q.toString()}`;
}

/** Build the PVGIS MRcalc request URL (monthly horizontal irradiation). */
export function buildPvgisUrl(lat: number, lon: number): string {
    const q = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        horirrad: '1',
        outputformat: 'json',
    });
    return `${PVGIS_MRCALC_ENDPOINT}?${q.toString()}`;
}

/**
 * Aggregate an Open-Meteo daily response into the 12 monthly `NOAANormal`
 * skeletons (GHI may be refined by PVGIS afterwards). PURE.
 *
 * Returns `null` if the response shape is unusable.
 */
export function mapOpenMeteoToNormals(raw: unknown): NOAANormal[] | null {
    const daily = (raw as { daily?: OpenMeteoDaily } | null)?.daily;
    if (!daily || typeof daily !== 'object') return null;

    const time = daily.time;
    if (!Array.isArray(time) || time.length === 0) return null;

    const mean = asNumberArray(daily.temperature_2m_mean);
    const tmax = asNumberArray(daily.temperature_2m_max);
    const tmin = asNumberArray(daily.temperature_2m_min);
    const rh = asNumberArray(daily.relative_humidity_2m_mean);
    const precip = asNumberArray(daily.precipitation_sum);
    const wind = asNumberArray(daily.windspeed_10m_mean);
    const wdir = asNumberArray(daily.winddirection_10m_dominant);
    const rad = asNumberArray(daily.shortwave_radiation_sum);
    if (!mean || !tmax || !tmin) return null;

    const months: MonthAgg[] = Array.from({ length: 12 }, emptyMonth);

    for (let i = 0; i < time.length; i += 1) {
        const t = time[i];
        if (typeof t !== 'string' || t.length < 7) continue;
        // time is `YYYY-MM-DD`; month index 0..11.
        const monthNum = Number.parseInt(t.slice(5, 7), 10);
        if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) continue;
        const agg = months[monthNum - 1]!;

        const mv = mean[i];
        if (mv == null || Number.isNaN(mv)) continue;
        agg.n += 1;
        agg.sumMean += mv;
        agg.sumMax += safe(tmax[i], mv);
        agg.sumMin += safe(tmin[i], mv);
        agg.sumRh += safe(rh?.[i], 60);
        // precipitation_sum is per-day mm; accumulate the monthly total.
        agg.sumPrecip += safe(precip?.[i], 0);
        agg.days += 1;
        const w = safe(wind?.[i], 0);
        agg.sumWind += w;
        const dir = wdir?.[i];
        if (dir != null && !Number.isNaN(dir)) {
            const rads = (dir * Math.PI) / 180;
            agg.sumWindU += Math.sin(rads);
            agg.sumWindV += Math.cos(rads);
        }
        // shortwave_radiation_sum is MJ/m²/day.
        agg.sumRadMjPerDay += safe(rad?.[i], 0);
    }

    const out: NOAANormal[] = [];
    for (let m = 0; m < 12; m += 1) {
        const a = months[m]!;
        if (a.n === 0) return null; // a gap-free 12-month coverage is required
        const avgC = a.sumMean / a.n;
        const avgMaxC = a.sumMax / a.n;
        const avgMinC = a.sumMin / a.n;
        const rhPct = clamp(a.sumRh / a.n, 0, 100);
        // Monthly precipitation TOTAL ≈ mean-daily × days-in-month sampled.
        const precipMm = clamp(
            a.days > 0 ? (a.sumPrecip / a.days) * 30.4 : 0, 0, 20000,
        );
        const windMps = clamp(a.sumWind / a.n, 0, 90);
        // Circular mean direction (0=N, clockwise), normalised to [0,360].
        let dirDeg = (Math.atan2(a.sumWindU, a.sumWindV) * 180) / Math.PI;
        if (dirDeg < 0) dirDeg += 360;
        dirDeg = clamp(dirDeg, 0, 360);
        // MJ/m²/day → mean W/m²: × 1e6 / 86400.
        const ghiWm2 = clamp(
            (a.sumRadMjPerDay / a.n) * (1_000_000 / 86_400), 0, 1500,
        );
        // Degree-days base 18 °C from the monthly mean × days-in-month.
        const delta18 = 18 - avgC;
        const hdd = clamp(delta18 > 0 ? delta18 * 30.4 : 0, 0, 2000);
        const cdd = clamp(delta18 < 0 ? -delta18 * 30.4 : 0, 0, 2000);

        out.push({
            month: (m + 1) as NOAANormal['month'],
            avgDryBulbC: round1(avgC),
            avgMinDryBulbC: round1(avgMinC),
            avgMaxDryBulbC: round1(avgMaxC),
            avgRelHumidityPct: round1(rhPct),
            avgPrecipMm: round1(precipMm),
            avgWindSpeedMps: round1(windMps),
            prevailingWindDirDeg: round1(dirDeg),
            avgGlobalHorizontalWm2: round1(ghiWm2),
            heatingDegreeDaysBase18: round1(hdd),
            coolingDegreeDaysBase18: round1(cdd),
        });
    }
    return out;
}

/**
 * Extract 12 monthly GHI means (W/m²) from a PVGIS MRcalc JSON response.
 * `H(h)_m` is kWh/m²/MONTH → mean W/m² = kWh × 1000 / (hours in month).
 * Returns `null` on any shape failure (PVGIS refinement is optional).
 */
export function mapPvgisMonthlyGhi(raw: unknown): (number | null)[] | null {
    const monthly = (raw as { outputs?: { monthly?: unknown } } | null)
        ?.outputs?.monthly;
    if (!Array.isArray(monthly) || monthly.length === 0) return null;
    const byMonth: (number | null)[] = Array.from({ length: 12 }, () => null);
    const HOURS_PER_MONTH = 730.5; // 8766 / 12
    let any = false;
    for (const row of monthly) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const month = typeof r.month === 'number' ? r.month : Number(r.month);
        const kwh = r['H(h)_m'];
        if (
            Number.isFinite(month) && month >= 1 && month <= 12 &&
            typeof kwh === 'number' && Number.isFinite(kwh)
        ) {
            const wm2 = clamp((kwh * 1000) / HOURS_PER_MONTH, 0, 1500);
            byMonth[month - 1] = round1(wm2);
            any = true;
        }
    }
    return any ? byMonth : null;
}

/**
 * Fetch + map live keyless climate normals for a site. Returns a
 * `LiveNormalsResult` (12 normals + provenance) on success, or `null` on
 * ANY failure (caller degrades to bundled). NEVER throws.
 */
export async function fetchLiveNormals(
    lat: number,
    lon: number,
    opts: LiveNormalsAdapterOptions,
): Promise<LiveNormalsResult | null> {
    const { fetchImpl, signal } = opts;
    try {
        const url = buildOpenMeteoUrl(
            lat, lon, opts.startDate, opts.endDate,
        );
        const res = await fetchImpl(url, { signal });
        if (!res || !res.ok) return null;
        const json = await res.json();
        let normals = mapOpenMeteoToNormals(json);
        if (!normals) return null;

        // ── PVGIS refinement (optional, best-effort) ────────────────────
        if (!opts.skipPvgis) {
            try {
                const pres = await fetchImpl(buildPvgisUrl(lat, lon), { signal });
                if (pres && pres.ok) {
                    const ghi = mapPvgisMonthlyGhi(await pres.json());
                    if (ghi) {
                        normals = normals.map((n, i) =>
                            ghi[i] != null
                                ? { ...n, avgGlobalHorizontalWm2: ghi[i]! }
                                : n,
                        );
                    }
                }
            } catch {
                // PVGIS is additive — ignore its failure, keep Open-Meteo GHI.
            }
        }

        // Validate before handing back (defence-in-depth; the reader also
        // validates, but failing here returns null → clean bundled fallback).
        const parsed = NOAANormalSchema.array().length(12).safeParse(normals);
        if (!parsed.success) return null;

        return {
            monthlyNormals: parsed.data,
            vendor: VENDOR,
            datasetVersion: DATASET_VERSION,
            license: LICENSE,
        };
    } catch {
        return null;
    }
}

// ── helpers ───────────────────────────────────────────────────────────────────
function safe(v: number | null | undefined, fallback: number): number {
    return v != null && !Number.isNaN(v) ? v : fallback;
}
function clamp(x: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, x));
}
function round1(x: number): number {
    return Math.round(x * 10) / 10;
}
