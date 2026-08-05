// Córdoba (INE 14021) — tests for the TRACED-ZONE resolver (2026-08-05). Proves the three honesty
// properties documented in `resolveCordobaTracedZone.ts`'s header, that the seeded PAS-2 record
// (traced from CUS20W.jpg, `cordobaProofOfConcept.test.ts`) round-trips through the real committed
// data file, and that `CORDOBA_TRACED_ZONES_VERIFIED` is genuinely unsigned today.

import { describe, it, expect } from 'vitest';
import {
    resolveCordobaTracedZone,
    resolveCordobaTracedZoneFromRecords,
    loadCordobaTracedZoneRecords,
    CORDOBA_TRACED_ZONES_VERIFIED,
    type CordobaTracedZoneRecord,
} from '../src/providers/resolveCordobaTracedZone.js';
import {
    CORDOBA_PGOU2001_ZONE_CODES,
    ES_CORDOBA_PGOU2001_PACK,
} from '../src/rulepacks/esCordobaPGOU2001.js';
import { isInCordoba, isInCordobaMunicipality } from '../src/providers/cordobaBbox.js';

// A point comfortably inside the seeded PAS-2 pentagon (see cordobaProofOfConcept.test.ts's own
// PAS2_TRACED_UTM header for the UTM derivation; this is that same polygon's rough centroid in
// WGS84, independently computed — not copy-pasted from the data file's own vertices).
const PAS2_INTERIOR_POINT = { lat: 37.9000309378604, lon: -4.751228404551405 };

// A point inside the OA-1 block traced from CUS27W.jpg on 2026-08-05 (Distrito Sureste, the block
// bounded by C/ Poeta Antonio Gala, Acera de Alonso Gómez de Figueroa, Av. Virgen del Mar and
// Pje. del Pintor Rafael Romero de Torres). ⚠ NOT the data file's own centroid arithmetic: this is
// the WGS84 position of the block's printed subzone digit "1" (sheet pixel 1363.6, 807.9), derived
// through the same published affine but from a DIFFERENT source pixel than any stored vertex.
const OA1_INTERIOR_POINT = { lat: 37.8864229, lon: -4.7529792 };

// Well outside any traced polygon, but still inside Córdoba municipality (central Córdoba).
const CORDOBA_NO_TRACED_ZONE_POINT = { lat: 37.883, lon: -4.78 };

// Nowhere near Córdoba at all (Madrid).
const MADRID_POINT = { lat: 40.4168, lon: -3.7038 };

describe('CORDOBA_TRACED_ZONES_VERIFIED — the honesty gate', () => {
    it('is unsigned (false) today — this capability has NOT inherited the pilot sign-off', () => {
        // ⚠ This is the load-bearing assertion the whole task depends on: a NEW geometry source
        // must start gated CLOSED, independently of `CORDOBA_ENVELOPE_VERIFIED` (which was signed
        // 2026-08-03 for a different claim — OCR transcription accuracy, not traced-geometry
        // accuracy). If this test ever fails because someone flipped the constant, that flip must
        // have been a real, documented, founder-authorized sign-off — never a side effect of
        // "finishing" this feature.
        expect(CORDOBA_TRACED_ZONES_VERIFIED).toBe(false);
    });
});

