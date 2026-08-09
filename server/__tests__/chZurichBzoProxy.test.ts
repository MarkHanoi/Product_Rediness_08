// §ZURICH-BZO-PROXY — tests for the City-of-Zürich BZO zone lookup (`/api/ch/zurich-bzo`).
//
// This route is the link that was MISSING: the client resolver (`resolveZurichBzoZone`) and the
// §L-616 computed-envelope dispatch both shipped without it, so every Zürich parcel resolved
// `endpoint-unreachable` in production. These tests pin the two properties that decide whether the
// route is trustworthy once wired:
//
//   1. THE AXIS HEDGE. `bzo_zone_v` is native EPSG:2056 (projected), where a bare 4326 bbox is the
//      documented silent-empty gotcha (Córdoba, then Murcia). Three bbox forms are tried and the
//      FIRST carrying a feature wins — so an axis-order disagreement degrades to a retry, not to a
//      false "no BZO zone at this parcel".
//   2. §CONTEXT-DATA-HONESTY. A transport FAILURE (every form errored) yields 502 and is NOT cached;
//      a well-formed EMPTY collection yields 200 and IS cached. Collapsing those two is the exact
//      defect this family of proxies exists to prevent.
//
// No live network — every test injects `fetchImpl`.

import { describe, expect, it, beforeEach } from 'vitest';
import {
    buildZurichBzoUrl,
    classifyZurichBzoGml,
    fetchZurichBzoAtPoint,
    makeZurichBzoHandler,
    wgs84ToLv95,
    __resetZurichBzoCache,
    zurichBzoCacheStats,
    CH_ZURICH_BZO_PATH,
    CH_ZURICH_BZO_TYPENAME,
} from '../jurisdiction/chZurichBzoProxy.js';

/** Zürich HB — the ZURICH-BZO-PROBE reference point. */
const PT = { lat: 47.377, lon: 8.54 };

const FEATURE_GML =
    '<wfs:FeatureCollection numberMatched="1" numberReturned="1">' +
    '<qgs:bzo_zone_v><qgs:typ>Z5</qgs:typ>' +
    '<qgs:rechtsvorschrift_url>https://oerebdocs.zh.ch/getDoc?docid=15172</qgs:rechtsvorschrift_url>' +
    '</qgs:bzo_zone_v></wfs:FeatureCollection>';

const EMPTY_GML = '<wfs:FeatureCollection numberMatched="0" numberReturned="0"/>';

const EXCEPTION_GML =
    '<ows:ExceptionReport><ows:Exception exceptionCode="InvalidParameterValue"/></ows:ExceptionReport>';

/** A minimal Express-ish response double. */
function fakeRes() {
    const headers: Record<string, string> = {};
    const state = { code: 200, body: null as { gml?: string | null; error?: string } | null };
    return {
        headers,
        state,
        setHeader(k: string, v: string) { headers[k] = v; },
        status(code: number) { state.code = code; return this; },
        json(payload: unknown) { state.body = payload as typeof state.body; return this; },
    };
}

describe('buildZurichBzoUrl — the three bbox forms (the native-projected-layer hedge)', () => {
    it('asks for the bzo_zone_v layer in every form', () => {
        for (const axis of ['wgs84-lonlat', 'wgs84-urn-latlon', 'lv95'] as const) {
            const url = buildZurichBzoUrl(PT.lat, PT.lon, axis);
            expect(url).toContain(`typeNames=${encodeURIComponent(CH_ZURICH_BZO_TYPENAME)}`);
            expect(url).toContain('request=GetFeature');
        }
    });

    it('emits lon/lat for the plain form and lat/lon for the AUTHORITY (urn) form', () => {
        const lonlat = decodeURIComponent(buildZurichBzoUrl(PT.lat, PT.lon, 'wgs84-lonlat'));
        const urn = decodeURIComponent(buildZurichBzoUrl(PT.lat, PT.lon, 'wgs84-urn-latlon'));
        // Plain EPSG:4326 → the historically common client order, longitude first.
        expect(lonlat).toMatch(/bbox=8\.5[0-9]*,47\.3/);
        // urn:ogc:def:crs → the authority order, latitude first. This is the Murcia fix.
        expect(urn).toMatch(/bbox=47\.3[0-9]*,8\.5/);
        expect(urn).toContain('urn:ogc:def:crs:EPSG::4326');
    });

    it('the LV95 form is issued in the layer NATIVE frame, so no axis ambiguity can apply', () => {
        const url = decodeURIComponent(buildZurichBzoUrl(PT.lat, PT.lon, 'lv95'));
        expect(url).toContain('EPSG:2056');
        expect(url).toContain('srsName=EPSG:2056');
        // Zürich HB is ≈ E 2 683 200 / N 1 247 900 in LV95; assert the box brackets it.
        expect(url).toMatch(/bbox=268\d{4},124\d{4},268\d{4},124\d{4},EPSG:2056/);
    });
});

