// LANE ME-OPEN — QATAR · the CadastrePlots parcel leg, over the recorded LIVE body of 2026-09-02
// (transcript audit/intl-parcels/2026-09-02/transcripts-me-open/qa-cadastreplots-doha.json). Field
// names + the plot id are verbatim from the live query. NETWORK: none — an injected fetch replays it.

import { describe, it, expect } from 'vitest';
import {
    parseQaCadastrePlot,
    resolveQaCadastrePlotAtWgs84Point,
} from '../src/countryAdapters/qa/qaParcelProvider.js';

/** CadastrePlots feature for PIN 1010028 — attributes verbatim, ring trimmed to its first vertices. */
const QA_LIVE_BODY = {
    displayFieldName: 'PDSM',
    geometryType: 'esriGeometryPolygon',
    spatialReference: { wkid: 4326, latestWkid: 4326 },
    features: [
        {
            attributes: {
                OBJECTID: 604085461,
                GFCODE: 'PDGVCDST',
                CDST_KEY: 1010028,
                PIN: 1010028,
                PDAREA: 183494,
                GLOBALID: '{D9276B44-B5FC-4486-BCDA-A2C6B44C8D37}',
                PD_NO: 'PD/4693/2019',
            },
            geometry: {
                rings: [
                    [
                        [51.530399725757249, 25.290240935665718],
                        [51.530770243277324, 25.290268422477894],
                        [51.531000065762932, 25.290263014407273],
                        [51.532260778665716, 25.290110622596515],
                        [51.530399725757249, 25.290240935665718],
                    ],
                ],
            },
        },
    ],
};

function fakeFetch(status: number, body: unknown): typeof fetch {
    return (async () =>
        ({
            ok: status >= 200 && status < 300,
            status,
            text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
        }) as unknown as Response) as unknown as typeof fetch;
}

describe('QA CadastrePlots parser — the live PIN body', () => {
    it('parses PIN 1010028 + PD_NO + PDAREA + a WGS84 ring', () => {
        const p = parseQaCadastrePlot(QA_LIVE_BODY);
        expect(p).not.toBeNull();
        expect(p!.pin).toBe('1010028');
        expect(p!.cdstKey).toBe('1010028');
        expect(p!.pdNo).toBe('PD/4693/2019');
        expect(p!.plotAreaM2).toBe(183494);
        expect(p!.gfCode).toBe('PDGVCDST');
        expect(p!.globalId).toBe('{D9276B44-B5FC-4486-BCDA-A2C6B44C8D37}');
        expect(p!.ring!.length).toBeGreaterThanOrEqual(3);
        for (const pt of p!.ring!) {
            expect(Math.abs(pt.lat)).toBeLessThanOrEqual(90);
            expect(Math.abs(pt.lon)).toBeLessThanOrEqual(180);
            // Doha, not projected metres.
            expect(pt.lat).toBeGreaterThan(24);
            expect(pt.lat).toBeLessThan(27);
        }
        expect(p!.source).toBe('qa-gisqatar-cadastre-plots');
    });

    it('an empty features array is a no-plot (null), never a fabricated PIN', () => {
        expect(parseQaCadastrePlot({ features: [] })).toBeNull();
        expect(parseQaCadastrePlot({})).toBeNull();
    });
});

describe('QA resolveQaCadastrePlotAtWgs84Point — FetchOutcome classification', () => {
    it('found: a Doha click resolves the real plot via an injected fetch', async () => {
        const out = await resolveQaCadastrePlotAtWgs84Point(25.286, 51.531, { fetchImpl: fakeFetch(200, QA_LIVE_BODY) });
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.pin).toBe('1010028');
    });

    it('absent: 200 with no features → no-plot (durable)', async () => {
        const out = await resolveQaCadastrePlotAtWgs84Point(25.0, 51.0, { fetchImpl: fakeFetch(200, { features: [] }) });
        expect(out.status).toBe('absent');
    });

    it('transient: an ArcGIS error-object body (HTTP 200) is a failure, not "no plot here"', async () => {
        const out = await resolveQaCadastrePlotAtWgs84Point(25.286, 51.531, {
            fetchImpl: fakeFetch(200, { error: { code: 400, message: 'Invalid or missing input parameters.' } }),
        });
        expect(out.status).toBe('transient');
    });

    it('transient: HTTP 503 is a failure', async () => {
        const out = await resolveQaCadastrePlotAtWgs84Point(25.286, 51.531, { fetchImpl: fakeFetch(503, 'busy') });
        expect(out.status).toBe('transient');
    });
});
