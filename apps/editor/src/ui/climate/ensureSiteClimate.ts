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
import { getCurrentSiteOrigin } from '../site/siteDispatch.js';

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
    // §CESIUM-SITE-ORIGIN — same null-location timing gap that broke the Forma
    // camera + massing: the onboarding handoff can set the LTP-ENU origin BEFORE
    // siteModelStore.getLocation() returns a non-zero location, so the climate
    // card mounts with no location and never ingests (looks "not wired"). Fall
    // back to the process-wide site origin so climate always resolves at the real
    // plot. (Mirrors CesiumViewport.readSiteLocation + GISAreaLayout.getFormaOrigin.)
    if (!loc || (loc.latitude === 0 && loc.longitude === 0)) {
        const ltp = getCurrentSiteOrigin();
        if (ltp && (ltp.lat !== 0 || ltp.lon !== 0)) {
            loc = { ...(loc ?? {}), latitude: ltp.lat, longitude: ltp.lon } as typeof loc;
            console.log(`[ensureSiteClimate] location resolved from LTP-ENU fallback → LAT ${ltp.lat} LON ${ltp.lon}.`);
        }
    }
    if (!site || !loc) return false;

    const commonPayload = {
        siteId: site.id,
        lat: loc.latitude,
        lon: loc.longitude,
        elevationM: loc.elevationAsl ?? 0,
        timezone: resolveTimezone(loc.longitude),
    };

    // ── Stage 1 — GUARANTEE a dataset INSTANTLY: the bundled regional default ──
    // §A.10.g (2026-06-05, founder: "default Spain/France/UK dataset" / "NO DATASET").
    // BUNDLED-FIRST. `resolveNormals` AWAITS the live Open-Meteo/PVGIS fetch FIRST
    // when a fetchImpl is passed; that fetch has no hard timeout and can be blocked
    // by CSP/network, so the climate card sat on "NO DATASET" forever waiting for a
    // fetch that never settled. Ingesting the bundled climate-zone default first
    // (NO network) means the wind rose + temperature ALWAYS populate the moment a
    // location is set — offline, instantly. Live measured data then upgrades it.
    let presentOk = false;
    try {
        const bundled = await climateEnsureForLocation(
            { ...commonPayload, skipIfPresent: true },
            { store: runtime.climateStore, fetchImpl: undefined }, // bundled only
        );
        presentOk = bundled.ok;
        if (bundled.ok && !bundled.event.skipped) {
            console.log(
                `[ensureSiteClimate] bundled regional default ingested for site ` +
                `${String(site.id)} (instant, offline — climate card populated).`,
            );
        }
    } catch (e) {
        console.warn('[ensureSiteClimate] bundled ingest threw:', e);
    }

    // ── Stage 2 — upgrade to LIVE measured normals in the BACKGROUND ───────────
    // Best-effort; never blocks the caller or throws. On success it overwrites the
    // bundled dataset with the better `noaa-normals` tier and the store.subscribe()
    // refresh repaints the climate card; on failure/timeout the bundled default is
    // kept. Skipped when the caller opted out (`fetchImpl: null`).
    if (opts.fetchImpl !== null) {
        const liveFetch = opts.fetchImpl ?? makeLiveClimateFetch();
        if (liveFetch) {
            void (async () => {
                try {
                    const live = await climateEnsureForLocation(
                        { ...commonPayload, skipIfPresent: false },
                        { store: runtime.climateStore, fetchImpl: liveFetch },
                    );
                    if (live.ok && !live.event.skipped && live.event.source === 'noaa-normals') {
                        console.log(`[ensureSiteClimate] upgraded to live measured normals for site ${String(site.id)}.`);
                    }
                } catch (e) {
                    console.warn('[ensureSiteClimate] live upgrade failed (bundled default kept):', e);
                }
            })();
        }
    }

    return presentOk;
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