describe('wgs84ToLv95 — the swisstopo approximate formulas', () => {
    // ⚠ WHAT THESE ASSERT, AND WHAT THEY DELIBERATELY DO NOT. There is no authoritative LV95
    // reference point available offline here, so pinning "Zürich HB = E 2 683 180 / N 1 247 900"
    // would be asserting a half-remembered landmark — a fabricated fixture wearing the authority of
    // a test. Instead these pin the THREE properties the bbox actually depends on: the result is in
    // the LV95 frame for Zürich, the scale is metres, and the orientation is not flipped. A conversion
    // that satisfies all three cannot mis-place a ±15 m query box, which is this function's only job.
    it('lands in the LV95 numeric frame for the City of Zürich', () => {
        const c = wgs84ToLv95(47.3779, 8.5403);
        // LV95 adds the +2 000 000 / +1 000 000 offsets to LV03; Zürich sits in these bands.
        expect(c.e).toBeGreaterThan(2_670_000);
        expect(c.e).toBeLessThan(2_695_000);
        expect(c.n).toBeGreaterThan(1_240_000);
        expect(c.n).toBeLessThan(1_260_000);
    });

    it('is METRE-scaled and correctly oriented (north is +n, east is +e)', () => {
        const base = wgs84ToLv95(47.3779, 8.5403);
        // 0.001° of latitude ≈ 111.2 m north.
        const north = wgs84ToLv95(47.3789, 8.5403);
        expect(north.n - base.n).toBeGreaterThan(100);
        expect(north.n - base.n).toBeLessThan(125);
        // 0.001° of longitude at 47.4° N ≈ 75.4 m east.
        const east = wgs84ToLv95(47.3779, 8.5413);
        expect(east.e - base.e).toBeGreaterThan(65);
        expect(east.e - base.e).toBeLessThan(85);
    });

    it('a ±15 m box in LV95 is genuinely ~30 m across (the query box is not degenerate)', () => {
        const c = wgs84ToLv95(47.3779, 8.5403);
        const url = decodeURIComponent(buildZurichBzoUrl(47.3779, 8.5403, 'lv95'));
        const nums = url.split('bbox=')[1]!.split(',');
        expect(Number(nums[2]) - Number(nums[0])).toBe(30);
        expect(Number(nums[3]) - Number(nums[1])).toBe(30);
        expect(Math.abs(Number(nums[0]) - (c.e - 15))).toBeLessThan(1);
    });
});

describe('classifyZurichBzoGml — FAILURE, EMPTY and FEATURE are three answers, not two', () => {
    it('recognises a bzo_zone_v feature', () => {
        expect(classifyZurichBzoGml(FEATURE_GML)).toBe('feature');
    });
    it('recognises a well-formed empty collection as a real (durable) answer', () => {
        expect(classifyZurichBzoGml(EMPTY_GML)).toBe('empty');
    });
    it('⚠ an OGC ExceptionReport is a FAILURE — never an "empty here"', () => {
        expect(classifyZurichBzoGml(EXCEPTION_GML)).toBe('failure');
    });
    it('absent / blank bodies are failures', () => {
        expect(classifyZurichBzoGml(null)).toBe('failure');
        expect(classifyZurichBzoGml('')).toBe('failure');
    });
});

describe('fetchZurichBzoAtPoint — the axis hedge', () => {
    it('stops at the FIRST form that carries a feature (no wasted calls)', async () => {
        const urls: string[] = [];
        const fetchImpl = (async (url: string) => {
            urls.push(url);
            return { ok: true, text: async () => FEATURE_GML };
        }) as unknown as typeof fetch;
        const res = await fetchZurichBzoAtPoint(PT.lat, PT.lon, { fetchImpl });
        expect(res.outcome).toBe('feature');
        expect(urls).toHaveLength(1);
    });

    it('⚠ THE GOTCHA: a wrong-axis EMPTY does not end the search — a later form still wins', async () => {
        // This is the whole reason three forms exist. A bare 4326 bbox against a native-2056 layer
        // lands off-map and returns numberReturned=0; treating that as "no zone here" would publish
        // a false absence on every Zürich parcel.
        const urls: string[] = [];
        const fetchImpl = (async (url: string) => {
            urls.push(url);
            const isNative = url.includes('EPSG%3A2056') || url.includes('EPSG:2056');
            return { ok: true, text: async () => (isNative ? FEATURE_GML : EMPTY_GML) };
        }) as unknown as typeof fetch;
        const res = await fetchZurichBzoAtPoint(PT.lat, PT.lon, { fetchImpl });
        expect(res.outcome).toBe('feature');
        expect(res.gml).toBe(FEATURE_GML);
        expect(urls).toHaveLength(3); // both 4326 forms tried, then the native frame won
    });

    it('every form genuinely empty ⇒ EMPTY (a durable answer), not a failure', async () => {
        const fetchImpl = (async () => ({ ok: true, text: async () => EMPTY_GML })) as unknown as typeof fetch;
        const res = await fetchZurichBzoAtPoint(PT.lat, PT.lon, { fetchImpl });
        expect(res.outcome).toBe('empty');
    });

    it('every form erroring ⇒ FAILURE, and no body is invented', async () => {
        const fetchImpl = (async () => { throw new Error('upstream down'); }) as unknown as typeof fetch;
        const res = await fetchZurichBzoAtPoint(PT.lat, PT.lon, { fetchImpl });
        expect(res.outcome).toBe('failure');
        expect(res.gml).toBeNull();
    });
});

