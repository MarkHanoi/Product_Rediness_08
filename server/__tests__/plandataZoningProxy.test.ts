// §PLANDATA-ZONING-PROXY (L-399a) — /api/plandata/zoning same-origin keyless proxy tests.
//
// Pins the behaviours the DK real-zoning path depends on:
//   1. POINT → PLAN — the server queries Plandata WFS (GeoJSON) and returns the
//      winning plan feature's RAW attributes under `{ zoning: { layer, properties } }`.
//   2. LAYER PREFERENCE — a `lokalplan` hit wins over the broader `kommuneplanramme`.
//   3. CACHE by coordinate — a repeat click serves WITHOUT a second WFS call.
//   4. NEVER crashes — out-of-Denmark / no plan / upstream failure → 200
//      { zoning: null } (client falls back to the estimated default), 400 for bad coords.

import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import {
    PLANDATA_ZONING_PATH,
    makePlandataZoningHandler,
    pickFirstFeatureProps,
    buildPlandataWfsUrl,
    hasUsableDimension,
    isBindingFootprint,
    zoningCacheStats,
    __resetZoningCache,
} from '../plandataZoningProxy.js';

// A Plandata WFS GeoJSON FeatureCollection (field names verified via DescribeFeatureType).
const LOKALPLAN_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: {
                planid: 3041234,
                plannr: '123',
                plannavn: 'Lokalplan 123 Indre By',
                anvendelsegenerel: 'Boligområde',
                bebygpct: 110,
                maxbygnhjd: 24,
                maxetager: 6,
                doklink: 'https://dokument.plandata.dk/20_3041234_APPROVED.pdf',
                zonestatus: 'Byzone',
            },
            geometry: { type: 'Polygon', coordinates: [[[12.56, 55.67], [12.57, 55.67], [12.57, 55.68], [12.56, 55.68], [12.56, 55.67]]] },
        },
    ],
});
const EMPTY_GEOJSON = JSON.stringify({ type: 'FeatureCollection', features: [] });

// A byggefelt (building field): the tightest layer. A BINDING footprint
// (bygkunifelt=true & bygvejledende=false) that also caps its own height/storeys.
const BYGGEFELT_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: {
                lp_plannavn: 'Birkerød Bymidte',
                lp_plannr: 'LP 92',
                lokplan_id: 1218206,
                delnr: 'A',
                maxbygnhjd: 8,
                maxetager: 2,
                bygkunifelt: true,
                bygvejledende: false,
                doklink: 'https://dokument.plandata.dk/20_1218206.pdf',
            },
            geometry: { type: 'MultiPolygon', coordinates: [[[[12.56, 55.67], [12.561, 55.67], [12.561, 55.671], [12.56, 55.671], [12.56, 55.67]]]] },
        },
    ],
});
// A byggefelt that is only an ADVISORY placement guide (bygvejledende), with no
// dimension — it must NOT shadow a richer lower layer's identity/numbers.
const BYGGEFELT_ADVISORY_NODIM_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: { lp_plannavn: 'Vejledende felt', lp_plannr: 'LP 7', bygkunifelt: false, bygvejledende: true },
            geometry: { type: 'MultiPolygon', coordinates: [[[[12.56, 55.67], [12.561, 55.67], [12.561, 55.671], [12.56, 55.671], [12.56, 55.67]]]] },
        },
    ],
});

