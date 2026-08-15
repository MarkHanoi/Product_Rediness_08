// §COR-RASTER-ZONE — the resolver for Córdoba parcels whose zone FAMILY was reconstructed from the
// PGOU-2001 CUS calificación sheets by raster colour classification snapped to Catastro parcels
// (`findings/RASTER-PARCEL-ZONING-FEASIBILITY-2026-08-05.md` + the implementation findings doc
// `RASTER-CLASSIFIER-SAFE-SUBSET-IMPLEMENTATION-2026-08-05.md`).
//
// These tests are written against the SAFETY PROPERTIES, not the happy path. The capability's whole
// reason to exist is that it must refuse more often than it answers:
//
//   1. THE SAFE SET IS CLOSED. Only `MC` and `OA` may ever resolve. `UAD` was in the original brief's
//      safe set and is DROPPED here on measurement (its collider `Unifamiliar Aislada` sits at
//      Chebyshev 77 — the same separation as the CTP↔UAD pair that empirically produced 31 false
//      positives on CUS25W — and has never been observed co-present with UAD on any validated sheet,
//      so its 100 % precision is the exact "composition artefact" §12.4 condemns). Every other family
//      the feasibility study measured as unreliable (`Uso Comercial` 23.4 % pooled precision,
//      `Uso Industrial` 0.9 %, `Elemento protegido` 61.7 %) must fall through unchanged.
//   2. IT RESOLVES A FAMILY, NEVER A SUBZONE. The sheets encode the ordenanza by COLOUR, which is
//      family-level; the subzone digit is not machine-recoverable (see the findings doc's §OCR).
//      OA-1 vs OA-2 differ by FAR 1.4 vs 1.6, UAD-1/2/3 by FAR 1.0/0.7/1.0 — so a family alone binds
//      NO number and every resolution carries `subzoneResolved: false`.
//   3. DISAGREEING EVIDENCE REFUSES. Where a record carries BOTH a colour family and an OCR'd zone
//      label, they must agree or the parcel refuses. (Measured: the CUS series yields no OCR'd zone
//      label at all, so `ocrZoneLabel` is `null` on every real record — the mechanism is here because
//      a future sheet series may populate it, and a silent "prefer OCR" would be unreviewed.)
//   4. NO INVENTED CONFIDENCE. The evidence record carries only quantities that were MEASURED
//      (pixel counts, the nearest-legend Chebyshev distance, the georeference residual). There is no
//      aggregate `classification_confidence` float, because §4/§12.3 measured errors at
//      confidence 1.000 on every sheet and confidence gating is non-monotonic.

import { describe, it, expect } from 'vitest';
import {
    CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED,
    CORDOBA_RASTER_SAFE_ZONE_FAMILIES,
    loadCordobaRasterClassifiedZoneRecords,
    resolveCordobaRasterClassifiedZone,
    resolveCordobaRasterClassifiedZoneFromRecords,
    type CordobaRasterClassifiedZoneRecord,
} from '../src/index.js';

/** A square ring around a point, in WGS84 degrees — big enough that the even-odd test is unambiguous. */
function ringAround(lat: number, lon: number, d = 0.0004): ReadonlyArray<readonly [number, number]> {
    return [
        [lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d],
    ];
}

/** Inside the Córdoba municipal bbox, well OUTSIDE the COACo Sur+Noroeste pilot bbox. */
const OUTSIDE_PILOT = { lat: 37.92, lon: -4.72 };
const OUTSIDE_PILOT_2 = { lat: 37.93, lon: -4.70 };

function record(
    over: Partial<CordobaRasterClassifiedZoneRecord> = {},
    at = OUTSIDE_PILOT,
): CordobaRasterClassifiedZoneRecord {
    return {
        zoneFamily: 'MC',
        refcat: '3632807UG4933S',
        ring: ringAround(at.lat, at.lon),
        sourceSheet: 'CUS41W',
        classifiedDate: '2026-08-05',
        evidence: {
            method: 'raster_colour_classification',
            sourceCrs: 'EPSG:23030',
            classifiedPixels: 503,
            winningPixels: 376,
            rejectedPixels: 261,
            nearestLegendChebyshev: 12,
            runnerUpFamily: null,
            georefResidualPx: 3,
            ocrZoneLabel: null,
            subzoneResolved: false,
            derived: true,
            official: false,
        },
        provenance: 'test fixture',
        ...over,
    } as CordobaRasterClassifiedZoneRecord;
}

