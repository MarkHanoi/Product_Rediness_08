// §BCN-REFOS-OV-PROXY — tests for the AMB Refós `OV_Trames` same-origin seam (Barcelona clau 18).
//
// The fixtures are SHAPED FROM the Esri JSON the layer-17 query actually returns (probed live
// 2026-07-31: `{ "CLAU": "18hs", "PLANTES": "B+7", "EXP": "1998/001498" }` + a WGS84 ring). No live
// network — every test injects `fetchImpl`.
//
// The load-bearing property is the §CONTEXT-DATA-HONESTY split: an UPSTREAM FAILURE (502) must never
// look like an EMPTY answer (200 `{ features: [] }`). They mean legally different things — "the AMB
// service is down" vs "PGM Art. 306 points at a volumetric ordering and none is published for this
// site" — and the client turns them into two different refusal reasons.
//
// The second property is that this is NOT an open ArcGIS forwarder: the layer, the `where` scope and
// `outFields` are allowlisted, and the upstream URL is rebuilt server-side from a fixed host.

import { describe, expect, it, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
    buildBcnRefosOvUrl,
    fetchBcnRefosOv,
    makeBcnRefosOvHandler,
    parseQueryPoint,
    parseLayer,
    parseIneScope,
    parseOutFields,
    __resetBcnRefosCache,
    BCN_REFOS_ENDPOINT,
    BCN_REFOS_OV_PATH,
    BCN_REFOS_OV_LAYER,
} from '../bcnRefosOvProxy.js';

/** A representative layer-17 Esri response (outSR=4326 ⇒ [lon,lat], closing vertex repeated). */
const okBody = {
    features: [
        {
            attributes: { PLANTES: 'B+7', CLAU: '18hs', EXP: '1998/001498' },
            geometry: {
                rings: [[
                    [2.204238, 41.428826],
                    [2.204132, 41.4287],
                    [2.203667, 41.428922],
                    [2.203771, 41.429049],
                    [2.204238, 41.428826],
                ]],
            },
        },
    ],
};

