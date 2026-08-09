// §MADRID-NORMAS-ZONALES-PROXY — tests for the Madrid PGOUM-97 ZONE-CODE proxy.
//
// The fixtures are SHAPED FROM the Esri JSON the sigma.madrid.es `NORMAS_ZONALES/MapServer/0` query
// returns (MADRID-DATA-RECON-SPIKE §2; `sources/VERIFICATION.md` V5, VERIFIED-LIVE 2026-07-24). No
// live network — every test injects `fetchImpl`. ⚠ So these tests prove the proxy handles the
// DOCUMENTED response shape; they do NOT re-verify that shape against production.
//
// The load-bearing property is the §CONTEXT-DATA-HONESTY split: an UPSTREAM FAILURE (502) must never
// look like an EMPTY answer (200 `{ features: [] }`). Here that distinction carries extra weight — a
// genuine empty is EVIDENCE about the open zones-2/6/10/11 question (`SOURCES.md` §0.3), so
// laundering an outage into one would corrupt a finding, not just a card.

import { describe, expect, it, beforeEach } from 'vitest';
import {
    buildMadridNormasZonalesUrl,
    fetchMadridNormasZonales,
    makeMadridNormasZonalesHandler,
    __resetMadridNormasZonalesCache,
    MADRID_NORMAS_ZONALES_ENDPOINT,
    MADRID_NORMAS_ZONALES_PATH,
} from '../jurisdiction/madridNormasZonalesProxy.js';

/** A representative layer-0 Esri response. `AMB_TX_ETIQ` is the `<zona>.<grado>` routing code. */
const okBody = {
    features: [
        {
            attributes: {
                AMB_TX_ETIQ: '8.2.b',
                AMB_TX_DENOM: 'Edificación en vivienda unifamiliar',
            },
        },
    ],
};

/** Minimal express-ish req/res doubles. */
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

describe('§MADRID-NORMAS-ZONALES-PROXY buildMadridNormasZonalesUrl', () => {
    it('builds a layer-0 point-intersect query in WGS84 — the join is SPATIAL, not a refcat key', () => {
        const url = buildMadridNormasZonalesUrl(40.41678, -3.70379);
        expect(url.startsWith(MADRID_NORMAS_ZONALES_ENDPOINT)).toBe(true);
        expect(MADRID_NORMAS_ZONALES_ENDPOINT).toContain('DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES');
        const decoded = decodeURIComponent(url);
        expect(decoded).toContain('geometry=-3.70379,40.41678'); // Esri point order (lon,lat)
        expect(decoded).toContain('geometryType=esriGeometryPoint');
        expect(decoded).toContain('inSR=4326');
        expect(decoded).toContain('spatialRel=esriSpatialRelIntersects');
        // The routing code, and the denomination probe P1 asks for. Requested — never assumed.
        expect(decoded).toContain('AMB_TX_ETIQ');
        expect(decoded).toContain('AMB_TX_DENOM');
        // ⚠ NO geometry. The zone polygon is not needed and not fetched.
        expect(decoded).toContain('returnGeometry=false');
    });

    it('is a DIFFERENT service from the NZ-1 condiciones plane, on its own route', () => {
        // `SOURCES.md` §0.3: "Take the zonal grado from NORMAS_ZONALES.AMB_TX_ETIQ, never from
        // COND_EDIF." Two questions, two services — collapsing them is how an NZ-8 parcel ends up
        // being told about NZ 1's Fondo de la Edificación.
        expect(MADRID_NORMAS_ZONALES_ENDPOINT).not.toContain('PG_CONDICIONES_EDIFICACION');
        expect(MADRID_NORMAS_ZONALES_PATH).toBe('/api/madrid/normas-zonales');
    });
});

