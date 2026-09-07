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
import { computeParcelMetrics, computeParcelConfidence } from './parcelConfidence.js';

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
    // §L-640 Phase 1 — the split areas + click→parcel signals (absent on older proxy builds → null).
    readonly areaOfficialM2?: unknown;
    readonly areaSigM2?: unknown;
    readonly pointToParcelM?: unknown;
    readonly candidateMarginM?: unknown;
    // §L-12893 — the OVC `loine` municipality identity of the CHOSEN candidate (absent on older
    // proxy builds → null): `<cp>` province + `<cm>` municipality-within-province, composing to
    // the INE code (the municipality test of record — `murciaBbox.ts` / `composeIneCode`).
    readonly cp?: unknown;
    readonly cm?: unknown;
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

    // §L-640 Phase 1 — pure geometry diagnostics + honesty-gated cadastral confidence. Catastro is a
    // real cadastre → kind 'cadastral'. `areaOfficialM2` is null when Catastro did not publish
    // `areaValue`; `pointToParcelM` is the OVC `_Distancia` click→parcel distance (null on older proxy).
    const metrics = computeParcelMetrics(ring);
    const confidence = computeParcelConfidence({
        ring,
        kind: 'cadastral',
        areaOfficialM2: toFiniteNum(parcel.areaOfficialM2),
        areaSigM2: metrics.areaSigM2,
        pointToParcelM: toFiniteNum(parcel.pointToParcelM),
        candidateMarginM: toFiniteNum(parcel.candidateMarginM),
    });

    // §L-12893 — forward the parcel's own municipality identity (OVC `loine` cp/cm) so municipal
    // routing can decide by INE code rather than bbox chain order. Null when the proxy (or OVC)
    // did not supply it — the router then treats the click as parcel-less for routing purposes.
    const catastroCp =
        typeof parcel.cp === 'string' && parcel.cp.trim().length > 0 ? parcel.cp.trim() : null;
    const catastroCm =
        typeof parcel.cm === 'string' && parcel.cm.trim().length > 0 ? parcel.cm.trim() : null;

    return { ring, refcat, areaM2, address, source, metrics, confidence, catastroCp, catastroCm };
}

/**
 * §WHERE-IS-YOUR-PROJECT (L-13057) — the SAME provider, addressed by cadastral REFERENCE
 * instead of by a map point.
 *
 * ⚠ NOT A SECOND RESOLVER. Same endpoint (`CATASTRO_PARCEL_ENDPOINT`), same response contract,
 * same `parseProxyResponse` — only the query key changes (`?refcat=` instead of `?lon=&lat=`).
 * The proxy answers it from the identical `GetParcel&REFCAT=` call + refcat-keyed cache the
 * click path already uses for its second hop; see `server/jurisdiction/parcelZoningProxy.js`
 * (`fetchParcelByRefcat`). Nothing about the geometry chain is duplicated on either side.
 *
 * Kept as a free function rather than added to the `ParcelProvider` interface deliberately: a
 * cadastral reference is REGISTRY-SHAPED (a Spanish `refcat` is 14 or 20 characters; other
 * registries are shaped differently and most are not implemented here), so "look up by
 * reference" is not a capability every provider in the registry can honour. Widening the shared
 * interface would assert a capability that, for every other provider, does not exist.
 *
 * Resolves to null on: empty/whitespace reference, network error, non-OK, non-JSON, or an
 * honest Catastro miss. **The caller must not collapse those into one message** — the miss is
 * "Catastro was asked and had no such parcel", which is a different answer from "we could not
 * ask" (§CONTEXT-DATA-HONESTY). Never throws.
 */
export async function fetchParcelByRefcat(refcat: string): Promise<ParcelFeature | null> {
    const outcome = await lookupParcelByRefcat(refcat);
    return outcome.status === 'ok' ? outcome.parcel : null;
}