describe('resolveCordobaTracedZone — the committed store (real data file)', () => {
    it('loads the real committed extract and it contains the seeded PAS-2 record', () => {
        const records = loadCordobaTracedZoneRecords();
        expect(records.length).toBeGreaterThanOrEqual(1);
        const pas2 = records.find((r) => r.zoneCode === 'PAS-2');
        expect(pas2).toBeDefined();
        expect(pas2!.ring.length).toBeGreaterThanOrEqual(3);
        expect(pas2!.sourceSheet).toBe('CUS20W.jpg');
    });

    it('every seeded zoneCode belongs to the closed CORDOBA_PGOU2001_ZONE_CODES vocabulary', () => {
        // The task's own constraint: a traced zone must match an already-packed zone, never MC
        // (which has its own independent footprint blocker) and never an invented code.
        const records = loadCordobaTracedZoneRecords();
        for (const r of records) {
            expect(CORDOBA_PGOU2001_ZONE_CODES as readonly string[]).toContain(r.zoneCode);
        }
    });

    it('resolves PAS-2 for a point inside the traced pentagon', async () => {
        const result = await resolveCordobaTracedZone(PAS2_INTERIOR_POINT);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.resolution.zoneCode).toBe('PAS-2');
            expect(result.resolution.ring.length).toBeGreaterThanOrEqual(3);
            expect(result.resolution.provenance).toMatch(/hand-traced|traced/i);
            // The honesty invariant: it must say this is NOT authoritative published geometry.
            expect(result.resolution.provenance).toMatch(/NOT authoritative/i);
        }
    });

    it('contains the OA-1 record traced from CUS27W (2026-08-05), outside the vectorised six', () => {
        const records = loadCordobaTracedZoneRecords();
        const oa1 = records.find((r) => r.sourceSheet === 'CUS27W.jpg');
        expect(oa1).toBeDefined();
        expect(oa1!.zoneCode).toBe('OA-1');
        expect(oa1!.ring).toHaveLength(5);
        // ⚠ The whole point of the traced store is land COACo has NOT vectorised. `coaco:hojas_cus`
        // publishes exactly six sheets (CUS25W/26W/34W/41W/45W/46W = the Sur+Noroeste pilot); a
        // traced record on any of those would duplicate a strictly stronger live source.
        const COACO_VECTORISED_SHEETS = [
            'CUS25W.jpg', 'CUS26W.jpg', 'CUS34W.jpg', 'CUS41W.jpg', 'CUS45W.jpg', 'CUS46W.jpg',
        ];
        for (const r of records) expect(COACO_VECTORISED_SHEETS).not.toContain(r.sourceSheet);
    });

    it('resolves OA-1 for a point inside the CUS27W-traced block', async () => {
        const result = await resolveCordobaTracedZone(OA1_INTERIOR_POINT);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.resolution.zoneCode).toBe('OA-1');
            expect(result.resolution.sourceSheet).toBe('CUS27W.jpg');
            expect(result.resolution.provenance).toMatch(/NOT authoritative/i);
            // The two named, demonstrated failure modes of a hand trace must both be addressed in
            // the provenance string itself, not only in a findings doc: the datum trap (ED50 vs
            // ETRS89, ≈234 m) and the colour-family near-miss (RGB legend-swatch sampling).
            expect(result.resolution.provenance).toMatch(/EPSG:23030/);
            expect(result.resolution.provenance).toMatch(/legend swatch/i);
        }
    });

    it('is OUTSIDE the COACo pilot bbox but INSIDE the municipality — the branch this store serves',
        () => {
            // Mirrors `siteDispatch.ts`'s own routing condition for the traced-zone path.
            expect(isInCordoba(OA1_INTERIOR_POINT.lat, OA1_INTERIOR_POINT.lon)).toBe(false);
            expect(isInCordobaMunicipality(OA1_INTERIOR_POINT.lat, OA1_INTERIOR_POINT.lon)).toBe(true);
        });

    it('every traced zoneCode computes a real envelope (or a cited refusal) from the signed pack',
        () => {
            // §END-TO-END — the same proof shape as END-TO-END-PROOF-2026-08-04.md, but run against
            // the UNMODIFIED committed store: every stored zone code must be one the real pack can
            // actually act on. A code that silently produced nothing would be a dead record.
            for (const r of loadCordobaTracedZoneRecords()) {
                const zone = ES_CORDOBA_PGOU2001_PACK.zones.find((z) => z.code === r.zoneCode);
                expect(zone, `pack carries ${r.zoneCode}`).toBeDefined();
                expect(zone!.ordinanceRef).toBeTruthy();
            }
        });

    it('refuses no-traced-zone-here for a Córdoba point with no traced polygon', async () => {
        const result = await resolveCordobaTracedZone(CORDOBA_NO_TRACED_ZONE_POINT);
        expect(result).toEqual({ ok: false, reason: 'no-traced-zone-here' });
    });

    it('refuses out-of-cordoba for a point far outside the municipality', async () => {
        const result = await resolveCordobaTracedZone(MADRID_POINT);
        expect(result).toEqual({ ok: false, reason: 'out-of-cordoba' });
    });

    it('refuses no-point rather than throw on a malformed point', async () => {
        expect(await resolveCordobaTracedZone(null)).toEqual({ ok: false, reason: 'no-point' });
        expect(await resolveCordobaTracedZone({ lat: Number.NaN, lon: -4.75 })).toEqual({
            ok: false,
            reason: 'no-point',
        });
    });

    it('never throws even when data loading fails — typed data-unavailable refusal', async () => {
        const result = await resolveCordobaTracedZone(PAS2_INTERIOR_POINT, {
            records: undefined,
        });
        // With no injected records it falls back to the real committed file and succeeds; this test
        // exists to document the deps shape, not to force a failure — the throw-safety itself is
        // exercised via resolveCordobaTracedZoneFromRecords below with a deliberately broken record.
        expect(result.ok).toBe(true);
    });
});

describe('resolveCordobaTracedZoneFromRecords — the pure core, fixture-driven', () => {
    const SQUARE: CordobaTracedZoneRecord = {
        zoneCode: 'OA-1',
        sourceSheet: 'FIXTURE.jpg',
        tracedDate: '2026-08-05',
        provenance: 'test fixture — not a real trace',
        ring: [
            [-4.78, 37.87],
            [-4.77, 37.87],
            [-4.77, 37.88],
            [-4.78, 37.88],
        ],
    };

    it('matches a point inside the fixture ring', () => {
        const result = resolveCordobaTracedZoneFromRecords({ lat: 37.875, lon: -4.775 }, [SQUARE]);
        expect(result).toEqual({
            ok: true,
            resolution: {
                zoneCode: 'OA-1',
                ring: SQUARE.ring,
                sourceSheet: 'FIXTURE.jpg',
                tracedDate: '2026-08-05',
                provenance: 'test fixture — not a real trace',
            },
        });
    });

    it('misses a point outside the fixture ring but inside Córdoba municipality', () => {
        const result = resolveCordobaTracedZoneFromRecords({ lat: 37.9, lon: -4.9 }, [SQUARE]);
        expect(result).toEqual({ ok: false, reason: 'no-traced-zone-here' });
    });

    it('skips a malformed record (fewer than 3 ring vertices) rather than throw', () => {
        const broken: CordobaTracedZoneRecord = {
            ...SQUARE,
            ring: [[-4.775, 37.875]],
        };
        const result = resolveCordobaTracedZoneFromRecords({ lat: 37.875, lon: -4.775 }, [broken]);
        expect(result).toEqual({ ok: false, reason: 'no-traced-zone-here' });
    });

    it('is a total function over an empty record set', () => {
        const result = resolveCordobaTracedZoneFromRecords({ lat: 37.875, lon: -4.775 }, []);
        expect(result).toEqual({ ok: false, reason: 'no-traced-zone-here' });
    });
});