/** The exact query string the shipped `bcnRefosOVProvider.ts` emits. */
const CLIENT_QUERY = {
    layer: '17',
    geometry: JSON.stringify({ x: 2.2039, y: 41.4288, spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    where: "CODI_INE='08019'",
    outFields: 'PLANTES,CLAU,EXP',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
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

describe('§BCN-REFOS-OV-PROXY route constant + registration', () => {
    it('is the exact path `bcnRefosOVProvider.BCN_REFOS_OV_PATH` calls', () => {
        // If this ever drifts, the client refuses `endpoint-unreachable` on every clau-18 parcel —
        // which is precisely the silent failure this whole route exists to end.
        expect(BCN_REFOS_OV_PATH).toBe('/api/bcn-refos/ov');
    });

    it('IS ACTUALLY MOUNTED in server.js — a handler nobody registers serves nothing', async () => {
        // THE ORIGINAL DEFECT, as a guard. The pack, the resolver and the L5 dispatch branch were
        // all written and all unit-tested green while clau 18 rendered nothing, because no line of
        // `server.js` ever mounted this path. Deleting the registration must fail a test.
        const src = await readFile(new URL('../../server.js', import.meta.url), 'utf8');
        expect(src).toContain("from './server/bcnRefosOvProxy.js'");
        expect(src).toMatch(/app\.get\(\s*BCN_REFOS_OV_PATH\s*,[^)]*bcnRefosOvHandler\s*\)/);
    });
});

describe('§BCN-REFOS-OV-PROXY buildBcnRefosOvUrl', () => {
    it('builds a layer-17 point-intersect query that returns the ring in WGS84', () => {
        const url = buildBcnRefosOvUrl(41.4288, 2.2039);
        expect(url.startsWith(`${BCN_REFOS_ENDPOINT}/${BCN_REFOS_OV_LAYER}/query`)).toBe(true);
        const d = decodeURIComponent(url);
        // Esri point JSON — x is the LONGITUDE. Swapping these silently queries the Indian Ocean.
        expect(d).toContain('"x":2.2039');
        expect(d).toContain('"y":41.4288');
        expect(d).toContain('geometryType=esriGeometryPoint');
        expect(d).toContain('inSR=4326');
        expect(d).toContain('spatialRel=esriSpatialRelIntersects');
        expect(d).toContain("where=CODI_INE='08019'");
        expect(d).toContain('outSR=4326'); // ⇐ the client must not have to reproject from 3857
        expect(d).toContain('PLANTES');
    });

    it('only ever targets the AMB Refós host — the upstream URL is rebuilt server-side', () => {
        const url = buildBcnRefosOvUrl(41.4, 2.2, { layer: 16, outFields: 'CLAU_URB', ine: '08019' });
        expect(new URL(url).host).toBe('geoportal.amb.cat');
        expect(url).toContain('/MapServer/16/query');
    });
});

describe('§BCN-REFOS-OV-PROXY input validation — not an open ArcGIS forwarder', () => {
    it('accepts the Esri point JSON the shipped client sends (x = lon, y = lat)', () => {
        expect(parseQueryPoint({ geometry: CLIENT_QUERY.geometry })).toEqual({ lat: 41.4288, lon: 2.2039 });
    });
    it('also accepts the plain lat/lon form (so probes need not hand-encode Esri JSON)', () => {
        expect(parseQueryPoint({ lat: '41.4288', lon: '2.2039' })).toEqual({ lat: 41.4288, lon: 2.2039 });
    });
    it('accepts the Esri "lon,lat" shorthand', () => {
        expect(parseQueryPoint({ geometry: '2.2039,41.4288' })).toEqual({ lat: 41.4288, lon: 2.2039 });
    });
    it('refuses a malformed / out-of-range / absent point rather than defaulting to 0,0', () => {
        expect(parseQueryPoint({ geometry: '{not json' })).toBeNull();
        expect(parseQueryPoint({ geometry: JSON.stringify({ x: 999, y: 41 }) })).toBeNull();
        expect(parseQueryPoint({ lat: 'abc', lon: '2.2' })).toBeNull();
        expect(parseQueryPoint({})).toBeNull();
    });

    it('allows only the allowlisted layers; anything else is a hard null (⇒ 400)', () => {
        expect(parseLayer('17')).toBe(17);
        expect(parseLayer('16')).toBe(16);
        expect(parseLayer(undefined)).toBe(17); // default = OV_Trames
        expect(parseLayer('0')).toBeNull();
        expect(parseLayer('99')).toBeNull();
        expect(parseLayer('17; DROP')).toBeNull();
    });

    it('allows only a bare CODI_INE scope as `where` — the whole SQL surface is 5 digits', () => {
        expect(parseIneScope("CODI_INE='08019'")).toBe('08019');
        expect(parseIneScope(undefined)).toBe('08019');
        expect(parseIneScope("1=1 OR CODI_INE='08019'")).toBeNull();
        expect(parseIneScope("CODI_INE='08019' OR 1=1")).toBeNull();
        expect(parseIneScope("CLAU='18'")).toBeNull();
    });

    it('intersects outFields with the allowlist and never forwards an unknown field', () => {
        expect(parseOutFields('PLANTES,CLAU,EXP')).toBe('PLANTES,CLAU,EXP');
        expect(parseOutFields('PLANTES,SECRET')).toBe('PLANTES');
        expect(parseOutFields('SECRET')).toBe('PLANTES,CLAU,EXP'); // nothing survived ⇒ the default
        expect(parseOutFields('')).toBe('PLANTES,CLAU,EXP');
    });
});

describe('§BCN-REFOS-OV-PROXY fetchBcnRefosOv never throws', () => {
    it('returns the parsed Esri body on a 2xx JSON response', async () => {
        const fetchImpl = (async () => new Response(JSON.stringify(okBody), { status: 200 })) as unknown as typeof fetch;
        const body = await fetchBcnRefosOv(41.4288, 2.2039, { fetchImpl });
        expect((body as typeof okBody).features).toHaveLength(1);
        expect((body as typeof okBody).features[0].attributes.PLANTES).toBe('B+7');
    });

    it('treats an ArcGIS {error} envelope (HTTP 200!) as a FAILURE, not an empty area', async () => {
        // Measured: the AMB service answers 200 with `{"error":{"code":400,…}}` on a malformed query.
        // If that became `features: []` a service fault would read as "no volumetric ordering here".
        const fetchImpl = (async () =>
            new Response(JSON.stringify({ error: { code: 400, message: 'Failed to execute query.' } }), { status: 200 })) as unknown as typeof fetch;
        await expect(fetchBcnRefosOv(41.4, 2.2, { fetchImpl })).resolves.toBeNull();
    });

    it('treats a non-OK response / a network throw / non-JSON as FAILURE (null)', async () => {
        const nonOk = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
        const thrower = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        const nonJson = (async () => new Response('<html/>', { status: 200 })) as unknown as typeof fetch;
        await expect(fetchBcnRefosOv(41.4, 2.2, { fetchImpl: nonOk })).resolves.toBeNull();
        await expect(fetchBcnRefosOv(41.4, 2.2, { fetchImpl: thrower })).resolves.toBeNull();
        await expect(fetchBcnRefosOv(41.4, 2.2, { fetchImpl: nonJson })).resolves.toBeNull();
    });

    it('rejects non-finite coordinates without contacting upstream', async () => {
        let called = 0;
        const fetchImpl = (async () => { called++; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
        await expect(fetchBcnRefosOv(Number.NaN, 2.2, { fetchImpl })).resolves.toBeNull();
        expect(called).toBe(0);
    });
});

describe('§BCN-REFOS-OV-PROXY handler', () => {
    beforeEach(() => __resetBcnRefosCache());

    it('answers the EXACT query string the shipped client emits, with the raw features', async () => {
        const fetchImpl = (async () => new Response(JSON.stringify(okBody), { status: 200 })) as unknown as typeof fetch;
        const h = makeBcnRefosOvHandler({ fetchImpl });
        const r = await invoke(h as never, CLIENT_QUERY);
        expect(r.status).toBe(200);
        const f = (r.body.features as typeof okBody.features)[0];
        expect(f.attributes.PLANTES).toBe('B+7');
        expect(f.attributes.CLAU).toBe('18hs');
        expect(f.geometry.rings[0]).toHaveLength(5);
    });

    it('400s without a usable point, on a non-allowlisted layer, and on an injected `where`', async () => {
        const h = makeBcnRefosOvHandler({ fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch });
        expect((await invoke(h as never, {})).status).toBe(400);
        expect((await invoke(h as never, { ...CLIENT_QUERY, layer: '3' })).status).toBe(400);
        expect((await invoke(h as never, { ...CLIENT_QUERY, where: "1=1 OR CODI_INE='08019'" })).status).toBe(400);
    });

    it('caches a HIT (planning geometry changes in years, and the service is free)', async () => {
        let calls = 0;
        const fetchImpl = (async () => { calls++; return new Response(JSON.stringify(okBody), { status: 200 }); }) as unknown as typeof fetch;
        const h = makeBcnRefosOvHandler({ fetchImpl });
        expect((await invoke(h as never, CLIENT_QUERY)).headers['x-bcn-refos-cache']).toBe('MISS');
        expect((await invoke(h as never, CLIENT_QUERY)).headers['x-bcn-refos-cache']).toBe('HIT');
        expect(calls).toBe(1);
    });

    it('§CONTEXT-DATA-HONESTY: a genuine EMPTY is 200 { features: [] }', async () => {
        // Measured: ~69 % of clau-18 land has NO OV footprint. That is a real legal answer — the PGM
        // points at a volumetric ordering that is not published here — and it must arrive as data.
        const fetchImpl = (async () => new Response(JSON.stringify({ features: [] }), { status: 200 })) as unknown as typeof fetch;
        const h = makeBcnRefosOvHandler({ fetchImpl });
        const r = await invoke(h as never, CLIENT_QUERY);
        expect(r.status).toBe(200);
        expect(r.body.features).toEqual([]);
    });

    it('§CONTEXT-DATA-HONESTY: an OUTAGE is 502 + non-cacheable — a DIFFERENT VALUE from empty', async () => {
        const fetchImpl = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
        const h = makeBcnRefosOvHandler({ fetchImpl });
        const r = await invoke(h as never, CLIENT_QUERY);
        expect(r.status).toBe(502); // NOT 200 — the client must say endpoint-unreachable, not no-feature
        expect(r.headers['cache-control']).toContain('no-store');
        expect(r.headers['x-bcn-refos-cache']).toBe('MISS-UNREACHABLE');
        expect(String(r.body.error)).toContain('NOT a statement');
    });

    it('never caches an outage — a later success is served, not a poisoned 502', async () => {
        let n = 0;
        const fetchImpl = (async () => {
            n++;
            if (n === 1) throw new Error('transient');
            return new Response(JSON.stringify(okBody), { status: 200 });
        }) as unknown as typeof fetch;
        const h = makeBcnRefosOvHandler({ fetchImpl });
        expect((await invoke(h as never, CLIENT_QUERY)).status).toBe(502);
        expect((await invoke(h as never, CLIENT_QUERY)).status).toBe(200);
    });
});