/**
 * §CADASTRAL-UNREACHABLE-IS-NOT-A-MISS (D-CAD-A, founder 2026-09-07: *"make sure this works
 * sound"* about cadastral entry) — the SAME lookup, with its three outcomes kept apart.
 *
 * ⭐ WHY THIS EXISTS. `fetchParcelByRefcat`'s own doc comment has said since it was written that
 * *"the caller MUST NOT collapse those into one message — the miss is 'Catastro was asked and had
 * no such parcel', which is a different answer from 'we could not ask' (§CONTEXT-DATA-HONESTY)"*.
 * It then returned a bare `null` for both, so the caller COULD not honour it: the onboarding panel
 * told a user with no network *"Catastro (Spain) has no parcel with reference 1722706DF3812B —
 * check the reference"*, which is the product asserting the user's correct reference is wrong. The
 * instruction was right and unenforceable; this makes it enforceable. (Its sibling message,
 * *"Could not reach Catastro…"*, was authored on a `catch` around a function documented never to
 * throw — the one honest string in the feature, wired to nothing. It is now reachable.)
 *
 * ⛔ THE THREE OUTCOMES ARE NOT RANKED, THEY ARE DIFFERENT:
 *   · `ok`          — Catastro answered with a parcel.
 *   · `miss`        — Catastro answered, and there is no such parcel. An ANSWER.
 *   · `unreachable` — nobody answered (offline, proxy 5xx, non-JSON). NOT an answer, and never
 *                     to be rendered as one. `reason` carries which, for the console.
 *
 * Never throws.
 */
export type RefcatLookupOutcome =
    | { readonly status: 'ok'; readonly parcel: ParcelFeature }
    | { readonly status: 'miss' }
    | { readonly status: 'unreachable'; readonly reason: string };

export async function lookupParcelByRefcat(refcat: string): Promise<RefcatLookupOutcome> {
    const span = _tracer.startSpan('pryzm.parcel.fetchParcelByRefcat');
    span.setAttribute('pryzm.parcel.provider', 'catastro');
    try {
        const rc = (refcat ?? '').trim().toUpperCase();
        if (rc.length === 0) {
            span.setAttribute('pryzm.parcel.hit', false);
            // An empty reference is not a network failure and it is not Catastro's answer either
            // — nothing was asked. It reaches the same "no parcel" branch it always did, because
            // the sniffer never produces one; the caller's copy names the reference it read.
            return { status: 'miss' };
        }
        span.setAttribute('pryzm.parcel.refcat', rc);

        const url = `${CATASTRO_PARCEL_ENDPOINT}?refcat=${encodeURIComponent(rc)}`;

        let res: Response;
        try {
            res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
        } catch (err) {
            console.warn('[gis] catastro: network error (refcat lookup)', err);
            span.setAttribute('pryzm.parcel.hit', false);
            return { status: 'unreachable', reason: `network error: ${String(err)}` };
        }
        if (!res.ok) {
            console.warn('[gis] catastro: proxy returned', res.status, res.statusText, '(refcat lookup)');
            span.setAttribute('pryzm.parcel.hit', false);
            return { status: 'unreachable', reason: `proxy returned ${res.status} ${res.statusText}` };
        }

        let json: unknown;
        try {
            json = await res.json();
        } catch (err) {
            console.warn('[gis] catastro: response was not JSON (refcat lookup)', err);
            span.setAttribute('pryzm.parcel.hit', false);
            return { status: 'unreachable', reason: `response was not JSON: ${String(err)}` };
        }

        const parcel = parseProxyResponse(json);
        span.setAttribute('pryzm.parcel.hit', parcel !== null);
        if (parcel) {
            console.log(
                `[gis] catastro: refcat ${parcel.refcat} → parcel (~${parcel.areaM2.toFixed(0)} m², ` +
                `${parcel.ring.length} pts)`,
            );
            return { status: 'ok', parcel };
        }
        // ⚠ A 200 that parses to no parcel is Catastro's ANSWER — asked, and there is no such
        // reference. That is the ONE case that may be told to the user as "no such parcel".
        console.log(`[gis] catastro: no parcel for refcat ${rc}`);
        return { status: 'miss' };
    } finally {
        span.end();
    }
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