describe('§MADRID-NORMAS-ZONALES-PROXY fetchMadridNormasZonales never throws', () => {
    it('returns the parsed Esri body on a 2xx JSON response', async () => {
        const fetchImpl = (async () => new Response(JSON.stringify(okBody), { status: 200 })) as unknown as typeof fetch;
        const body = await fetchMadridNormasZonales(40.41678, -3.70379, { fetchImpl });
        expect(body).not.toBeNull();
        expect((body as typeof okBody).features).toHaveLength(1);
        expect((body as typeof okBody).features[0]!.attributes.AMB_TX_ETIQ).toBe('8.2.b');
    });

    it('treats an ArcGIS error envelope as a FAILURE (null), not an empty area', async () => {
        const fetchImpl = (async () =>
            new Response(JSON.stringify({ error: { code: 400, message: 'bad' } }), { status: 200 })) as unknown as typeof fetch;
        await expect(fetchMadridNormasZonales(40.4, -3.7, { fetchImpl })).resolves.toBeNull();
    });

    it('treats a non-OK response / a network throw / non-JSON as FAILURE (null)', async () => {
        const nonOk = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
        const thrower = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        const nonJson = (async () => new Response('<html/>', { status: 200 })) as unknown as typeof fetch;
        await expect(fetchMadridNormasZonales(40.4, -3.7, { fetchImpl: nonOk })).resolves.toBeNull();
        await expect(fetchMadridNormasZonales(40.4, -3.7, { fetchImpl: thrower })).resolves.toBeNull();
        await expect(fetchMadridNormasZonales(40.4, -3.7, { fetchImpl: nonJson })).resolves.toBeNull();
    });

    it('rejects non-finite coordinates without contacting upstream', async () => {
        let called = 0;
        const fetchImpl = (async () => { called++; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
        await expect(fetchMadridNormasZonales(Number.NaN, -3.7, { fetchImpl })).resolves.toBeNull();
        expect(called).toBe(0);
    });
});

describe('§MADRID-NORMAS-ZONALES-PROXY handler', () => {
    beforeEach(() => __resetMadridNormasZonalesCache());

    it('400s without coordinates', async () => {
        const h = makeMadridNormasZonalesHandler({ fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch });
        const r = await invoke(h as never, {});
        expect(r.status).toBe(400);
    });

    it('200s with the raw features and caches (zoning boundaries change in years)', async () => {
        let calls = 0;
        const fetchImpl = (async () => { calls++; return new Response(JSON.stringify(okBody), { status: 200 }); }) as unknown as typeof fetch;
        const h = makeMadridNormasZonalesHandler({ fetchImpl });
        const first = await invoke(h as never, { lat: '40.41678', lon: '-3.70379' });
        expect(first.status).toBe(200);
        expect((first.body.features as unknown[]).length).toBe(1);
        expect(first.headers['x-madrid-nz-cache']).toBe('MISS');
        const second = await invoke(h as never, { lat: '40.41678', lon: '-3.70379' });
        expect(second.headers['x-madrid-nz-cache']).toBe('HIT');
        expect(calls).toBe(1);
    });

    it('a genuinely empty answer is 200 { features: [] } — a REAL "no Norma Zonal here"', async () => {
        // ⚠ And it IS cached, because it is an answer. Compare the 502 case below.
        const fetchImpl = (async () => new Response(JSON.stringify({ features: [] }), { status: 200 })) as unknown as typeof fetch;
        const h = makeMadridNormasZonalesHandler({ fetchImpl });
        const r = await invoke(h as never, { lat: '40.4', lon: '-3.7' });
        expect(r.status).toBe(200);
        expect(r.body.features).toEqual([]);
    });

    it('an upstream FAILURE is 502 + non-cacheable — distinct from an empty answer', async () => {
        const fetchImpl = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        const h = makeMadridNormasZonalesHandler({ fetchImpl });
        const r = await invoke(h as never, { lat: '40.4', lon: '-3.7' });
        expect(r.status).toBe(502); // NOT 200 — the client must return endpoint-unreachable
        expect(String(r.body.error)).toMatch(/NOT a statement/i);
        expect(r.headers['cache-control']).toContain('no-store');
        expect(r.headers['x-madrid-nz-cache']).toBe('MISS-UNREACHABLE');
    });
});
