// LANE ME-OPEN — ISRAEL · the govmap parcel leg, over the recorded LIVE body of 2026-09-02
// (transcript audit/intl-parcels/2026-09-02/transcripts-me-open/il-govmap-telaviv.json). Fixtures
// replicate the exact Hebrew field names + values observed live, so a parser that stops
// understanding the real shape fails here. NETWORK: none — an injected fetch replays the body.

import { describe, it, expect } from 'vitest';
import {
    parseIlGovmapParcel,
    resolveIlParcelAtWgs84Point,
} from '../src/countryAdapters/il/ilParcelProvider.js';

/** The PARCEL_ALL identify body for gush 6952 / helka 139, fields + geometry verbatim from the probe. */
const IL_LIVE_BODY = {
    errorCode: 0,
    status: 0,
    message: null,
    data: [
        {
            LayerName: 'PARCEL_ALL',
            LayerCaption: 'חלקות',
            LayerType: 0,
            Result: [
                {
                    tabs: [
                        {
                            tabCaption: null,
                            fields: [
                                { FieldName: 'מספר גוש', FieldValue: '6952', FieldType: 1 },
                                { FieldName: 'תת גוש', FieldValue: 'אין מידע', FieldType: 1 },
                                { FieldName: 'חלקה', FieldValue: '139', FieldType: 1 },
                                { FieldName: 'שטח רשום (מ"ר)', FieldValue: '7404', FieldType: 1 },
                                { FieldName: 'סטטוס', FieldValue: 'מוסדר', FieldType: 1 },
                                {
                                    FieldName: 'הערה',
                                    FieldValue:
                                        'הנתון שטח רשום כאן אינו מהווה אסמכתה. לאסמכתה חוקית לשטח הרשום של חלקה יש לפנות ללשכות המרשם במשרד המשפטים.',
                                    FieldType: 1,
                                },
                            ],
                        },
                    ],
                    objectId: 33689,
                    centroid: { y: 665120.5938, x: 179256.4375, geometryType: 'point' },
                    extent: { xmin: 179182.4844, ymin: 665030.8125, xmax: 179330.3906, ymax: 665210.375 },
                },
            ],
        },
    ],
};

/** An injected fetch that replays a fixed body with a chosen HTTP status. */
function fakeFetch(status: number, body: unknown): typeof fetch {
    return (async () =>
        ({
            ok: status >= 200 && status < 300,
            status,
            text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
        }) as unknown as Response) as unknown as typeof fetch;
}

describe('IL govmap parser — the live gush/helka body', () => {
    it('parses gush 6952 / helka 139 + registered area + status, and drops the "אין מידע" sub-block', () => {
        const p = parseIlGovmapParcel(IL_LIVE_BODY);
        expect(p).not.toBeNull();
        expect(p!.gush).toBe('6952');
        expect(p!.helka).toBe('139');
        expect(p!.subBlock).toBeNull(); // "אין מידע" is the source's UNKNOWN sentinel → null
        expect(p!.registeredAreaM2).toBe(7404);
        expect(p!.status).toBe('מוסדר');
        expect(p!.objectId).toBe(33689);
        expect(p!.source).toBe('il-govmap-parcel-all');
    });

    it('carries the registrar disclaimer VERBATIM (SURVEYED ≠ NORMATIVE — area is not a legal figure)', () => {
        const p = parseIlGovmapParcel(IL_LIVE_BODY)!;
        expect(p.areaDisclaimer).toContain('אינו מהווה אסמכתה');
    });

    it('projects the ITM centroid + extent back to WGS84 (Tel Aviv), never leaving ITM metres', () => {
        const p = parseIlGovmapParcel(IL_LIVE_BODY)!;
        expect(p.centroidWgs84).not.toBeNull();
        expect(p.centroidWgs84!.lat).toBeCloseTo(32.0783, 3);
        expect(p.centroidWgs84!.lon).toBeCloseTo(34.778, 3);
        expect(p.bboxWgs84).not.toBeNull();
        expect(p.bboxWgs84!.minLat).toBeLessThan(p.bboxWgs84!.maxLat);
        expect(p.bboxWgs84!.minLon).toBeLessThan(p.bboxWgs84!.maxLon);
    });

    it('an empty Result is a no-parcel (null), never a fabricated identity', () => {
        const empty = { errorCode: 0, data: [{ LayerName: 'PARCEL_ALL', Result: [] }] };
        expect(parseIlGovmapParcel(empty)).toBeNull();
        expect(parseIlGovmapParcel({ data: [] })).toBeNull();
        expect(parseIlGovmapParcel({})).toBeNull();
    });
});

describe('IL resolveIlParcelAtWgs84Point — FetchOutcome classification', () => {
    it('found: a Tel-Aviv click resolves the real parcel via an injected fetch', async () => {
        const out = await resolveIlParcelAtWgs84Point(32.0783, 34.778, { fetchImpl: fakeFetch(200, IL_LIVE_BODY) });
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.gush).toBe('6952');
        expect(out.value.helka).toBe('139');
    });

    it('absent: govmap answers 200 with an empty Result → no-parcel (durable), not a failure', async () => {
        const out = await resolveIlParcelAtWgs84Point(31.5, 34.9, {
            fetchImpl: fakeFetch(200, { errorCode: 0, data: [{ LayerName: 'PARCEL_ALL', Result: [] }] }),
        });
        expect(out.status).toBe('absent');
    });

    it('transient: a govmap errorCode ≠ 0 is a failure, never "no parcel here"', async () => {
        const out = await resolveIlParcelAtWgs84Point(32.0783, 34.778, {
            fetchImpl: fakeFetch(200, { errorCode: 5, status: 1, data: [] }),
        });
        expect(out.status).toBe('transient');
    });

    it('transient: HTTP 500 is a failure', async () => {
        const out = await resolveIlParcelAtWgs84Point(32.0783, 34.778, { fetchImpl: fakeFetch(500, 'err') });
        expect(out.status).toBe('transient');
    });
});
