// §AREA-IS-A-DECLARED-CAPABILITY (C57 §1.14, lane CADASTRAL-COVERAGE 2026-09-09) — THE ONE CLIENT
// READER for every cadastral AREA route, and the one place the server's outcome vocabulary is
// mapped onto the three arms the UI is allowed to see.
//
// WHY ONE READER FOR THREE ROUTES
// -------------------------------
// The server side grew three area endpoints, because three different upstream protocols already
// had three different proxies:
//   · Spain   `GET /api/catastro/parcels?lat=&lon=&radiusM=`
//   · Denmark `GET /api/parcel/dk/area?lon=&lat=&radiusM=`
//   · EU/RoW  `GET /api/parcel/<cc>/area?lon=&lat=&radiusM=`
// They deliberately share ONE body: `{ outcome, parcels[], truncated, reason? }`. If each client
// adapter parsed that body itself we would have three readers of one shape — this repo's dominant
// defect, at the exact seam where it is hardest to see (all three would keep returning plausible
// rings, and nothing would fail). So the adapters own only their URL; the body is read here.
//
// ⛔ THE VOCABULARY NARROWS HERE, AND EVERY COLLAPSE IS A DECISION, NOT A DEFAULT.
// The server emits SEVEN outcomes; `ParcelAreaOutcome` has THREE. Each mapping below is justified
// where it is made. The two that matter:
//   · `out-of-area` → `ok` with ZERO parcels. It is an authoritative statement that this register
//     holds nothing at this coordinate — a fact about the land, which is exactly what `ok: []`
//     means. Mapping it to `unsupported` would disable the chip for a whole country because the
//     user once panned offshore.
//   · `unconfigured` → `unreachable`. The deployment holds no credential, so the register was
//     never asked. The ONE thing that is not is an answer about the land. This is the same call
//     `WfsParcelProvider` already makes for the point route, copied rather than re-derived.
//
// PURE fetch+parse (C57 §1.7): no THREE, no Cesium, no DOM. Never throws.

import { trace } from '@opentelemetry/api';
import type { LatLon } from '../boundaryProjection.js';
import type { ParcelAreaOutcome, ParcelFeature } from './ParcelProvider.js';

const _tracer = trace.getTracer('pryzm.parcel');

/**
 * The server outcomes that are a real statement about the LAND, and therefore become `ok`.
 *
 * ⚠ `bad-input` is deliberately NOT here. A malformed request is PRYZM's bug, and reporting our
 * own bad request as "there are no parcels here" would be the §CONTEXT-DATA-HONESTY prohibition
 * with our own name on it. It falls through to `unreachable`, which is the honest arm for
 * "no answer was obtained", and it will show up in the log with its reason.
 */
const LAND_OUTCOMES = new Set(['ok', 'out-of-area']);

/** The server outcomes that are a durable statement about the SOURCE, and therefore `unsupported`. */
const SOURCE_OUTCOMES = new Set(['unsupported', 'unknown-source']);

