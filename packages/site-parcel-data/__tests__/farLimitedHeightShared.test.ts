// §L-616 / §L-619 — the FAR cap as a SHARED helper, and the BCN 20a / 12 OVERSTATES-FAR verify.
//
// TASK 2 (ENVELOPE-REALISM-MATRIX): does BCN 20a aïllada + 12 nucli antic's `maxFAR` now flow into
// `farLimitedHeight_m`?
//   • 20a — ships REAL setbacks + a real height + a scalar FAR, so the engine holds all three at
//     solve time → the L-616 block fires → CAPPED. Verified below against the SHIPPING pack.
//   • 12  — ships FAR 1,40 but `maxHeight_m: null` (a per-street construction attached AFTER the
//     solve). At engine time the height is absent, so the L-616 block is SKIPPED and 12 STILL
//     over-states. The fix routes the FAR cap through `applyConstructedHeight`, where the height
//     finally exists. Both halves are proven below.

import { describe, it, expect } from 'vitest';
import type { BuildableEnvelope, Pt, ZoningRecord } from '@pryzm/schemas';
import { BuildableEnvelopeSchema } from '@pryzm/schemas';
import {
    computeBuildableEnvelope,
    computeFarLimitedHeight,
    applyConstructedHeight,
    ES_BARCELONA_20A_AILLADA_PACK,
} from '../src/index.js';
import { ES_BARCELONA_NUCLI_ANTIC_PACK } from '../src/rulepacks/esBarcelonaNucliAntic.js';

function rect(w: number, h: number): Pt[] {
    return [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: h }, { x: 0, z: h }];
}
const UNCLASSIFIED = ['unclassified', 'unclassified', 'unclassified', 'unclassified'] as const;

function recordFor(zoneCode: string, jurisdictionId: string): ZoningRecord {
    return {
        zoneCode,
        zoneLabel: zoneCode,
        jurisdictionId,
        structuredFields: {},
        overlays: [],
        ordinanceRef: null,
        provenance: {
            source: 'test', label: 'test', version: '2026-07-26', license: null, crs: 'EPSG:4326',
        },
    } as ZoningRecord;
}

describe('computeFarLimitedHeight — the extracted L-616 helper', () => {
    it('binds below the legal cap and surfaces the assumed floor height', () => {
        // 666 m² footprint, FAR 1.5 → GFA 999 → 1.5 floors → ×3.0 m = 4.5 m inside a 24 m shell.
        const r = computeFarLimitedHeight({
            maxFAR: 1.5, parcelAreaM2: 666, footprintAreaM2: 666, maxHeight_m: 24, maxFloors: null,
        });
        expect(r.farLimitedHeight_m).toBeCloseTo(4.5, 6);
        expect(r.binds).toBe(true);
        expect(r.floorHeightAssumed).toBe(true);   // 3.0 m assumption used + surfaced
        expect(r.floorHeightM).toBe(3.0);
    });

    it('does not bind when FAR is null (13a/13b) — the honesty-critical protected case', () => {
        const r = computeFarLimitedHeight({
            maxFAR: null, parcelAreaM2: 666, footprintAreaM2: 666, maxHeight_m: 24, maxFloors: null,
        });
        expect(r.farLimitedHeight_m).toBeNull();
        expect(r.binds).toBe(false);
    });

    it('never raises the height above the legal cap (min-clamp)', () => {
        const r = computeFarLimitedHeight({
            maxFAR: 100, parcelAreaM2: 666, footprintAreaM2: 666, maxHeight_m: 24, maxFloors: null,
        });
        expect(r.farLimitedHeight_m).toBe(24);
        expect(r.binds).toBe(false);
    });
});

