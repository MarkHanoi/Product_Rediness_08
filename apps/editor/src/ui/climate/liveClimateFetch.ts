// CLIMATE-LIVE-DATA (Phase A · Sprint 2 follow-on) — L5 live-climate fetch wiring.
//
// WHAT THIS IS
// ------------
// The thin editor-side glue that turns the PURE L2 `fetchLiveNormals` adapter
// (Open-Meteo + PVGIS, keyless) into the `NoaaFetchImpl` that
// `climateEnsureForLocation` / `resolveNormals` expect. It injects the browser
// `fetch` (the L2 core takes NO network dependency itself) and maps the
// adapter's `null`-on-failure into a thrown error so the reader's existing
// degrade-to-bundled path fires unchanged (per C21 §7.4).
//
// ONLINE  → live Open-Meteo monthly temp + wind rose, PVGIS-refined GHI
//           (tier `noaa-normals`, vendor `Open-Meteo + PVGIS`).
// OFFLINE / failure / rate-limit → throw → reader → BUNDLED climate-zone
//           templates (tier `fallback-defaults`). No data is ever "missing".
//
// CSP — the browser fetches two NEW origins, so the server CSP `connect-src`
// must allow them (server/securityHeaders.js → buildConnectSrc):
//   - https://climate-api.open-meteo.com   (OPEN_METEO_ORIGIN)
//   - https://re.jrc.ec.europa.eu          (PVGIS_ORIGIN)
// Both added in this change. In dev the CSP is report-only so a missing origin
// only logs; in prod it would block the fetch and silently fall back to bundled.
//
// References:
//   - packages/climate-host/src/liveNormalsAdapter.ts (the pure core)
//   - apps/editor/src/ui/climate/ensureSiteClimate.ts (the consumer)

import {
    fetchLiveNormals,
    OPEN_METEO_ORIGIN,
    PVGIS_ORIGIN,
    type FetchLike,
    type LiveNormalsResult,
    type NoaaFetchImpl,
} from '@pryzm/climate-host';

/** The two origins the live climate fetch needs in the CSP `connect-src`.
 *  Re-exported so the wiring is discoverable + the build report can cite it. */
export const LIVE_CLIMATE_ORIGINS = [OPEN_METEO_ORIGIN, PVGIS_ORIGIN] as const;

/**
 * Build a `NoaaFetchImpl` backed by the live keyless Open-Meteo + PVGIS
 * adapter. Returns `undefined` when no `fetch` is available (non-browser /
 * headless), so callers can pass it straight through and get the bundled
 * default without a guard.
 *
 * @param fetchImpl  override for tests; defaults to the global `fetch`.
 */
export function makeLiveClimateFetch(
    fetchImpl: FetchLike | undefined = resolveGlobalFetch(),
): NoaaFetchImpl | undefined {
    if (!fetchImpl) return undefined;
    return async (lat: number, lon: number): Promise<LiveNormalsResult> => {
        // §A.10.g — bound the live fetch so a CSP-blocked / stalled Open-Meteo /
        // PVGIS request can't hang forever. On timeout we reject → resolveNormals
        // degrades to bundled (C21 §7.4). (The bundled default is already ingested
        // bundled-first, so this only governs the optional live UPGRADE.)
        const LIVE_TIMEOUT_MS = 8000;
        const result = await Promise.race([
            fetchLiveNormals(lat, lon, { fetchImpl }),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('[liveClimateFetch] live climate fetch timed out (8s) — using bundled')), LIVE_TIMEOUT_MS),
            ),
        ]);
        if (!result) {
            // null = adapter could not produce 12 valid normals. Throw so
            // resolveNormals catches it and degrades to bundled (C21 §7.4).
            throw new Error(
                '[liveClimateFetch] live climate unavailable — using bundled',
            );
        }
        return result;
    };
}

/** The global `fetch` typed as our minimal `FetchLike`, or undefined when
 *  none exists (SSR / Node without fetch / headless test default). */
function resolveGlobalFetch(): FetchLike | undefined {
    const f = (globalThis as { fetch?: unknown }).fetch;
    return typeof f === 'function' ? (f as unknown as FetchLike) : undefined;
}