function readString(o: unknown, key: string): string | null {
    if (!o || typeof o !== 'object') return null;
    const v = (o as Record<string, unknown>)[key];
    return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * One server parcel row → a `ParcelFeature`, or null when it carries no drawable ring.
 *
 * ⚠ NO `metrics` AND NO `confidence`, DELIBERATELY. Those are attached to the SELECTED parcel,
 * where the user reads them on a card and where the cost is one shoelace + one compactness. An
 * area answer is up to 400 neighbours that exist only to be drawn as lines; computing a match
 * tier for each would spend real time producing numbers nothing renders. The fields are optional
 * on `ParcelFeature` precisely so an overlay row can be honest about carrying neither, rather
 * than shipping a fabricated tier.
 */
function readAreaParcel(row: unknown, fallbackSource: string): ParcelFeature | null {
    if (!row || typeof row !== 'object') return null;
    const r = row as Record<string, unknown>;
    const rawRing = r.ring;
    if (!Array.isArray(rawRing) || rawRing.length < 3) return null;
    const ring: LatLon[] = [];
    for (const pt of rawRing) {
        if (!pt || typeof pt !== 'object') continue;
        const lat = (pt as Record<string, unknown>).lat;
        const lon = (pt as Record<string, unknown>).lon;
        if (typeof lat !== 'number' || typeof lon !== 'number') continue;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        ring.push({ lat, lon });
    }
    if (ring.length < 3) return null;
    const refcat = readString(r, 'refcat');
    // ⛔ A ring PRYZM cannot name is dropped, not drawn with a blank label. The overlay's whole
    // claim is "these are the cadastral parcels around you"; an unattributable outline is a line
    // on a map making that claim without standing behind it.
    if (!refcat) return null;
    const areaM2Raw = r.areaM2;
    const areaM2 = typeof areaM2Raw === 'number' && Number.isFinite(areaM2Raw) ? areaM2Raw : 0;
    return {
        ring,
        refcat,
        areaM2,
        address: readString(r, 'address'),
        source: readString(r, 'source') ?? fallbackSource,
    };
}

/**
 * ⭐ THE ONE NORMALISATION. Pure over a parsed body; exported so a spec can pin every arm of the
 * server's vocabulary without a network (C57 §6).
 *
 * @param label the human name of the register, used only in the sentences a chip renders.
 */
export function normaliseParcelAreaBody(json: unknown, label: string): ParcelAreaOutcome {
    const outcome = readString(json, 'outcome');
    const reason = readString(json, 'reason');

    if (outcome !== null && SOURCE_OUTCOMES.has(outcome)) {
        return {
            status: 'unsupported',
            reason: reason
                ?? `${label} publishes no area query, so PRYZM cannot list the surrounding parcels here.`,
        };
    }

    if (outcome === null || !LAND_OUTCOMES.has(outcome)) {
        // ⛔ INCLUDES `outcome === null`. A body with no discriminator is an OLDER SERVER, or a
        // cached response minted before the area routes existed, or something that is not this
        // API at all. None of those is the register telling us the area is empty. Under-claiming
        // here costs a retry; over-claiming would draw an empty overlay and call it coverage.
        return {
            status: 'unreachable',
            reason: reason
                ?? (outcome === null
                    ? `${label} returned a response PRYZM does not recognise.`
                    : `${label} did not answer (${outcome}).`),
        };
    }

    const rawParcels = (json as { parcels?: unknown }).parcels;
    const parcels: ParcelFeature[] = [];
    if (Array.isArray(rawParcels)) {
        for (const row of rawParcels) {
            const p = readAreaParcel(row, label);
            if (p) parcels.push(p);
        }
    }
    // ⚠ THE DEFAULT IS `true`. A body that does not state `truncated` has not told us it is
    // complete, and C57 §1.14.3 makes the conservative arm the required one: over-claiming
    // completeness tells the user a boundary does not exist when it was merely not requested.
    // `out-of-area` is the one case that is knowably complete — the register holds nothing here,
    // so there is nothing left to truncate.
    const truncatedRaw = (json as { truncated?: unknown }).truncated;
    const truncated = outcome === 'out-of-area'
        ? false
        : (typeof truncatedRaw === 'boolean' ? truncatedRaw : true);
    return { status: 'ok', parcels, truncated };
}

/**
 * THE one area request. Builds no URL of its own beyond the query string — the caller passes the
 * route, because the route is the only thing that differs between the three cadastral proxies.
 *
 * Never throws: a transport failure, a non-OK status and a non-JSON body are all `unreachable`
 * with the reason naming which — never an empty `ok`, which would draw a blank overlay over a
 * city block and read as "there is nothing here".
 */
export async function fetchParcelAreaFromProxy(
    route: string,
    providerId: string,
    label: string,
    lon: number,
    lat: number,
    radiusM: number,
): Promise<ParcelAreaOutcome> {
    const span = _tracer.startSpan('pryzm.parcel.fetchParcelsInArea');
    span.setAttribute('pryzm.parcel.provider', providerId);
    try {
        if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(radiusM) || radiusM <= 0) {
            span.setAttribute('pryzm.parcel.area.outcome', 'unreachable');
            return {
                status: 'unreachable',
                reason: 'PRYZM asked for an area with no valid centre or radius.',
            };
        }
        span.setAttribute('pryzm.parcel.lon', lon);
        span.setAttribute('pryzm.parcel.lat', lat);
        span.setAttribute('pryzm.parcel.area.radiusM', radiusM);

        const url = `${route}?lon=${encodeURIComponent(String(lon))}`
            + `&lat=${encodeURIComponent(String(lat))}`
            + `&radiusM=${encodeURIComponent(String(Math.round(radiusM)))}`;

        const unreachable = (reason: string): ParcelAreaOutcome => {
            console.warn(`[gis] ${providerId}: area query UNREACHABLE — ${reason}`);
            span.setAttribute('pryzm.parcel.area.outcome', 'unreachable');
            return { status: 'unreachable', reason };
        };

        let res: Response;
        try {
            res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
        } catch (err) {
            return unreachable(`network error contacting the parcel proxy: ${String(err)}`);
        }

        let json: unknown = null;
        let jsonErr: unknown = null;
        try {
            json = await res.json();
        } catch (err) {
            jsonErr = err;
        }

        // ⛔ A NON-OK STATUS IS READ FOR ITS BODY FIRST. The DK and EU area routes answer HTTP 503
        // for `unconfigured` and HTTP 400 for `bad-input`, both with a real `outcome` and a real
        // `reason` in the body. Bailing on `!res.ok` before looking would throw away the server's
        // own sentence and replace it with a status code — which is how the point route's outage
        // branch became unreachable in the first place (§L-13299).
        if (jsonErr !== null) {
            return unreachable(res.ok
                ? `the parcel proxy's response was not JSON: ${String(jsonErr)}`
                : `the parcel proxy returned ${res.status} ${res.statusText}`);
        }

        const normalised = normaliseParcelAreaBody(json, label);
        span.setAttribute('pryzm.parcel.area.outcome', normalised.status);
        if (normalised.status === 'ok') {
            span.setAttribute('pryzm.parcel.area.count', normalised.parcels.length);
            span.setAttribute('pryzm.parcel.area.truncated', normalised.truncated);
            console.log(
                `[gis] ${providerId}: ${normalised.parcels.length} boundary parcel(s) within `
                + `${Math.round(radiusM)} m${normalised.truncated ? ' (TRUNCATED — more exist)' : ''}.`,
            );
        } else {
            console.warn(`[gis] ${providerId}: area ${normalised.status} — ${normalised.reason}`);
        }
        return normalised;
    } finally {
        span.end();
    }
}

/**
 * The sentence a provider with no area capability returns, written ONCE so every point-only
 * cadastre says the same thing — and so the phrasing blames the register's publishing model
 * rather than the plot or the network, which are the two things it is emphatically not.
 */
export function unsupportedAreaReason(label: string): string {
    return `${label} answers one point at a time and publishes no area query, so PRYZM cannot `
        + 'show you the surrounding parcel boundaries here. That is how this register is '
        + 'published — it is not an outage, and retrying will not change it.';
}