describe('§COR-RASTER-ZONE — the honesty gate', () => {
    it('is UNSIGNED by default — the committed constant is false', () => {
        expect(CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED).toBe(false);
    });

    it('does not inherit any other Córdoba gate — it is its own exported binding', async () => {
        const mod = await import('../src/providers/resolveCordobaRasterClassifiedZone.js');
        expect(Object.prototype.hasOwnProperty.call(mod, 'CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED'))
            .toBe(true);
        expect(mod.CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED).toBe(false);
    });
});

describe('§COR-RASTER-ZONE — the closed safe set', () => {
    it('contains EXACTLY the two families measured safe against their own colliders', () => {
        expect([...CORDOBA_RASTER_SAFE_ZONE_FAMILIES].sort()).toEqual(['MC', 'OA']);
    });

    it('resolves a genuine MC parcel to the MC family', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(OUTSIDE_PILOT, [record()]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.resolution.zoneFamily).toBe('MC');
        expect(r.resolution.sourceSheet).toBe('CUS41W');
    });

    it('resolves a genuine OA parcel to the OA family', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(
            OUTSIDE_PILOT, [record({ zoneFamily: 'OA', refcat: '3325701UG4932N' })],
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.resolution.zoneFamily).toBe('OA');
    });

    it('DROPS UAD — the family the brief proposed but whose collider is unmeasured', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(
            OUTSIDE_PILOT, [record({ zoneFamily: 'UAD' as never })],
        );
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('family-not-in-safe-set');
    });

    it.each([
        ['Uso Comercial', 'COM'],
        ['Uso Industrial', 'IND'],
        ['Elemento protegido', 'EP'],
        ['Colonia Tradicional Popular', 'CTP'],
        ['Prot. Tipológica / Campo de la Verdad', 'PTC'],
        ['Plurifamiliar Aislada', 'PAS'],
        ['Unifamiliar Aislada', 'UAS'],
    ])('refuses %s — measured unreliable or unmeasured, must never be emitted', (_label, fam) => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(
            OUTSIDE_PILOT, [record({ zoneFamily: fam as never })],
        );
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('family-not-in-safe-set');
    });
});

describe('§COR-RASTER-ZONE — family ≠ subzone', () => {
    it('every resolution reports subzoneResolved === false', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(OUTSIDE_PILOT, [record()]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.resolution.evidence.subzoneResolved).toBe(false);
    });

    it('refuses a record that claims a resolved subzone — nothing may set it true today', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(
            OUTSIDE_PILOT,
            [record({ evidence: { ...record().evidence, subzoneResolved: true as never } })],
        );
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('malformed-record');
    });

    it('never exposes a `zoneCode` field — a family is not a pack zone code', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(OUTSIDE_PILOT, [record()]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // Via `unknown`: the resolution type has no `zoneCode`, which is precisely
        // what this test asserts, so a direct cast is the error TS2352 describes.
        // Widening through unknown keeps the assertion (the field must be absent
        // at RUNTIME too) without claiming the two types overlap.
        expect((r.resolution as unknown as Record<string, unknown>).zoneCode).toBeUndefined();
    });
});

describe('§COR-RASTER-ZONE — multi-evidence disagreement refuses', () => {
    it('accepts an OCR label that AGREES with the colour family', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(
            OUTSIDE_PILOT,
            [record({ evidence: { ...record().evidence, ocrZoneLabel: 'MC-2' } })],
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.resolution.evidence.ocrZoneLabel).toBe('MC-2');
    });

    it('REFUSES when the OCR label disagrees with the colour family', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(
            OUTSIDE_PILOT,
            [record({ evidence: { ...record().evidence, ocrZoneLabel: 'OA-1' } })],
        );
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('evidence-conflict');
    });

    it('REFUSES an OCR label outside the pack vocabulary — a misread, not a new zone', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(
            OUTSIDE_PILOT,
            [record({ evidence: { ...record().evidence, ocrZoneLabel: 'MA-4' } })],
        );
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('evidence-conflict');
    });
});

