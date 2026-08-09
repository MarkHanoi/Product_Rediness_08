// §BALEARS-MUIB-PROXY (L-680) — tests for the Illes Balears zone + *fitxa* point proxy.
//
// Fixtures are shaped from the LIVE response captured by `tools/balears-muib-probe/r1-reachability.mjs`
// on the real Manacor parcel 7704702ED1870S. No live network — every test injects `fetchImpl`.
//
// THE LOAD-BEARING PROPERTIES, each with its own describe block:
//   1. `inSR=4326` is on the query. The layer is native EPSG:25831, and omitting the input SR makes
//      ArcGIS read the coordinates in the layer's CRS — a CLEAN 200 WITH ZERO FEATURES, i.e. the
//      empty-vs-failure collapse arriving through the query string.
//   2. HTTP 200 IS NOT SUCCESS ON ARCGIS. An Esri `{error}` object rides a 200 body and MUST become
//      `null` (failure), never `[]` (nothing here).
//   3. THE SSRF GUARD. The fitxa URL comes from an UPSTREAM BODY. Only `muib.caib.es` is followed,
//      and an `http://` URL is upgraded to `https://` (the publisher emits plain http, which is
//      mixed content on an HTTPS page).
//   4. A HALF-ANSWER IS NEVER CACHED. A zoning hit whose fitxa failed must not be pinned for a week
//      as "this zone publishes nothing".

import { describe, expect, it, beforeEach } from 'vitest';
import {
    buildBalearsQualificacionsUrl,
    normaliseBalearsFitxaUrl,
    fetchBalearsArcgis,
    fetchBalearsMuibAtPoint,
    makeBalearsMuibHandler,
    __resetBalearsCache,
    balearsCacheStats,
    BALEARS_MUIB_SERVICE,
    BALEARS_FITXA_HOST,
} from '../jurisdiction/balearsMuibProxy.js';

/** The real Manacor point and the real attributes MUIB returned for it (probe, 2026-08-02). */
const MANACOR = { lat: 39.571284, lon: 3.2042448 };
const ATTRS = {
    OBJECTID: 44648,
    CODIMUIB: 'RE_NA',
    CODIAJ: 'RE-NA',
    CODIMUNI: '033',
    MUNICIPI: 'MANACOR',
    NOM: 'Nucli antic RE-NA',
    CODIPLA: '2021_PG_MANACOR_033',
    CODICLAS: 'SU',
    URL: 'http://muib.caib.es/mapurbibfront/normativa.jsp?identitat=292430',
    IDENTITAT: 292430,
    OBS: null,
    DINIVIGEN: '22/12/2021',
    DFIVIGEN: 99999999,
};
const ZONING_OK = { features: [{ attributes: ATTRS }] };
const FITXA_HTML = '<html><body><table><tr><td>NP</td><td>3</td></tr></table></body></html>';

function invoke(handler: (req: unknown, res: unknown) => Promise<unknown>, query: Record<string, string>) {
    const headers: Record<string, string> = {};
    let status = 0;
    let body: Record<string, unknown> = {};
    const res = {
        setHeader: (k: string, v: string) => { headers[k.toLowerCase()] = v; },
        status(code: number) { status = code; return this; },
        json(payload: Record<string, unknown>) { body = payload; return this; },
    };
    return handler({ query }, res).then(() => ({ status, body, headers }));
}

/** A fetch double that answers the ArcGIS query and the fitxa page independently. */
function fakeFetch(opts: { zoning?: unknown; zoningStatus?: number; fitxa?: string | null }) {
    return (async (url: string) => {
        const u = String(url);
        if (u.startsWith(BALEARS_MUIB_SERVICE)) {
            return new Response(JSON.stringify(opts.zoning ?? ZONING_OK), {
                status: opts.zoningStatus ?? 200,
            });
        }
        if (u.includes(BALEARS_FITXA_HOST)) {
            return opts.fitxa === null
                ? new Response('nope', { status: 500 })
                : new Response(opts.fitxa ?? FITXA_HTML, { status: 200 });
        }
        throw new Error(`unexpected host: ${u}`);
    }) as unknown as typeof fetch;
}

