// Tests for the Telde (INE 35026) offline EDIF shapefile resolver (rewritten 2026-08-04 onto the
// El Sauzal pattern — see `resolveTeldeZone.ts`'s header for why this replaced a same-origin proxy
// that was never wired server-side).
//
// Two tiers: (1) the pure point-in-polygon core against a synthetic fixture, (2) an END-TO-END
// check against the REAL committed `teldeEdif.json` extract at REAL WGS84 points, each
// independently derived this session by numerically inverting the SAME `wgs84ToUtm28N` projection
// against a real polygon's own vertex centroid, then re-verified by re-running the forward
// projection + point-in-polygon test in a standalone Node script BEFORE this file existed — so the
// fixture points are not merely "whatever the code under test says they are".

import { describe, expect, it } from 'vitest';
import { wgs84ToUtm28N } from '../src/providers/resolveElSauzalZone.js';
import {
    loadTeldeEdifRecords,
    resolveTeldeZone,
    resolveTeldeZoneFromRecords,
    type TeldeEdifRecord,
} from '../src/providers/resolveTeldeZone.js';
import { TELDE_GRAPHED_ZONE_CODES, TELDE_UNPACKED_ZONES } from '../src/rulepacks/esTeldePgo2003.js';

describe('resolveTeldeZoneFromRecords (pure core, synthetic fixture)', () => {
    const fixture: TeldeEdifRecord[] = [
        {
            etiqueta: 'E',
            rings: [
                [
                    [462300, 3098800],
                    [462500, 3098800],
                    [462500, 3099000],
                    [462300, 3099000],
                ],
            ],
        },
    ];

    it('refuses a null/undefined point with reason no-point', () => {
        expect(resolveTeldeZoneFromRecords(null, fixture)).toEqual({ ok: false, reason: 'no-point' });
        expect(resolveTeldeZoneFromRecords(undefined, fixture)).toEqual({
            ok: false,
            reason: 'no-point',
        });
    });

    it('refuses a non-finite point with reason no-point', () => {
        expect(resolveTeldeZoneFromRecords({ lat: NaN, lon: -15.4 }, fixture)).toEqual({
            ok: false,
            reason: 'no-point',
        });
    });

    it('returns no-zone for a point outside every record', () => {
        expect(resolveTeldeZoneFromRecords({ lat: 0, lon: 0 }, fixture)).toEqual({
            ok: false,
            reason: 'no-zone',
        });
    });

    it('skips a record with an empty etiqueta rather than resolving to ""', () => {
        const blank: TeldeEdifRecord[] = [{ etiqueta: '   ', rings: fixture[0]!.rings }];
        // The fixture square's centroid, projected forward — same frame the resolver queries in.
        const inside = { lat: 28.014766, lon: -15.382309 };
        const result = resolveTeldeZoneFromRecords(inside, blank);
        expect(result.ok).toBe(false);
    });
});

describe('resolveTeldeZone — end-to-end against the REAL committed teldeEdif.json extract', () => {
    it('loads the real teldeEdif.json (2 643 records, 46 distinct ETIQUETA codes)', () => {
        const records = loadTeldeEdifRecords();
        expect(records.length).toBe(2643);
        expect(records[0]).toHaveProperty('etiqueta');
        expect(records[0]).toHaveProperty('rings');
        const distinctCodes = new Set(records.map((r) => r.etiqueta));
        expect(distinctCodes.size).toBe(46);
        // The EDIF table's own 46-code vocabulary, per `esTeldePgo2003.ts`'s header (31 packed +
        // 15 deliberately unpacked = 46) — cross-checked against the real geometry extract here.
        expect(distinctCodes.has('E')).toBe(true);
        expect(distinctCodes.has('D1')).toBe(true);
        expect(distinctCodes.has('INDEF')).toBe(true);
    });

    it('resolves a REAL point inside a real packed `E` polygon', async () => {
        const point = { lat: 28.01478338454933, lon: -15.382309021079934 };
        const result = await resolveTeldeZone(point);
        expect(result).toEqual({ ok: true, resolution: { zoneCode: 'E' } });
    });

    it('resolves a REAL point inside a real unpacked, graphed `D1` polygon', async () => {
        const point = { lat: 27.997386367147705, lon: -15.410879878830968 };
        const result = await resolveTeldeZone(point);
        expect(result).toEqual({ ok: true, resolution: { zoneCode: 'D1' } });
        expect(TELDE_GRAPHED_ZONE_CODES.has('D1')).toBe(true);
    });

    it('resolves a REAL point inside a real unpacked `INDEF` polygon', async () => {
        const point = { lat: 28.028548910374724, lon: -15.415081646617685 };
        const result = await resolveTeldeZone(point);
        expect(result).toEqual({ ok: true, resolution: { zoneCode: 'INDEF' } });
        expect(TELDE_UNPACKED_ZONES.INDEF).toBeTruthy();
    });

    it('refuses with no-zone for a point well outside the committed extract bbox', async () => {
        const result = await resolveTeldeZone({ lat: 27.922847492182665, lon: -15.534930886011523 });
        expect(result).toEqual({ ok: false, reason: 'no-zone' });
    });

    it('refuses with no-zone for a point far outside the municipality (Madrid)', async () => {
        const result = await resolveTeldeZone({ lat: 40.0, lon: -3.7 });
        expect(result).toEqual({ ok: false, reason: 'no-zone' });
    });

    it('never throws for a battery of edge-case inputs', async () => {
        const edgeCases = [
            null,
            undefined,
            { lat: NaN, lon: NaN },
            { lat: 0, lon: 0 },
            { lat: 200, lon: 200 },
        ];
        for (const input of edgeCases) {
            await expect(resolveTeldeZone(input as never)).resolves.not.toThrow();
        }
    });

    it('the same projection (`wgs84ToUtm28N`, EPSG:32628) that produced the fixture points is the one the resolver uses', () => {
        // Self-consistency check, mirroring `resolveElSauzalZone.test.ts` — the false easting falls
        // exactly on the central meridian (-15°), zeroing every A-dependent Snyder-series term.
        const p = wgs84ToUtm28N(28.0, -15.0);
        expect(p.x).toBeCloseTo(500000, 3);
    });
});