// A sub-area (delområde) feature: plan identity under `lp_*`, its own dimensions.
const DELOMRAADE_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: {
                lp_plannavn: 'Lokalplan 410 Ørestad Syd',
                lp_plannr: '410',
                delnr: '3',
                anvendelsegenerel: 'Blandet bolig og erhverv',
                bebygpct: 185,
                maxbygnhjd: 42,
                maxetager: 12,
                doklink: 'https://dokument.plandata.dk/20_410_delomr3.pdf',
                zonestatus: 'Byzone',
            },
            geometry: { type: 'Polygon', coordinates: [[[12.56, 55.67], [12.57, 55.67], [12.57, 55.68], [12.56, 55.68], [12.56, 55.67]]] },
        },
    ],
});
// A local plan that publishes NO dimensional field (identity + use only) — it must
// NOT shadow a dimensioned kommuneplanramme beneath it (§USABLE-FALLBACK).
const LOKALPLAN_NODIM_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: { plannavn: 'Lokalplan uden tal', anvendelsegenerel: 'Boligområde', doklink: 'https://dokument.plandata.dk/nodim.pdf' },
            geometry: { type: 'Polygon', coordinates: [[[12.56, 55.67], [12.57, 55.67], [12.57, 55.68], [12.56, 55.68], [12.56, 55.67]]] },
        },
    ],
});
const RAMME_GEOJSON = JSON.stringify({
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: { plannavn: 'Ramme 4.B.12', bebygpct: 60, maxbygnhjd: 18, anvendelsegenerel: 'Boligområde', doklink: 'https://dokument.plandata.dk/ramme.pdf', zonestatus: 'Byzone' },
            geometry: { type: 'Polygon', coordinates: [[[12.56, 55.67], [12.57, 55.67], [12.57, 55.68], [12.56, 55.68], [12.56, 55.67]]] },
        },
    ],
});

/** Which Plandata layer a WFS URL targets (delområde substring contains 'lokalplan'
 *  so test it FIRST). */
function layerOfUrl(u: string): 'byggefelt' | 'delomraade' | 'lokalplan' | 'kommuneplanramme' | 'other' {
    if (u.includes('byggefelt')) return 'byggefelt';
    if (u.includes('lokalplandelomraade')) return 'delomraade';
    if (u.includes('theme_pdk_lokalplan_vedtaget')) return 'lokalplan';
    if (u.includes('kommuneplanramme')) return 'kommuneplanramme';
    return 'other';
}

function listen(app: express.Express): Promise<{ server: Server; url: string }> {
    return new Promise((resolve) => {
        const server = createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as AddressInfo;
            resolve({ server, url: `http://127.0.0.1:${port}` });
        });
    });
}
const close = (s: Server) => new Promise<void>((r) => s.close(() => r()));

// ── Pure helper unit tests ────────────────────────────────────────────────────
describe('§PLANDATA-ZONING-PROXY helpers', () => {
    it('pickFirstFeatureProps returns the first feature attributes, or null', () => {
        const props = pickFirstFeatureProps(LOKALPLAN_GEOJSON);
        expect(props).not.toBeNull();
        expect(props!.plannavn).toBe('Lokalplan 123 Indre By');
        expect(props!.maxbygnhjd).toBe(24);
        expect(pickFirstFeatureProps(EMPTY_GEOJSON)).toBeNull();
        expect(pickFirstFeatureProps('')).toBeNull();
        expect(pickFirstFeatureProps('not json')).toBeNull();
    });

    it('hasUsableDimension — true iff a real height/storeys/FAR field is present (L-608)', () => {
        expect(hasUsableDimension({ maxbygnhjd: 24 })).toBe(true);
        expect(hasUsableDimension({ maxetager: 6 })).toBe(true);
        expect(hasUsableDimension({ bebygpct: 110 })).toBe(true);
        expect(hasUsableDimension({ maxbygnhjd: '24.0' })).toBe(true); // string-coerced
        // Identity / use only → NOT usable (must fall through to a richer layer).
        expect(hasUsableDimension({ plannavn: 'P', anvendelsegenerel: 'Boligområde' })).toBe(false);
        expect(hasUsableDimension({ maxbygnhjd: 0 })).toBe(false); // 0 is not a volume
        expect(hasUsableDimension({ maxbygnhjd: null, maxetager: '' })).toBe(false);
        expect(hasUsableDimension(null)).toBe(false);
    });

    it('isBindingFootprint — true ONLY for a bygkunifelt, non-vejledende byggefelt (L-609)', () => {
        expect(isBindingFootprint({ bygkunifelt: true, bygvejledende: false })).toBe(true);
        expect(isBindingFootprint({ bygkunifelt: 'true', bygvejledende: 'false' })).toBe(true); // string-coerced
        // Advisory / illustrative fields are NOT caps.
        expect(isBindingFootprint({ bygkunifelt: true, bygvejledende: true })).toBe(false);
        expect(isBindingFootprint({ bygkunifelt: false, bygvejledende: false })).toBe(false);
        // Unknown bindingness is treated as NOT binding (never assume a cap).
        expect(isBindingFootprint({ maxbygnhjd: 8 })).toBe(false);
        expect(isBindingFootprint(null)).toBe(false);
    });

    it('buildPlandataWfsUrl builds a bbox GetFeature URL (both axis orders)', () => {
        const lonlat = buildPlandataWfsUrl('pdk:theme_pdk_lokalplan_vedtaget', 12.5683, 55.6761, 'lonlat');
        expect(lonlat).toContain('geoserver.plandata.dk/geoserver/wfs');
        expect(lonlat).toContain('request=GetFeature');
        expect(lonlat).toContain('outputFormat=application%2Fjson');
        expect(lonlat).toContain('bbox=');
        const latlon = buildPlandataWfsUrl('pdk:theme_pdk_lokalplan_vedtaget', 12.5683, 55.6761, 'latlon');
        expect(latlon).not.toBe(lonlat); // axis order swapped
    });
});

