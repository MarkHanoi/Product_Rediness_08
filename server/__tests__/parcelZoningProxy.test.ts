// §PARCEL-PROXY (L-380 P0) — /api/catastro/parcel same-origin proxy + GML→JSON tests.
//
// Pins the behaviours the "select a real parcel" feature depends on:
//   1. POINT → PARCEL — reverse-geocode (OVC) → refcat → GetParcel (WFS) → the
//      server NORMALISES GML to a WGS84 lat/lon ring + area + address.
//   2. NEAREST refcat wins — _Distancia returns several candidates; the smallest
//      `dis` is chosen (not document order).
//   3. CACHE by refcat — a repeat click serves the geometry WITHOUT a second WFS
//      call (the reverse-geocode still runs; only the geometry is cached).
//   4. NEVER crashes — no reference at the point / out-of-Spain / bad params →
//      200 { parcel: null } (client falls back to draw) or 400 for missing coords.

import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import {
    CATASTRO_PARCEL_PATH,
    makeCatastroParcelHandler,
    parseReverseGeocode,
    parseParcelGml,
    parcelCacheStats,
    __resetParcelCache,
} from '../parcelZoningProxy.js';

// ── Fixtures (shapes verified live 2026-07-17 against Catastro) ────────────────
// _Distancia list: two candidates; the NEARER (dis 7.03) is listed SECOND on
// purpose so the test proves min-distance selection, not document order.
const RCCOOR_XML = `<?xml version="1.0"?>
<consulta_coordenadas_distancias>
  <coordenadas_distancias><coordd><lpcd>
    <pcd><pc><pc1>0229721</pc1><pc2>DF3802G</pc2></pc><ldt>PS GRACIA 58 BARCELONA (BARCELONA)</ldt><dis>15.31</dis></pcd>
    <pcd><pc><pc1>0229720</pc1><pc2>DF3802G</pc2></pc><ldt>PS GRACIA 56 BARCELONA (BARCELONA)</ldt><dis>7.03</dis></pcd>
  </lpcd></coordd></coordenadas_distancias>
</consulta_coordenadas_distancias>`;

const RCCOOR_ERROR_XML = `<?xml version="1.0"?>
<consulta_coordenadas_distancias>
  <control><cucoor>0</cucoor><cuerr>1</cuerr></control>
  <lerr><err><cod>16</cod><des>PARA ESAS COORDENADAS NO HAY REFERENCIA DISPONIBLE</des></err></lerr>
</consulta_coordenadas_distancias>`;

// GML 3.2.1 MultiSurface; posList in EPSG:4326 = "lat lon" pairs; first == last (closed).
const GML_XML = `<?xml version="1.0"?>
<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:cp="http://inspire.ec.europa.eu/schemas/cp/4.0">
  <wfs:member><cp:CadastralParcel gml:id="ES.SDGC.CP.0229720DF3802G">
    <cp:areaValue uom="m2">1046</cp:areaValue>
    <cp:geometry><gml:MultiSurface srsName="http://www.opengis.net/def/crs/EPSG/0/4326" srsDimension="2">
      <gml:surfaceMember><gml:Surface><gml:patches><gml:PolygonPatch>
        <gml:exterior><gml:LinearRing>
          <gml:posList srsDimension="2">41.392927 2.165278 41.392908 2.165304 41.392889 2.165329 41.392800 2.165200 41.392927 2.165278</gml:posList>
        </gml:LinearRing></gml:exterior>
      </gml:PolygonPatch></gml:patches></gml:Surface></gml:surfaceMember>
    </gml:MultiSurface></cp:geometry>
  </cp:CadastralParcel></wfs:member>
</wfs:FeatureCollection>`;

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