beforeEach(() => { __resetBalearsCache(); });

describe('§BALEARS-MUIB-PROXY URL construction', () => {
    it('carries inSR=4326 and an explicit spatialReference — the native-25831 gotcha', () => {
        const url = buildBalearsQualificacionsUrl(MANACOR.lat, MANACOR.lon);
        expect(url.startsWith(BALEARS_MUIB_SERVICE)).toBe(true);
        const decoded = decodeURIComponent(url);
        expect(decoded).toContain('inSR=4326');
        expect(decoded).toContain('"wkid":4326');
        expect(decoded).toContain('esriSpatialRelIntersects');
        // Attributes only: the ring is Catastro's job, and a zone polygon is not a parcel boundary.
        expect(decoded).toContain('returnGeometry=false');
        expect(decoded).toContain('outFields=*');
        // ⚠ x is LONGITUDE, y is LATITUDE. Swapping them lands Manacor in the Indian Ocean and
        // returns a clean 200 with zero features — the collapse this assertion prevents.
        expect(decoded).toContain(`"x":${MANACOR.lon}`);
        expect(decoded).toContain(`"y":${MANACOR.lat}`);
    });
});

describe('§BALEARS-MUIB-PROXY — the SSRF guard on a URL taken from an upstream body', () => {
    it('upgrades the publisher\'s plain http:// fitxa URL to https://', () => {
        expect(normaliseBalearsFitxaUrl(ATTRS.URL)).toBe(
            'https://muib.caib.es/mapurbibfront/normativa.jsp?identitat=292430',
        );
    });
    it('refuses every host that is not muib.caib.es, including the near-misses', () => {
        expect(normaliseBalearsFitxaUrl('https://evil.com/x')).toBeNull();
        // A suffix attack: the real hostname is `muib.caib.es.evil.com`.
        expect(normaliseBalearsFitxaUrl('https://muib.caib.es.evil.com/x')).toBeNull();
        // A userinfo trick: `URL.hostname` parses the REAL host, which is `evil.com`.
        expect(normaliseBalearsFitxaUrl('https://muib.caib.es@evil.com/x')).toBeNull();
        expect(normaliseBalearsFitxaUrl('file:///etc/passwd')).toBeNull();
        expect(normaliseBalearsFitxaUrl('not a url')).toBeNull();
        expect(normaliseBalearsFitxaUrl(null)).toBeNull();
    });
});

describe('§BALEARS-MUIB-PROXY fetchBalearsArcgis never throws, and 200 ≠ success', () => {
    it('returns the features array on a 2xx JSON response', async () => {
        const features = await fetchBalearsArcgis(
            buildBalearsQualificacionsUrl(MANACOR.lat, MANACOR.lon),
            { fetchImpl: fakeFetch({}) },
        );
        expect(features).toHaveLength(1);
    });
    it('⛔ an Esri error object riding an HTTP 200 is a FAILURE (null), never an empty answer', async () => {
        const esri = (async () => new Response(
            JSON.stringify({ error: { code: 400, message: 'Invalid geometry' } }), { status: 200 },
        )) as unknown as typeof fetch;
        await expect(fetchBalearsArcgis('https://x', { fetchImpl: esri })).resolves.toBeNull();
    });
    it('non-OK, a throw and a non-JSON body are all FAILURE (null)', async () => {
        const nonOk = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
        const thrower = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        const html = (async () => new Response('<html>err</html>', { status: 200 })) as unknown as typeof fetch;
        await expect(fetchBalearsArcgis('https://x', { fetchImpl: nonOk })).resolves.toBeNull();
        await expect(fetchBalearsArcgis('https://x', { fetchImpl: thrower })).resolves.toBeNull();
        await expect(fetchBalearsArcgis('https://x', { fetchImpl: html })).resolves.toBeNull();
    });
    it('⭐ a genuine empty answer stays `[]` — the OTHER half of the distinction', async () => {
        const empty = (async () => new Response(JSON.stringify({ features: [] }), { status: 200 })) as unknown as typeof fetch;
        await expect(fetchBalearsArcgis('https://x', { fetchImpl: empty })).resolves.toEqual([]);
    });
});

