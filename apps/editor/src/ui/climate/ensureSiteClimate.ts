/**
 * ensureSiteClimate.ts — A.10.f (Phase A · Sprint 2)
 *
 * L5 climate-ingestion adapter. The thin editor-side glue that makes the
 * FORMA.5 climate card + ClimatePanel show REAL data: it reads the site
 * location from `runtime.siteModelStore.getLocation()` and runs the L3
 * `climateEnsureForLocation` command so `runtime.climateStore.resolveSite`
 * returns a populated `ClimateDataset`.
 *
 * OFFLINE-FIRST (per C21 §1.2): no `fetchImpl` is wired here yet, so the
 * pure L2 BUNDLED climate-zone normals are used (the `fallback-defaults`
 * tier) — real, plausible monthly temperatures + wind rose for any
 * lat/lon, WITHOUT a network call or an API key. When a live NOAA NCEI
 * client is added later it is injected as `deps.fetchImpl` and the same
 * pipeline upgrades the tier to `noaa-normals` transparently.
 *
 * Idempotent + cheap: the command skips when a dataset already exists for
 * the site (`skipIfPresent`), and the L2 normals resolver caches by
 * quantised lat/lon — so calling this on every Forma-view mount is fine.
 *
 * GRACEFUL: a missing runtime / store / location degrades to a quiet
 * no-op; it never throws into the caller.
 *
 * References:
 *   - docs/02-decisions/contracts/C21-CLIMATE-INGESTION.md §1.2 + §4.1 + §6
 *   - docs/03-execution/plans/master-execution-tracker.md A.10.f
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { NoaaFetchImpl } from '@pryzm/climate-host';
import { climateEnsureForLocation } from '@pryzm/stores';
import { makeLiveClimateFetch } from './liveClimateFetch.js';

/** Options for `ensureSiteClimate`. */
export interface EnsureSiteClimateOptions {
    /**
     * The live normals fetch to inject. Defaults to the keyless Open-Meteo +
     * PVGIS adapter (`makeLiveClimateFetch()`), which uses the browser
     * `fetch`. Pass `null` to force the bundled offline default (e.g. a
     * privacy-sensitive deployment), or a stub in tests.
     */
    readonly fetchImpl?: NoaaFetchImpl | null;
}

/**
 * Ensure the active site has a resolved ClimateDataset. Returns `true`
 * when a dataset is present afterwards (whether newly ingested or already
 * there), `false` when nothing could be ingested (no site / no location).
 *
 * ONLINE → live Open-Meteo + PVGIS normals (tier `noaa-normals`).
 * OFFLINE / failure → bundled climate-zone templates (`fallback-defaults`).
 * The downgrade is transparent + never throws into the caller.
 */
export async function ensureSiteClimate(
    runtime: PryzmRuntime | null,
    opts: EnsureSiteClimateOptions = {},
): Promise<boolean> {
    if (!runtime) return false;
    let site;
    let loc;
    try {
        site = runtime.siteModelStore.getSite();
        loc = runtime.siteModelStore.getLocation();
    } catch (e) {
        console.warn('[ensureSiteClimate] reading site/location failed:', e);
        return false;
    }
    if (!site || !loc) return false;

    // Live keyless fetch (Open-Meteo + PVGIS) unless the caller opts out.
    // `undefined` (no global fetch / opted out) → bundled offline default.
    const fetchImpl =
        opts.fetchImpl === null
            ? undefined
            : (opts.fetchImpl ?? makeLiveClimateFetch());

    try {
        const result = await climateEnsureForLocation(
            {
                siteId: site.id,
                lat: loc.latitude,
                lon: loc.longitude,
                elevationM: loc.elevationAsl ?? 0,
                timezone: resolveTimezone(loc.longitude),
                skipIfPresent: true,
            },
            {
                store: runtime.climateStore,
                // ONLINE → live Open-Meteo + PVGIS (tier noaa-normals);
                // failure / offline → bundled (fallback-defaults), C21 §7.4.
                fetchImpl,
            },
        );
        if (!result.ok) {
            console.warn('[ensureSiteClimate] ingest rejected:', result.message);
            return false;
        }
        if (!result.event.skipped) {
            console.log(
                `[ensureSiteClimate] climate ingested for site ${String(site.id)} ` +
                `(source=${result.event.source}).`,
            );
        }
        return true;
    } catch (e) {
        console.warn('[ensureSiteClimate] climateEnsureForLocation threw:', e);
        return false;
    }
}

/**
 * Best-effort IANA timezone from longitude alone (15° per hour → a
 * `Etc/GMT±N` zone). Good enough for the climate card's provenance + the
 * schema's `timezone: string` field; the precise zone arrives with a real
 * tz-lookup service later. NOTE: `Etc/GMT` signs are INVERTED by POSIX
 * convention (east of UTC → `Etc/GMT-N`).
 */
function resolveTimezone(lon: number): string {
    const offset = Math.round(lon / 15);
    if (offset === 0) return 'UTC';
    // POSIX-inverted sign: positive longitude (east) → GMT-offset.
    const sign = offset > 0 ? '-' : '+';
    return `Etc/GMT${sign}${Math.abs(offset)}`;
}