// ── Pure parser unit tests ────────────────────────────────────────────────────
describe('§PARCEL-PROXY parsers', () => {
    it('parseReverseGeocode picks the NEAREST candidate (min dis) + concatenates refcat', () => {
        const rc = parseReverseGeocode(RCCOOR_XML);
        expect(rc).not.toBeNull();
        expect(rc!.refcat).toBe('0229720DF3802G'); // dis 7.03 wins over 15.31
        expect(rc!.address).toBe('PS GRACIA 56 BARCELONA (BARCELONA)');
    });

    it('parseReverseGeocode → null on the "no reference" error shape', () => {
        expect(parseReverseGeocode(RCCOOR_ERROR_XML)).toBeNull();
        expect(parseReverseGeocode('')).toBeNull();
    });

    it('parseParcelGml → WGS84 lat/lon ring (EPSG:4326 axis order) + areaValue', () => {
        const p = parseParcelGml(GML_XML);
        expect(p).not.toBeNull();
        expect(p!.areaM2).toBe(1046);
        expect(p!.ring.length).toBe(5); // 5 pairs incl. closing duplicate
        // First pair "41.392927 2.165278" → lat 41.39 (Barcelona), lon 2.16.
        expect(p!.ring[0]!.lat).toBeCloseTo(41.392927, 5);
        expect(p!.ring[0]!.lon).toBeCloseTo(2.165278, 5);
    });

    it('parseParcelGml → null when no posList / too few vertices', () => {
        expect(parseParcelGml('<gml:foo/>')).toBeNull();
        expect(parseParcelGml('')).toBeNull();
    });
});

// ── Route + cache integration ─────────────────────────────────────────────────
describe('§PARCEL-PROXY /api/catastro/parcel', () => {
    let server: Server, url: string;
    let rcCalls = 0, wfsCalls = 0;
    let rcResponse: string | null = RCCOOR_XML;

    const fakeFetch = (async (u: string) => {
        const s = String(u);
        if (s.includes('Consulta_RCCOOR')) {
            rcCalls++;
            return new Response(rcResponse ?? '', { status: rcResponse ? 200 : 500 });
        }
        if (s.includes('wfsCP')) {
            wfsCalls++;
            return new Response(GML_XML, { status: 200 });
        }
        return new Response('', { status: 404 });
    }) as unknown as typeof fetch;

    beforeAll(async () => {
        const app = express();
        const handler = makeCatastroParcelHandler({ fetchImpl: fakeFetch, timeoutMs: 2000 });
        app.get(CATASTRO_PARCEL_PATH, handler);
        const a = await listen(app);
        server = a.server; url = a.url;
    });
    afterAll(async () => { await close(server); });
    beforeEach(() => { __resetParcelCache(); rcCalls = 0; wfsCalls = 0; rcResponse = RCCOOR_XML; });

    const get = (lon: number, lat: number) =>
        fetch(`${url}${CATASTRO_PARCEL_PATH}?lon=${lon}&lat=${lat}`);

    it('point → normalised parcel { ring, refcat, areaM2, address, source }', async () => {
        const r = await get(2.16492, 41.3925);
        expect(r.status).toBe(200);
        const body = await r.json();
        expect(body.parcel).not.toBeNull();
        expect(body.parcel.refcat).toBe('0229720DF3802G');
        expect(body.parcel.areaM2).toBe(1046);
        expect(body.parcel.source).toBe('catastro');
        expect(body.parcel.ring[0].lat).toBeCloseTo(41.392927, 5);
        expect(rcCalls).toBe(1);
        expect(wfsCalls).toBe(1);
    });

    it('cache by refcat — repeat click does NOT re-fetch the WFS geometry', async () => {
        await get(2.16492, 41.3925);
        expect(wfsCalls).toBe(1);
        const r2 = await get(2.16492, 41.3925);
        const body = await r2.json();
        expect(body.parcel.refcat).toBe('0229720DF3802G');
        expect(wfsCalls).toBe(1); // geometry served from cache
        expect(parcelCacheStats().hits).toBe(1);
    });

    it('no reference at the point → 200 { parcel: null } (never crashes)', async () => {
        rcResponse = RCCOOR_ERROR_XML;
        const r = await get(2.16492, 41.3925);
        expect(r.status).toBe(200);
        const body = await r.json();
        expect(body.parcel).toBeNull();
        expect(wfsCalls).toBe(0);
    });

    it('out-of-Spain point → 200 { parcel: null } without any upstream call', async () => {
        const r = await get(-74.006, 40.7128); // New York
        expect(r.status).toBe(200);
        const body = await r.json();
        expect(body.parcel).toBeNull();
        expect(rcCalls).toBe(0);
        expect(wfsCalls).toBe(0);
    });

    it('missing/NaN coords → 400', async () => {
        const r = await fetch(`${url}${CATASTRO_PARCEL_PATH}?lon=abc`);
        expect(r.status).toBe(400);
    });
});
