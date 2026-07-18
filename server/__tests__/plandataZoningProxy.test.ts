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
    let wfsBody = LOKALPLAN_GEOJSON;

    const fakeFetch = (async (u: string) => {
        const s = String(u);
        if (s.includes('geoserver.plandata.dk')) {
            wfsCalls++;
            // Only the lokalplan layer returns a plan (proves layer preference).
            if (s.includes('lokalplan')) return new Response(wfsBody, { status: 200 });
            return new Response(EMPTY_GEOJSON, { status: 200 });
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
    beforeEach(() => { __resetZoningCache(); wfsCalls = 0; wfsBody = LOKALPLAN_GEOJSON; });

    const get = (lat: number, lon: number) =>
        fetch(`${url}${PLANDATA_ZONING_PATH}?lat=${lat}&lon=${lon}`);

    it('Copenhagen point → 200 { zoning: { layer, properties } }', async () => {
        const r = await get(55.6761, 12.5683);
        expect(r.status).toBe(200);
        const body = await r.json();
        expect(body.zoning).not.toBeNull();
        expect(body.zoning.layer).toBe('lokalplan');
        expect(body.zoning.properties.maxbygnhjd).toBe(24);
        expect(wfsCalls).toBeGreaterThanOrEqual(1);
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
        wfsBody = EMPTY_GEOJSON; // even the lokalplan layer is empty
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