describe('§BALEARS-MUIB-PROXY point resolution', () => {
    it('resolves the zone AND follows THAT feature\'s own fitxa URL', async () => {
        const out = await fetchBalearsMuibAtPoint(MANACOR.lat, MANACOR.lon, { fetchImpl: fakeFetch({}) });
        expect(out.qualificacions).toHaveLength(1);
        expect(out.fitxa?.identitat).toBe(292430);
        expect(out.fitxa?.url).toContain('https://muib.caib.es');
        expect(out.fitxa?.html).toBe(FITXA_HTML);
    });
    it('a zoning hit whose FITXA failed keeps the zone and reports `fitxa: null` — two facts, not one', async () => {
        const out = await fetchBalearsMuibAtPoint(MANACOR.lat, MANACOR.lon, {
            fetchImpl: fakeFetch({ fitxa: null }),
        });
        expect(out.qualificacions).toHaveLength(1);
        expect(out.fitxa).toBeNull();
    });
    it('a zoning FAILURE never invents an empty zoning array', async () => {
        const out = await fetchBalearsMuibAtPoint(MANACOR.lat, MANACOR.lon, {
            fetchImpl: fakeFetch({ zoningStatus: 500 }),
        });
        expect(out.qualificacions).toBeNull();
        expect(out.fitxa).toBeNull();
    });
});

describe('§BALEARS-MUIB-PROXY handler', () => {
    it('400 on missing coordinates', async () => {
        const h = makeBalearsMuibHandler({ fetchImpl: fakeFetch({}) });
        const { status } = await invoke(h as never, {});
        expect(status).toBe(400);
    });
    it('a point outside the islands is an honest EMPTY (200), not a failure and not a round trip', async () => {
        const never = (async () => { throw new Error('the handler must not call upstream here'); }) as unknown as typeof fetch;
        const h = makeBalearsMuibHandler({ fetchImpl: never });
        // Barcelona — inside Spain, well outside the Balears box.
        const { status, body, headers } = await invoke(h as never, { lat: '41.39', lon: '2.16' });
        expect(status).toBe(200);
        expect(body.qualificacions).toEqual([]);
        expect(body.fitxa).toBeNull();
        expect(headers['x-balears-cache']).toBe('OUT-OF-BOUNDS');
    });
    it('⛔ the zoning layer down is a 502 — never a 200 saying "no plan here"', async () => {
        const h = makeBalearsMuibHandler({ fetchImpl: fakeFetch({ zoningStatus: 502 }) });
        const { status, body } = await invoke(h as never, {
            lat: String(MANACOR.lat), lon: String(MANACOR.lon),
        });
        expect(status).toBe(502);
        expect(String(body.error)).toContain('did not answer');
        // And the caller is told, in the body, that this is NOT a statement about the land.
        expect(String(body.error)).toContain('NOT a statement');
    });
    it('200 with the zone + fitxa on the real Manacor point, and caches a COMPLETE answer', async () => {
        const h = makeBalearsMuibHandler({ fetchImpl: fakeFetch({}) });
        const q = { lat: String(MANACOR.lat), lon: String(MANACOR.lon) };
        const first = await invoke(h as never, q);
        expect(first.status).toBe(200);
        expect(first.headers['x-balears-cache']).toBe('MISS');
        expect((first.body.qualificacions as unknown[])).toHaveLength(1);
        const second = await invoke(h as never, q);
        expect(second.headers['x-balears-cache']).toBe('HIT');
        expect(balearsCacheStats().hits).toBe(1);
    });
    it('⛔ a HALF-answer (zone OK, fitxa down) is NEVER cached — one outage must not last a week', async () => {
        const h = makeBalearsMuibHandler({ fetchImpl: fakeFetch({ fitxa: null }) });
        const q = { lat: String(MANACOR.lat), lon: String(MANACOR.lon) };
        const first = await invoke(h as never, q);
        expect(first.status).toBe(200);
        expect(first.body.fitxa).toBeNull();
        const second = await invoke(h as never, q);
        expect(second.headers['x-balears-cache']).toBe('MISS');
        expect(balearsCacheStats().hits).toBe(0);
    });
});
