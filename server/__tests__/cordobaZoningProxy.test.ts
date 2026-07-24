// §CORDOBA-ZONING-PROXY (WIRING-TODO 5) — tests for the COACo PGOU-2001 subzone proxy.
//
// Fixtures shaped from the WFS GeoJSON the COACo GeoServer returns (CORDOBA-DATA-RECON-SPIKE §4/§10).
// No live network — every test injects `fetchImpl`. The load-bearing properties: the URL carries the
// EXPLICIT `urn:ogc:def:crs:EPSG::4326` axis (the documented gotcha — a bare 4326 bbox returns EMPTY),
// and an UPSTREAM FAILURE (502) never masquerades as an EMPTY answer (200 { features: [] }).

import { describe, expect, it, beforeEach } from 'vitest';
import {
    buildCordobaOrdenanzasUrl,
    buildCordobaVcatastroUrl,
    fetchCordobaWfs,
    makeCordobaOrdenanzasHandler,
    makeCordobaVcatastroHandler,
    __resetCordobaCache,
    CORDOBA_WFS_ENDPOINT,
} from '../cordobaZoningProxy.js';

const ordFc = { features: [{ properties: { ordenanza: 'Manzana Cerrada', link: 'https://x/doc/O_MC3.pdf' } }] };
const vcFc = { features: [{ properties: { refcat: '3834946UG4933S', ordenanza: 'Colonia Tradicional Popular', actuacion: '', sup_pc_m2: 165, max_plantas: 2 } }] };

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

describe('§CORDOBA-ZONING-PROXY URL construction', () => {
    it('ordenanzas: a spatial query with the EXPLICIT urn 4326 axis (the gotcha)', () => {
        const url = buildCordobaOrdenanzasUrl(37.8745, -4.7757);
        expect(url.startsWith(CORDOBA_WFS_ENDPOINT)).toBe(true);
        const decoded = decodeURIComponent(url);
        expect(decoded).toContain('typeNames=coaco:ordenanzas');
        expect(decoded).toContain('urn:ogc:def:crs:EPSG::4326'); // authority (lat/lon) axis order
        expect(decoded).toContain('ordenanza,link');
        // lat/lon order on the bbox (authority axis) — minLat comes first.
        expect(decoded).toMatch(/bbox=37\.87\d+,-4\.77\d+,37\.87\d+,-4\.77\d+,urn/);
    });

    it('vcatastro: a refcat key-join with the attributes + the override, quotes escaped', () => {
        const url = buildCordobaVcatastroUrl("ABC'123");
        const decoded = decodeURIComponent(url);
        expect(decoded).toContain('typeNames=coaco:vcatastro_urbanismo');
        expect(decoded).toContain('sup_pc_m2');
        expect(decoded).toContain('actuacion');
        // A single quote in the refcat is doubled (CQL escaping), never left to break the filter.
        expect(decoded).toContain("refcat='ABC''123'");
    });
});

describe('§CORDOBA-ZONING-PROXY fetchCordobaWfs never throws', () => {
    it('returns parsed GeoJSON on a 2xx JSON response', async () => {
        const fetchImpl = (async () => new Response(JSON.stringify(ordFc), { status: 200 })) as unknown as typeof fetch;
        const body = await fetchCordobaWfs('http://x', { fetchImpl });
        expect((body as typeof ordFc).features).toHaveLength(1);
    });
    it('treats non-OK / a throw / an XML ExceptionReport as FAILURE (null)', async () => {
        const nonOk = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
        const thrower = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        const xml = (async () => new Response('<ExceptionReport/>', { status: 200 })) as unknown as typeof fetch;
        await expect(fetchCordobaWfs('http://x', { fetchImpl: nonOk })).resolves.toBeNull();
        await expect(fetchCordobaWfs('http://x', { fetchImpl: thrower })).resolves.toBeNull();
        await expect(fetchCordobaWfs('http://x', { fetchImpl: xml })).resolves.toBeNull();
    });
});

describe('§CORDOBA-ZONING-PROXY handlers', () => {
    beforeEach(() => __resetCordobaCache());

    it('ordenanzas: 400 without coords, 200 { features } on success (cached), 502 on failure', async () => {
        const h400 = makeCordobaOrdenanzasHandler({ fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch });
        expect((await invoke(h400 as never, {})).status).toBe(400);

        let calls = 0;
        const okFetch = (async () => { calls++; return new Response(JSON.stringify(ordFc), { status: 200 }); }) as unknown as typeof fetch;
        const hOk = makeCordobaOrdenanzasHandler({ fetchImpl: okFetch });
        const first = await invoke(hOk as never, { lat: '37.8745', lon: '-4.7757' });
        expect(first.status).toBe(200);
        expect((first.body.features as unknown[]).length).toBe(1);
        const second = await invoke(hOk as never, { lat: '37.8745', lon: '-4.7757' });
        expect(second.headers['x-cordoba-cache']).toBe('HIT');
        expect(calls).toBe(1);

        const hFail = makeCordobaOrdenanzasHandler({ fetchImpl: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
        const fail = await invoke(hFail as never, { lat: '37.8', lon: '-4.7' });
        expect(fail.status).toBe(502); // failure ≠ empty
        expect(fail.headers['cache-control']).toContain('no-store');
    });

    it('vcatastro: 400 without a refcat, 200 { features } on success, 502 on failure', async () => {
        const h400 = makeCordobaVcatastroHandler({ fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch });
        expect((await invoke(h400 as never, {})).status).toBe(400);

        const hOk = makeCordobaVcatastroHandler({ fetchImpl: (async () => new Response(JSON.stringify(vcFc), { status: 200 })) as unknown as typeof fetch });
        const ok = await invoke(hOk as never, { refcat: '3834946UG4933S' });
        expect(ok.status).toBe(200);
        expect((ok.body.features as unknown[]).length).toBe(1);

        const hFail = makeCordobaVcatastroHandler({ fetchImpl: (async () => new Response('x', { status: 503 })) as unknown as typeof fetch });
        expect((await invoke(hFail as never, { refcat: 'X' })).status).toBe(502);
    });
});
