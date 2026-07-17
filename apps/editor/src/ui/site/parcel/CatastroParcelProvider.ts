// L-380 P0 — Spain (Catastro) adapter of the provider-agnostic Parcel Data Layer.
//
// Turns a WGS84 map click into the REAL cadastral parcel from Spain's Dirección
// General del Catastro, via the SAME-ORIGIN server proxy (server/parcelZoningProxy.js
// → /api/catastro/parcel). The proxy owns the two keyless upstream calls (OVC
// reverse-geocode → referencia catastral, then INSPIRE WFS GetParcel → GML) and
// normalises GML → a plain WGS84 lat/lon ring, so this client adapter is a thin,
// testable fetch+parse of that same-origin JSON — no CORS, no CSP change.
//
// PURE (no THREE / Cesium / DOM). Mirrors geocodeAddress.ts: resolves to null on any
// failure and NEVER throws — the map UI decides how to surface "no parcel here".

import { trace } from '@opentelemetry/api';
import type { LatLon } from '../boundaryProjection.js';
import type { ParcelFeature, ParcelProvider } from './ParcelProvider.js';

const _tracer = trace.getTracer('pryzm.parcel');

/** The same-origin proxy route. Env-overridable for a self-hosted/alt deployment,
 *  mirroring geocodeAddress's `VITE_GEOCODE_ENDPOINT` pattern. */
export const CATASTRO_PARCEL_ENDPOINT =
    (import.meta.env.VITE_CATASTRO_PARCEL_ENDPOINT as string | undefined) ??
    '/api/catastro/parcel';

/** The raw JSON row the proxy returns (only the fields we read). */
interface ProxyParcel {
    readonly ring?: unknown;
    readonly refcat?: unknown;
    readonly areaM2?: unknown;
    readonly address?: unknown;
    readonly source?: unknown;
}

function toFiniteNum(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const n = Number.parseFloat(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/** Parse the proxy's ring array into a validated LatLon[] (drops bad vertices). */
function parseRing(raw: unknown): LatLon[] {
    if (!Array.isArray(raw)) return [];
    const ring: LatLon[] = [];
    for (const p of raw) {
        if (!p || typeof p !== 'object') continue;
        const lat = toFiniteNum((p as { lat?: unknown }).lat);
        const lon = toFiniteNum((p as { lon?: unknown }).lon);
        if (lat === null || lon === null) continue;
        ring.push({ lat, lon });
    }
    return ring;
}

/**
 * Normalise a proxy `{ parcel }` payload into a `ParcelFeature`, or null when the
 * response is a miss (`{ parcel: null }`) or malformed / has < 3 valid vertices.
 * Exported for unit testing the parse in isolation from `fetch`.
 */
export function parseProxyResponse(json: unknown): ParcelFeature | null {
    if (!json || typeof json !== 'object') return null;
    const parcel = (json as { parcel?: unknown }).parcel as ProxyParcel | null | undefined;
    if (!parcel || typeof parcel !== 'object') return null;

    const ring = parseRing(parcel.ring);
    if (ring.length < 3) return null;

    const refcat = typeof parcel.refcat === 'string' ? parcel.refcat : '';
    if (refcat.length === 0) return null;

    const areaM2 = toFiniteNum(parcel.areaM2) ?? 0;
    const address =
        typeof parcel.address === 'string' && parcel.address.length > 0 ? parcel.address : null;
    const source = typeof parcel.source === 'string' && parcel.source.length > 0 ? parcel.source : 'catastro';

    return { ring, refcat, areaM2, address, source };
}

/**
 * The Spain (Catastro) parcel provider. `fetchParcelAtPoint` GETs the same-origin
 * proxy for the parcel under a WGS84 point. Resolves to null on empty query,
 * network error, non-OK, non-JSON, or a miss — never throws (P8 OTel span opened).
 */
export const catastroParcelProvider: ParcelProvider = {
    id: 'catastro',
    label: 'Catastro (Spain)',

    async fetchParcelAtPoint(lon: number, lat: number): Promise<ParcelFeature | null> {
        const span = _tracer.startSpan('pryzm.parcel.fetchParcelAtPoint');
        span.setAttribute('pryzm.parcel.provider', 'catastro');
        try {
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
                span.setAttribute('pryzm.parcel.hit', false);
                return null;
            }
            span.setAttribute('pryzm.parcel.lon', lon);
            span.setAttribute('pryzm.parcel.lat', lat);

            const url =
                `${CATASTRO_PARCEL_ENDPOINT}?lon=${encodeURIComponent(String(lon))}` +
                `&lat=${encodeURIComponent(String(lat))}`;

            let res: Response;
            try {
                res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
            } catch (err) {
                console.warn('[gis] catastro: network error', err);
                span.setAttribute('pryzm.parcel.hit', false);
                return null;
            }
            if (!res.ok) {
                console.warn('[gis] catastro: proxy returned', res.status, res.statusText);
                span.setAttribute('pryzm.parcel.hit', false);
                return null;
            }

            let json: unknown;
            try {
                json = await res.json();
            } catch (err) {
                console.warn('[gis] catastro: response was not JSON', err);
                span.setAttribute('pryzm.parcel.hit', false);
                return null;
            }

            const parcel = parseProxyResponse(json);
            span.setAttribute('pryzm.parcel.hit', parcel !== null);
            if (parcel) {
                span.setAttribute('pryzm.parcel.refcat', parcel.refcat);
                span.setAttribute('pryzm.parcel.areaM2', parcel.areaM2);
                console.log(
                    `[gis] catastro: parcel ${parcel.refcat} (~${parcel.areaM2.toFixed(0)} m², ${parcel.ring.length} pts)` +
                    (parcel.address ? ` @ ${parcel.address}` : ''),
                );
            } else {
                console.log(`[gis] catastro: no parcel at ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
            }
            return parcel;
        } finally {
            span.end();
        }
    },
};