describe('TASK 2 — BCN 20a aïllada: maxFAR flows into farLimitedHeight_m (CAPPED, no change needed)', () => {
    it('the SHIPPING 20a pack caps a scalar-FAR subzone below its legal height', () => {
        // A 20a subzone that ships BOTH a real height AND a scalar FAR (i.e. edificabilitat not
        // constructed) — the engine holds all three at solve time, so the L-616 block fires.
        const zone = ES_BARCELONA_20A_AILLADA_PACK.zones.find(
            (z) => z.maxHeight_m !== null && z.plotRatioFAR !== null,
        );
        expect(zone, 'expected at least one scalar-FAR 20a subzone').toBeTruthy();
        const env = computeBuildableEnvelope({
            parcelRing: rect(40, 30), // 1200 m² — survives the aïllada setbacks
            edgeClassifications: [...UNCLASSIFIED],
            zoning: recordFor(zone!.code, 'es-08019-barcelona'),
            rulePack: ES_BARCELONA_20A_AILLADA_PACK,
        });
        expect(env.status).toBe('ok');
        expect(env.maxFAR).toBe(zone!.plotRatioFAR);          // FAR IS in the field the cap reads
        expect(env.farLimitedHeight_m).not.toBeNull();        // …and it BOUND
        expect(env.farLimitedHeight_m!).toBeLessThan(env.maxHeight_m!); // below the legal cap
        expect(env.caveats.some((c) => /caps usable floorspace/i.test(c))).toBe(true);
    });
});

describe('TASK 2 — BCN 12 nucli antic: FAR 1,40 is present but the engine cannot cap it (root cause)', () => {
    it('the pack states FAR 1,40 (so it IS in the maxFAR field) but maxHeight_m null', () => {
        const zone = ES_BARCELONA_NUCLI_ANTIC_PACK.zones[0]!;
        expect(zone.plotRatioFAR).toBe(1.4);   // present — the cap does read this field
        expect(zone.maxHeight_m).toBeNull();    // …but the height is a per-street construction
    });

    it('closes the gap: applyConstructedHeight caps FAR once the alçada is attached', () => {
        // Simulate a solved clau-12 envelope BEFORE the §BCN-ALCADA height splice: FAR 1,40, a
        // depth-clipped footprint, no height yet → farLimitedHeight_m null (the live over-statement).
        const parcel = rect(30, 40);            // 1200 m² lot
        const preHeight: BuildableEnvelope = BuildableEnvelopeSchema.parse({
            insetPolygon: rect(30, 12),         // 360 m² depth band (block-derived footprint)
            insetAreaM2: 360,
            maxHeight_m: null,
            maxFAR: 1.4,
            confidence: 'block-constructed',
            granularity: 'parcel',
            status: 'ok',
            zoneCode: '12',
        });
        expect(preHeight.farLimitedHeight_m).toBeNull();  // over-states today (no cap)

        // The dispatcher attaches the constructed alçada — via the sanctioned helper, WITH the parcel.
        const withHeight = applyConstructedHeight(preHeight, {
            height_m: 24, maxFloors: 8, parcelRing: parcel,
        });
        // GFA = 1.4 × 1200 = 1680; over 360 m² footprint = 4.67 floors; × (24/8 = 3.0 m) = 14 m < 24 m.
        expect(withHeight.maxHeight_m).toBe(24);           // the legal shell is unchanged
        expect(withHeight.farLimitedHeight_m).not.toBeNull();
        expect(withHeight.farLimitedHeight_m!).toBeLessThan(24); // FAR now binds below the cap
        expect(withHeight.farLimitedHeight_m!).toBeCloseTo(14, 6);
        expect(withHeight.caveats.some((c) => /caps usable floorspace/i.test(c))).toBe(true);
    });

    it('PROTECTS 13a/13b: a FAR-null envelope gets no FAR cap through applyConstructedHeight', () => {
        const parcel = rect(30, 40);
        const ensanche: BuildableEnvelope = BuildableEnvelopeSchema.parse({
            insetPolygon: rect(30, 12), insetAreaM2: 360,
            maxHeight_m: null, maxFAR: null,       // Art. 322.1 — the envelope IS the rule
            confidence: 'block-constructed', granularity: 'parcel', status: 'ok', zoneCode: '13a',
        });
        const withHeight = applyConstructedHeight(ensanche, {
            height_m: 20.75, maxFloors: 6, parcelRing: parcel,
        });
        expect(withHeight.maxHeight_m).toBe(20.75);
        expect(withHeight.farLimitedHeight_m).toBeNull(); // unchanged — single solid, no shell/solid split
        expect(withHeight.caveats.some((c) => /caps usable floorspace/i.test(c))).toBe(false);
    });
});