describe('the handler — the honesty contract the client depends on', () => {
    beforeEach(() => { __resetZurichBzoCache(); });

    it('exposes the exact path the client resolver calls', () => {
        expect(CH_ZURICH_BZO_PATH).toBe('/api/ch/zurich-bzo');
    });

    it('200 { gml } on a resolved zone, and caches it', async () => {
        let calls = 0;
        const fetchImpl = (async () => { calls++; return { ok: true, text: async () => FEATURE_GML }; }) as unknown as typeof fetch;
        const handler = makeZurichBzoHandler({ fetchImpl });
        const res1 = fakeRes();
        await handler({ query: { lat: String(PT.lat), lon: String(PT.lon) } } as never, res1 as never);
        expect(res1.state.code).toBe(200);
        expect(res1.state.body!.gml).toContain('bzo_zone_v');
        const res2 = fakeRes();
        await handler({ query: { lat: String(PT.lat), lon: String(PT.lon) } } as never, res2 as never);
        expect(res2.headers['X-Zurich-Bzo-Cache']).toBe('HIT');
        expect(calls).toBe(1);
        expect(zurichBzoCacheStats().hits).toBe(1);
    });

    it('⚠ 502 (NOT a 200 empty) when every upstream form fails — and NEVER caches it', async () => {
        // The load-bearing property. A 200 `{ gml: null }` here would reach the client as
        // `no-zone-here`, i.e. a transient city outage rendered as a durable statement about the
        // parcel — and, cached for a week, an outage that outlives itself.
        const fetchImpl = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
        const handler = makeZurichBzoHandler({ fetchImpl });
        const res = fakeRes();
        await handler({ query: { lat: String(PT.lat), lon: String(PT.lon) } } as never, res as never);
        expect(res.state.code).toBe(502);
        expect(res.state.body!.error).toContain('NOT a statement');
        expect(res.headers['Cache-Control']).toContain('no-store');
        expect(zurichBzoCacheStats().size).toBe(0);
    });

    it('a genuine EMPTY answer is 200 and IS cached (it will not change on a retry)', async () => {
        const fetchImpl = (async () => ({ ok: true, text: async () => EMPTY_GML })) as unknown as typeof fetch;
        const handler = makeZurichBzoHandler({ fetchImpl });
        const res = fakeRes();
        await handler({ query: { lat: String(PT.lat), lon: String(PT.lon) } } as never, res as never);
        expect(res.state.code).toBe(200);
        expect(res.headers['X-Zurich-Bzo-Cache']).toBe('MISS-EMPTY');
        expect(zurichBzoCacheStats().size).toBe(1);
    });

    it('short-circuits outside the City-of-Zürich box without a municipal round-trip', async () => {
        let calls = 0;
        const fetchImpl = (async () => { calls++; return { ok: true, text: async () => FEATURE_GML }; }) as unknown as typeof fetch;
        const handler = makeZurichBzoHandler({ fetchImpl });
        const res = fakeRes();
        // Bern — Swiss, but not the City of Zürich.
        await handler({ query: { lat: '46.948', lon: '7.447' } } as never, res as never);
        expect(res.state.code).toBe(200);
        expect(res.state.body!.gml).toBeNull();
        expect(res.headers['X-Zurich-Bzo-Cache']).toBe('OUT-OF-BOUNDS');
        expect(calls).toBe(0);
    });

    it('400 on missing/bad coordinates', async () => {
        const handler = makeZurichBzoHandler({});
        const res = fakeRes();
        await handler({ query: {} } as never, res as never);
        expect(res.state.code).toBe(400);
    });
});
