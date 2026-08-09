// §MADRID-CONDICIONES-PROXY (L-608) — tests for the Madrid PGOUM-97 NZ 1 footprint proxy.
//
// The fixtures are SHAPED FROM the Esri JSON the sigma.madrid.es layer-6 query returns (MADRID-DATA-
// RECON-SPIKE §6.1). No live network — every test injects `fetchImpl`. The load-bearing property is
// the §CONTEXT-DATA-HONESTY split: an UPSTREAM FAILURE (502) must never look like an EMPTY answer
// (200 { features: [] }), so the client returns endpoint-unreachable, never no-feature.

import { describe, expect, it, beforeEach } from 'vitest';
import {
    buildMadridCondicionesUrl,
    fetchMadridCondiciones,
    makeMadridCondicionesHandler,
    __resetMadridCache,
    MADRID_CONDICIONES_ENDPOINT,
} from '../jurisdiction/madridCondicionesProxy.js';

/** A representative layer-6 Esri response (outSR=4326 ⇒ [lon,lat] rings, closing vertex repeated). */
const okBody = {
    features: [
        {
            attributes: { CODMANZANA: '0105104', NUMORD: '00311', COND_EDIF: 3, COEF_Z: '5' },
            geometry: {
                rings: [[[-3.704, 40.4166], [-3.7036, 40.4166], [-3.7036, 40.417], [-3.704, 40.417], [-3.704, 40.4166]]],
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

describe('§MADRID-CONDICIONES-PROXY buildMadridCondicionesUrl', () => {
    it('builds a layer-6 point-intersect query in WGS84 (spatial, not a CODMANZANA string)', () => {
        const url = buildMadridCondicionesUrl(40.4166, -3.7038);
        expect(url.startsWith(MADRID_CONDICIONES_ENDPOINT)).toBe(true);
        const decoded = decodeURIComponent(url);
        expect(decoded).toContain('geometry=-3.7038,40.4166'); // Esri point order (lon,lat)
        expect(decoded).toContain('geometryType=esriGeometryPoint');
        expect(decoded).toContain('inSR=4326');
        expect(decoded).toContain('spatialRel=esriSpatialRelIntersects');
        expect(decoded).toContain('outSR=4326'); // ring returns WGS84
        expect(decoded).toContain('COEF_Z');
        expect(decoded).toContain('CODMANZANA');
    });
});

describe('§MADRID-CONDICIONES-PROXY fetchMadridCondiciones never throws', () => {
    it('returns the parsed Esri body on a 2xx JSON response', async () => {
        const fetchImpl = (async () => new Response(JSON.stringify(okBody), { status: 200 })) as unknown as typeof fetch;
        const body = await fetchMadridCondiciones(40.4166, -3.7038, { fetchImpl });
        expect(body).not.toBeNull();
        expect((body as typeof okBody).features).toHaveLength(1);
    });

    it('treats an ArcGIS error envelope as a FAILURE (null), not an empty area', async () => {
        const fetchImpl = (async () =>
            new Response(JSON.stringify({ error: { code: 400, message: 'bad' } }), { status: 200 })) as unknown as typeof fetch;
        await expect(fetchMadridCondiciones(40.4, -3.7, { fetchImpl })).resolves.toBeNull();
    });

    it('treats a non-OK response / a network throw / non-JSON as FAILURE (null)', async () => {
        const nonOk = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
        const thrower = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        const nonJson = (async () => new Response('<html/>', { status: 200 })) as unknown as typeof fetch;
        await expect(fetchMadridCondiciones(40.4, -3.7, { fetchImpl: nonOk })).resolves.toBeNull();
        await expect(fetchMadridCondiciones(40.4, -3.7, { fetchImpl: thrower })).resolves.toBeNull();
        await expect(fetchMadridCondiciones(40.4, -3.7, { fetchImpl: nonJson })).resolves.toBeNull();
    });

    it('rejects non-finite coordinates without contacting upstream', async () => {
        let called = 0;
        const fetchImpl = (async () => { called++; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
        await expect(fetchMadridCondiciones(Number.NaN, -3.7, { fetchImpl })).resolves.toBeNull();
        expect(called).toBe(0);
    });
});

describe('§MADRID-CONDICIONES-PROXY handler', () => {
    beforeEach(() => __resetMadridCache());

    it('400s without coordinates', async () => {
        const h = makeMadridCondicionesHandler({ fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch });
        const r = await invoke(h as never, {});
        expect(r.status).toBe(400);
    });

    it('200s with the raw features and caches (planning geometry changes in years)', async () => {
        let calls = 0;
        const fetchImpl = (async () => { calls++; return new Response(JSON.stringify(okBody), { status: 200 }); }) as unknown as typeof fetch;
        const h = makeMadridCondicionesHandler({ fetchImpl });
        const first = await invoke(h as never, { lat: '40.4166', lon: '-3.7038' });
        expect(first.status).toBe(200);
        expect((first.body.features as unknown[]).length).toBe(1);
        expect(first.headers['x-madrid-cache']).toBe('MISS');
        const second = await invoke(h as never, { lat: '40.4166', lon: '-3.7038' });
        expect(second.headers['x-madrid-cache']).toBe('HIT');
        expect(calls).toBe(1);
    });

    it('a genuinely empty answer is 200 { features: [] } (a real "no footprint here")', async () => {
        const fetchImpl = (async () => new Response(JSON.stringify({ features: [] }), { status: 200 })) as unknown as typeof fetch;
        const h = makeMadridCondicionesHandler({ fetchImpl });
        const r = await invoke(h as never, { lat: '40.4', lon: '-3.7' });
        expect(r.status).toBe(200);
        expect(r.body.features).toEqual([]);
    });

    it('an upstream FAILURE is 502 + non-cacheable — distinct from an empty answer', async () => {
        const fetchImpl = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        const h = makeMadridCondicionesHandler({ fetchImpl });
        const r = await invoke(h as never, { lat: '40.4', lon: '-3.7' });
        expect(r.status).toBe(502); // NOT 200 — the client must return endpoint-unreachable, not no-feature
        expect(r.headers['cache-control']).toContain('no-store');
        expect(r.headers['x-madrid-cache']).toBe('MISS-UNREACHABLE');
    });
});