// ── Route + cache integration ─────────────────────────────────────────────────
describe('§PLANDATA-ZONING-PROXY /api/plandata/zoning', () => {
    let server: Server, url: string;
    let wfsCalls = 0;
    // Per-layer response bodies (mutable per test). Default: only the whole
    // lokalplan carries a plan (the classic layer-preference case).
    let byggefeltBody = EMPTY_GEOJSON;
    let deloBody = EMPTY_GEOJSON;
    let lokalplanBody = LOKALPLAN_GEOJSON;
    let rammeBody = EMPTY_GEOJSON;

    const fakeFetch = (async (u: string) => {
        const s = String(u);
        if (s.includes('geoserver.plandata.dk')) {
            wfsCalls++;
            switch (layerOfUrl(s)) {
                case 'byggefelt': return new Response(byggefeltBody, { status: 200 });
                case 'delomraade': return new Response(deloBody, { status: 200 });
                case 'lokalplan': return new Response(lokalplanBody, { status: 200 });
                case 'kommuneplanramme': return new Response(rammeBody, { status: 200 });
                default: return new Response(EMPTY_GEOJSON, { status: 200 });
            }
        }
        return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    beforeAll(async () => {
        const app = express();
        const handler = makePlandataZoningHandler({ fetchImpl: fakeFetch, timeoutMs: 2000 });
        app.get(PLANDATA_ZONING_PATH, handler);
        const a = await listen(app);
        server = a.server; url = a.url;
    });
    afterAll(async () => { await close(server); });
    beforeEach(() => {
        __resetZoningCache();
        wfsCalls = 0;
        byggefeltBody = EMPTY_GEOJSON;
        deloBody = EMPTY_GEOJSON;
        lokalplanBody = LOKALPLAN_GEOJSON;
        rammeBody = EMPTY_GEOJSON;
    });

    const get = (lat: number, lon: number) =>
        fetch(`${url}${PLANDATA_ZONING_PATH}?lat=${lat}&lon=${lon}`);

    it('Copenhagen point (only the whole lokalplan has data) → 200 { layer: lokalplan }', async () => {
        const r = await get(55.6761, 12.5683);
        expect(r.status).toBe(200);
        const body = await r.json();
        expect(body.zoning).not.toBeNull();
        expect(body.zoning.layer).toBe('lokalplan');
        expect(body.zoning.properties.maxbygnhjd).toBe(24);
        expect(wfsCalls).toBeGreaterThanOrEqual(1);
    });

    it('L-608 — a dimensioned delområde WINS over the whole plan (most-specific)', async () => {
        deloBody = DELOMRAADE_GEOJSON; // sub-area carries the real numbers
        const r = await get(55.6761, 12.5683);
        const body = await r.json();
        expect(body.zoning.layer).toBe('lokalplandelomraade');
        expect(body.zoning.properties.maxbygnhjd).toBe(42);
        expect(body.zoning.properties.delnr).toBe('3');
    });

    it('L-608 §USABLE-FALLBACK — a dimensionless lokalplan does NOT shadow a dimensioned ramme', async () => {
        deloBody = EMPTY_GEOJSON;
        lokalplanBody = LOKALPLAN_NODIM_GEOJSON; // identity/use only, no numbers
        rammeBody = RAMME_GEOJSON; // the framework HAS numbers
        const r = await get(55.6761, 12.5683);
        const body = await r.json();
        expect(body.zoning.layer).toBe('kommuneplanramme');
        expect(body.zoning.properties.maxbygnhjd).toBe(18);
    });

    it('L-608 — when NO layer has a dimension, the most-specific feature is still returned (identity + citation)', async () => {
        deloBody = EMPTY_GEOJSON;
        lokalplanBody = LOKALPLAN_NODIM_GEOJSON;
        rammeBody = EMPTY_GEOJSON;
        const r = await get(55.6761, 12.5683);
        const body = await r.json();
        expect(body.zoning).not.toBeNull();
        expect(body.zoning.layer).toBe('lokalplan');
        expect(body.zoning.properties.doklink).toBe('https://dokument.plandata.dk/nodim.pdf');
    });

    it('L-609 — a dimensioned byggefelt WINS over the whole plan (tightest instrument)', async () => {
        byggefeltBody = BYGGEFELT_GEOJSON; // building field carries its own height/storeys
        lokalplanBody = LOKALPLAN_GEOJSON; // and there is a whole plan beneath it
        const r = await get(55.6761, 12.5683);
        const body = await r.json();
        expect(body.zoning.layer).toBe('byggefelt');
        expect(body.zoning.properties.maxbygnhjd).toBe(8);
        // The bindingness flags ride along for the downstream footprint→coverage step.
        expect(body.zoning.properties.bygkunifelt).toBe(true);
        expect(body.zoning.properties.bygvejledende).toBe(false);
    });

    it('L-609 — a dimensionless ADVISORY byggefelt does NOT shadow the plan beneath it', async () => {
        byggefeltBody = BYGGEFELT_ADVISORY_NODIM_GEOJSON; // vejledende, no number
        lokalplanBody = LOKALPLAN_GEOJSON; // the real numbers are here
        const r = await get(55.6761, 12.5683);
        const body = await r.json();
        expect(body.zoning.layer).toBe('lokalplan');
        expect(body.zoning.properties.maxbygnhjd).toBe(24);
    });

    it('cache by coordinate — repeat click does NOT re-fetch the WFS', async () => {
        await get(55.6761, 12.5683);
        const first = wfsCalls;
        const r2 = await get(55.6761, 12.5683);
        const body = await r2.json();
        expect(body.zoning.properties.plannavn).toBe('Lokalplan 123 Indre By');
        expect(wfsCalls).toBe(first); // served from cache
        expect(zoningCacheStats().hits).toBe(1);
    });

    it('no plan at the point → 200 { zoning: null } (never crashes)', async () => {
        deloBody = lokalplanBody = rammeBody = EMPTY_GEOJSON; // every layer empty
        const r = await get(55.6761, 12.5683);
        expect(r.status).toBe(200);
        const body = await r.json();
        expect(body.zoning).toBeNull();
    });

    it('out-of-Denmark point → 200 { zoning: null } without any upstream call', async () => {
        const r = await get(41.3874, 2.1686); // Barcelona
        expect(r.status).toBe(200);
        const body = await r.json();
        expect(body.zoning).toBeNull();
        expect(wfsCalls).toBe(0);
    });

    it('missing/NaN coords → 400', async () => {
        const r = await fetch(`${url}${PLANDATA_ZONING_PATH}?lat=abc`);
        expect(r.status).toBe(400);
    });
});
