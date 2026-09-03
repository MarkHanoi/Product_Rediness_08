// LANE ME-OPEN — TURKEY · the TKGM parcel leg, over the recorded LIVE Feature of 2026-09-02
// (transcript audit/intl-parcels/2026-09-02/transcripts-me-open/tr-tkgm-istanbul-kadikoy.json).
// Property names + values are verbatim from the live GET. NETWORK: none — an injected fetch replays.

import { describe, it, expect } from 'vitest';
import {
    parseTrParselFeature,
    extractStoreyHintFromNitelik,
    resolveTrParselAtWgs84Point,
} from '../src/countryAdapters/tr/trParcelProvider.js';

/** The TKGM GeoJSON Feature for ada 3106 / parsel 258 (İstanbul/Kadıköy), verbatim from the probe. */
const TR_LIVE_FEATURE = {
    type: 'Feature',
    geometry: {
        type: 'Polygon',
        coordinates: [
            [
                [29.05752, 40.98208],
                [29.05734, 40.9818],
                [29.05761, 40.98171],
                [29.05773, 40.98198],
                [29.05771, 40.98202],
                [29.05752, 40.98208],
            ],
        ],
    },
    properties: {
        ilceAd: 'Kadiköy',
        mevkii: 'Mustafa Mazhar',
        ilId: 56,
        durum: '1',
        ilceId: 521,
        zeminKmdurum: 'Kat Mülkiyet',
        parselNo: '258',
        mahalleAd: 'Tuğlaci Başi',
        ozet: 'Tuğlaci Başi-3106/258',
        alan: '816.27',
        adaNo: '3106',
        nitelik: '11 Katli Betonarme Mesken,Ofis,Işyeri Ve Arsasi',
        ilAd: 'Istanbul',
        mahalleId: 147766,
        pafta: '151',
    },
};

function fakeFetch(status: number, body: unknown): typeof fetch {
    return (async () =>
        ({
            ok: status >= 200 && status < 300,
            status,
            text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
        }) as unknown as Response) as unknown as typeof fetch;
}

describe('TR TKGM parser — the live ada/parsel Feature', () => {
    it('parses ada 3106 / parsel 258 + province/district/quarter + area + sheet + a WGS84 ring', () => {
        const p = parseTrParselFeature(TR_LIVE_FEATURE);
        expect(p).not.toBeNull();
        expect(p!.adaNo).toBe('3106');
        expect(p!.parselNo).toBe('258');
        expect(p!.il).toBe('Istanbul');
        expect(p!.ilce).toBe('Kadiköy');
        expect(p!.mahalle).toBe('Tuğlaci Başi');
        expect(p!.alanM2).toBeCloseTo(816.27, 2);
        expect(p!.pafta).toBe('151');
        expect(p!.zeminKmdurum).toBe('Kat Mülkiyet');
        expect(p!.ring!.length).toBeGreaterThanOrEqual(3);
        for (const pt of p!.ring!) {
            expect(pt.lat).toBeGreaterThan(40);
            expect(pt.lat).toBeLessThan(41);
            expect(pt.lon).toBeGreaterThan(28);
            expect(pt.lon).toBeLessThan(30);
        }
        expect(p!.source).toBe('tr-tkgm-parsel');
    });

    it('extracts the storey signal from `nitelik` ("11 Katli" → 11) as a HINT, with the raw text kept', () => {
        const p = parseTrParselFeature(TR_LIVE_FEATURE)!;
        expect(p.storeyHint).toBe(11);
        expect(p.nitelik).toBe('11 Katli Betonarme Mesken,Ofis,Işyeri Ve Arsasi');
    });

    it('the storey extractor is conservative: no count where the text carries none', () => {
        expect(extractStoreyHintFromNitelik('Arsa')).toBeNull();
        expect(extractStoreyHintFromNitelik('Kargir Ev')).toBeNull();
        expect(extractStoreyHintFromNitelik('5 Katli Kargir Apartman')).toBe(5);
        expect(extractStoreyHintFromNitelik(null)).toBeNull();
    });

    it('a body without ada/parsel is not a parcel (null), never a fabricated key', () => {
        expect(parseTrParselFeature({ properties: { ilAd: 'Istanbul' } })).toBeNull();
        expect(parseTrParselFeature({})).toBeNull();
    });
});

describe('TR resolveTrParselAtWgs84Point — FetchOutcome classification', () => {
    it('found: a Kadıköy click resolves ada 3106 / parsel 258 via an injected fetch', async () => {
        const out = await resolveTrParselAtWgs84Point(40.9819, 29.0576, { fetchImpl: fakeFetch(200, TR_LIVE_FEATURE) });
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.adaNo).toBe('3106');
        expect(out.value.parselNo).toBe('258');
        expect(out.value.storeyHint).toBe(11);
    });

    it('absent: the SEMANTIC 404 "Parsel Bulunamadı" is no-parcel (durable), NOT a fence/failure', async () => {
        const out = await resolveTrParselAtWgs84Point(41.0369, 28.9855, {
            fetchImpl: fakeFetch(404, { Message: 'Parsel Bulunamadı: Enlem = 41,0369 - Boylam=28,9855' }),
        });
        expect(out.status).toBe('absent');
    });

    it('transient: HTTP 502 is a failure', async () => {
        const out = await resolveTrParselAtWgs84Point(40.9819, 29.0576, { fetchImpl: fakeFetch(502, 'bad gateway') });
        expect(out.status).toBe('transient');
    });

    it('transient: a non-finite click never queries the origin — it refuses', async () => {
        const out = await resolveTrParselAtWgs84Point(Number.NaN, 29, { fetchImpl: fakeFetch(200, TR_LIVE_FEATURE) });
        expect(out.status).toBe('transient');
    });
});
