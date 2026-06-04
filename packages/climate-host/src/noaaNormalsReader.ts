// A.10.c / A.10.d (Phase A · Sprint 2) — NOAA normals reader (guarded) +
// in-memory cache.
//
// Produces the 12 monthly `NOAANormal` entries for a site (lat, lon),
// preferring a LIVE fetch when one is wired and falling back to the
// bundled offline templates (`bundledNormals.ts`) otherwise. The result
// is cached in-memory keyed on quantised lat/lon so repeat resolves for
// the same site (or a nearby one) are instant.
//
// DESIGN — why the fetch is INJECTED, never hard-wired:
//   - L2 climate-host is pure-by-contract; it must remain headless-safe
//     and never perform network I/O on its own. The optional live path
//     is supplied by the caller (the L5 editor adapter, which owns the
//     auth + networking substrate per [C21 §6]).
//   - In tests + offline/headless runtimes no `fetchImpl` is provided, so
//     `resolveNormals` deterministically returns the bundled dataset.
//
// Per [C21 §7.4] a live fetch failure (network / rate-limit / parse) is
// caught and degrades to bundled — it NEVER throws to the caller.
//
// References:
//   - docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md §1.2 + §7.4
//   - docs/03-execution/plans/master-execution-tracker.md A.10.c + A.10.d

import { NOAANormalSchema, type NOAANormal } from '@pryzm/schemas';
import {
    bundledMonthlyNormals,
    BUNDLED_NORMALS_VERSION,
} from './bundledNormals.js';

/** Which tier produced the resolved normals. */
export type NormalsTier = 'noaa-normals' | 'bundled';

/** The resolved 12-month normals + how they were obtained. */
export interface ResolvedNormals {
    readonly monthlyNormals: readonly NOAANormal[];
    /** `noaa-normals` when a live fetch succeeded, else `bundled`. */
    readonly tier: NormalsTier;
    /** Vendor string for provenance. */
    readonly vendor: string;
    /** Dataset-version string for provenance + cache keying. */
    readonly datasetVersion: string;
    /** SPDX-ish license string. */
    readonly license: string;
    /** True when this answer came from the in-memory cache. */
    readonly cacheHit: boolean;
}

/**
 * A live fetch MAY report its own provenance (vendor / dataset-version /
 * license) alongside the 12 normals — used by non-NOAA live providers
 * (e.g. Open-Meteo + PVGIS, CLIMATE-LIVE-DATA) so the resolved tier stays
 * honest about WHO produced the data even though the SOURCE tier remains
 * the generic `noaa-normals` "live" tier per [C21 §1.2].
 */
export interface LiveNormalsResult {
    readonly monthlyNormals: readonly NOAANormal[];
    readonly vendor?: string;
    readonly datasetVersion?: string;
    readonly license?: string;
}

/**
 * The shape a live fetch implementation must satisfy. The L5 adapter
 * wires this; it MAY hit the NOAA NCEI API, Open-Meteo, PVGIS, or any
 * provider and MUST resolve to either 12 `NOAANormal` entries OR a
 * `LiveNormalsResult` (12 normals + provenance) OR reject. A rejection
 * (or any thrown error) is caught here and degrades to bundled per
 * [C21 §7.4].
 */
export type NoaaFetchImpl = (
    lat: number,
    lon: number,
) => Promise<readonly NOAANormal[] | LiveNormalsResult>;

/** Options for `resolveNormals`. */
export interface ResolveNormalsOptions {
    /** Optional live fetch. Absent → bundled offline default. */
    readonly fetchImpl?: NoaaFetchImpl;
    /** Skip the in-memory cache (force a fresh resolve). Default false. */
    readonly bypassCache?: boolean;
}

// ── In-memory cache ──────────────────────────────────────────────────────────
//
// Keyed on quantised lat/lon (~1 km grid, mirroring the ClimateStore
// cache-key quantisation per [C21 §1.4]) + the tier that produced the
// entry, so a later live fetch can supersede a bundled cache entry.

const _cache = new Map<string, ResolvedNormals>();

function cacheKey(lat: number, lon: number): string {
    // Quantise to 0.01° (~1.1 km) — same granularity as the store cache.
    const qLat = Math.round(lat * 100);
    const qLon = Math.round(lon * 100);
    return `${qLat}:${qLon}`;
}

/** Clear the in-memory normals cache (test hygiene + project-switch). */
export function clearNormalsCache(): void {
    _cache.clear();
}

/** Current number of cached normals entries (tests + diagnostics). */
export function normalsCacheSize(): number {
    return _cache.size;
}

/**
 * Resolve the 12 monthly normals for a site.
 *
 *   1. Cache hit (unless bypassed) → return instantly with `cacheHit: true`.
 *   2. A wired `fetchImpl` → try the live fetch; on success validate the
 *      12 entries (Zod) and cache as the `noaa-normals` tier.
 *   3. Any failure / no `fetchImpl` → bundled offline default
 *      (`bundled` tier).
 *
 * NEVER throws — the bundled path is always available.
 */
export async function resolveNormals(
    lat: number,
    lon: number,
    opts: ResolveNormalsOptions = {},
): Promise<ResolvedNormals> {
    const key = cacheKey(lat, lon);
    if (!opts.bypassCache) {
        const hit = _cache.get(key);
        if (hit) return { ...hit, cacheHit: true };
    }

    // ── Live fetch (guarded) ────────────────────────────────────────────
    if (opts.fetchImpl) {
        try {
            const raw = await opts.fetchImpl(lat, lon);
            // The fetch may return a bare NOAANormal[] (legacy NOAA shape) OR a
            // LiveNormalsResult that carries its own provenance (Open-Meteo /
            // PVGIS via the CLIMATE-LIVE-DATA adapter). Normalise both.
            const isRich =
                !Array.isArray(raw) &&
                typeof raw === 'object' &&
                raw !== null &&
                'monthlyNormals' in raw;
            const rich = isRich ? (raw as LiveNormalsResult) : undefined;
            const rawNormals = rich ? rich.monthlyNormals : raw;
            const parsed = NOAANormalSchema.array().length(12).parse(rawNormals);
            const resolved: ResolvedNormals = {
                monthlyNormals: parsed,
                tier: 'noaa-normals',
                vendor: rich?.vendor ?? 'NOAA NCEI',
                datasetVersion: rich?.datasetVersion ?? 'noaa-normals-1991-2020',
                license: rich?.license ?? 'public-domain',
                cacheHit: false,
            };
            _cache.set(key, resolved);
            return resolved;
        } catch (err) {
            // Per [C21 §7.4] — degrade to bundled; never throw upstream.
            console.warn(
                '[climate-host] NOAA normals fetch failed; using bundled fallback:',
                (err as Error)?.message ?? err,
            );
        }
    }

    // ── Bundled offline default ─────────────────────────────────────────
    const bundled = bundledMonthlyNormals(lat, lon);
    const resolved: ResolvedNormals = {
        monthlyNormals: bundled.monthlyNormals,
        tier: 'bundled',
        vendor: 'PRYZM-builtin',
        datasetVersion: BUNDLED_NORMALS_VERSION,
        license: 'CC0-1.0',
        cacheHit: false,
    };
    _cache.set(key, resolved);
    return resolved;
}
