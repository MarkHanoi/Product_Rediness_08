// LANE ME-OPEN — ISRAEL · the ITM (EPSG:2039) ↔ WGS84 transform, checked against the govmap LIVE
// response of 2026-09-02 (the INDEPENDENT authority: govmap published the ITM centroid, and this
// module must agree with it). Transcript:
// audit/intl-parcels/2026-09-02/transcripts-me-open/il-govmap-telaviv.json.

import { describe, it, expect } from 'vitest';
import { wgs84ToItm, itmToWgs84, ITM_PARAMS } from '../src/countryAdapters/il/ilItm.js';

describe('IL ITM ↔ WGS84 (EPSG:2039)', () => {
    it('the projection definition holds: forward(natural origin) === the false easting/northing', () => {
        const en = wgs84ToItm(ITM_PARAMS.lat0, ITM_PARAMS.lon0);
        expect(en).not.toBeNull();
        expect(en!.east).toBeCloseTo(ITM_PARAMS.falseEasting, 3);
        expect(en!.north).toBeCloseTo(ITM_PARAMS.falseNorthing, 3);
    });

    it('inverts the LIVE govmap centroid (gush 6952 / helka 139) to a real Tel-Aviv coordinate', () => {
        // ITM centroid copied VERBATIM from the live IdentifyByXY body.
        const g = itmToWgs84(179256.4375, 665120.5938);
        expect(g).not.toBeNull();
        // South Tel Aviv (Florentin) — matches the govmap-served parcel location.
        expect(g!.lat).toBeCloseTo(32.078293, 5);
        expect(g!.lon).toBeCloseTo(34.777957, 5);
    });

    it('round-trips the live centroid to sub-millimetre', () => {
        const g = itmToWgs84(179256.4375, 665120.5938)!;
        const en = wgs84ToItm(g.lat, g.lon)!;
        expect(en.east).toBeCloseTo(179256.4375, 3);
        expect(en.north).toBeCloseTo(665120.5938, 3);
    });

    it('the me-sweep query point (ITM 179254,665111) inverts into the Tel-Aviv metropolitan area', () => {
        const g = itmToWgs84(179254, 665111)!;
        expect(g.lat).toBeGreaterThan(32.0);
        expect(g.lat).toBeLessThan(32.15);
        expect(g.lon).toBeGreaterThan(34.7);
        expect(g.lon).toBeLessThan(34.85);
    });

    it('is total: non-finite input returns null, never throws or fabricates a coordinate', () => {
        expect(wgs84ToItm(Number.NaN, 34)).toBeNull();
        expect(wgs84ToItm(32, Number.POSITIVE_INFINITY)).toBeNull();
        expect(itmToWgs84(Number.NaN, 0)).toBeNull();
        expect(() => wgs84ToItm(Number.NaN, Number.NaN)).not.toThrow();
    });
});