describe('§COR-RASTER-ZONE — provenance record shape', () => {
    it('carries the source CRS — without it the record is silently 234 m wrong (§2.2)', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(OUTSIDE_PILOT, [record()]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.resolution.evidence.sourceCrs).toBe('EPSG:23030');
    });

    it('is derived and NEVER official', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(OUTSIDE_PILOT, [record()]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.resolution.evidence.derived).toBe(true);
        expect(r.resolution.evidence.official).toBe(false);
    });

    it('carries only MEASURED quantities — no aggregate confidence float', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(OUTSIDE_PILOT, [record()]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const keys = Object.keys(r.resolution.evidence);
        expect(keys).not.toContain('classification_confidence');
        expect(keys).not.toContain('classificationConfidence');
        expect(keys).not.toContain('boundaryConfidence');
        expect(r.resolution.evidence.winningPixels).toBeLessThanOrEqual(
            r.resolution.evidence.classifiedPixels,
        );
    });

    it('refuses a record whose winning pixel count exceeds its classified count', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(
            OUTSIDE_PILOT,
            [record({ evidence: { ...record().evidence, winningPixels: 999 } })],
        );
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('malformed-record');
    });

    it('refuses a record with zero classifiable pixels — an abstention, not an answer (§4)', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(
            OUTSIDE_PILOT,
            [record({ evidence: { ...record().evidence, classifiedPixels: 0, winningPixels: 0 } })],
        );
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('malformed-record');
    });
});

describe('§COR-RASTER-ZONE — refusals are typed and total', () => {
    it('refuses a missing point', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(null, [record()]);
        expect(r).toEqual({ ok: false, reason: 'no-point' });
    });

    it('refuses a non-finite point', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(
            { lat: Number.NaN, lon: -4.72 }, [record()],
        );
        expect(r).toEqual({ ok: false, reason: 'no-point' });
    });

    it('refuses a point outside the Córdoba municipal bbox', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords({ lat: 41.4, lon: 2.17 }, [record()]);
        expect(r).toEqual({ ok: false, reason: 'out-of-cordoba' });
    });

    it('refuses a point inside the municipality with no classified parcel under it', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(OUTSIDE_PILOT_2, [record()]);
        expect(r).toEqual({ ok: false, reason: 'no-classified-zone-here' });
    });

    it('never widens a match — a point just outside the ring is a miss', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(
            { lat: OUTSIDE_PILOT.lat + 0.0006, lon: OUTSIDE_PILOT.lon }, [record()],
        );
        expect(r.ok).toBe(false);
    });

    it('skips a degenerate ring instead of throwing', () => {
        const r = resolveCordobaRasterClassifiedZoneFromRecords(
            OUTSIDE_PILOT, [record({ ring: [[-4.72, 37.92]] })],
        );
        expect(r).toEqual({ ok: false, reason: 'no-classified-zone-here' });
    });

    it('the async wrapper never throws, even on a hostile record set', async () => {
        const r = await resolveCordobaRasterClassifiedZone(OUTSIDE_PILOT, {
            records: [null as never, undefined as never, record()],
        });
        expect(r.ok).toBe(true);
    });
});

describe('§COR-RASTER-ZONE — the committed dataset', () => {
    it('loads without throwing', () => {
        expect(() => loadCordobaRasterClassifiedZoneRecords()).not.toThrow();
    });

    it('every committed record is inside the closed safe set and subzone-unresolved', () => {
        for (const rec of loadCordobaRasterClassifiedZoneRecords()) {
            expect(CORDOBA_RASTER_SAFE_ZONE_FAMILIES).toContain(rec.zoneFamily);
            expect(rec.evidence.subzoneResolved).toBe(false);
            expect(rec.evidence.official).toBe(false);
            expect(rec.evidence.sourceCrs).toBe('EPSG:23030');
        }
    });

    it('ships EMPTY — no machine-classified record has been human-reviewed (see the findings doc)', () => {
        // ⚠ NOT a placeholder assertion. Every one of COACo's 453 ground-truth polygons lies INSIDE
        // the pilot bbox, which the dispatcher routes to the live COACo path before this resolver is
        // ever consulted — so this capability is reachable ONLY on land where no ground truth of any
        // kind exists, and no per-record verification is possible. Populating this file is a
        // human-reviewed act; if a future pass adds records, this test should be replaced by one
        // that pins their provenance, not deleted silently.
        expect(loadCordobaRasterClassifiedZoneRecords()).toEqual([]);
    });
});
