// L-449 SIGNED — the Denmark (Plandata.dk) PLANDATA → buildable-envelope rule pack.
//
// THE TWO CLAIMS THAT MATTER (the founder-signed mapping + the density-scope caveat):
//   1. FAR = maksbebyggelsesprocent / 100 — 40 → 0.40, 120 → 1.20 — at PARCEL density scope.
//   2. A `planningArea`-scoped bebyggelsesprocent is NOT treated as a parcel-FAR — it is WITHHELD
//      (never mis-scaled), and the whole-parcel envelope solved through the real engine does NOT
//      inflate its volume by a whole-area ratio.
// The rest pin: the pack parses at build (schema-valid), the scope parser, and property/unknown
// scope also withholding, height/storeys passing through scope-independently.

import { describe, it, expect } from 'vitest';
import {
    resolveDkPlanEnvelope,
    dkPlandataResolvedPack,
    parseDkDensityScope,
    DK_PLANDATA_JURISDICTION_ID,
    DK_PLANDATA_DEFAULT_ZONE_CODE,
    type DkPlanFields,
} from '../src/rulepacks/dkPlandataEnvelope.js';
import { computeBuildableEnvelope } from '../src/ZoningRulesEngine.js';
import {
    dkMatrikelParcelProvider,
    fetchParcelAtPoint as dkFetchParcelAtPoint,
} from '../src/parcelProviders/dkMatrikelParcelProvider.js';
import type { Pt, ParcelEdgeClassification, ZoningRecord } from '@pryzm/schemas';

// ── 1. FAR = bebyggelsesprocent / 100, at PARCEL scope. ──────────────────────────────────────
describe('L-449 — FAR = maksbebyggelsesprocent / 100 (parcel scope)', () => {
    it('40 % → FAR 0.40', () => {
        const r = resolveDkPlanEnvelope({ bebyggelsesprocent: 40, densityScope: 'parcel' });
        expect(r.farRatio).toBeCloseTo(0.4, 10);
        expect(r.farWithheld).toBe(false);
        expect(r.densityScope).toBe('parcel');
    });

    it('120 % → FAR 1.20', () => {
        const r = resolveDkPlanEnvelope({ bebyggelsesprocent: 120, densityScope: 'parcel' });
        expect(r.farRatio).toBeCloseTo(1.2, 10);
        expect(r.farWithheld).toBe(false);
    });

    it('coerces a numeric string (WFS values arrive as strings)', () => {
        const r = resolveDkPlanEnvelope({ bebyggelsesprocent: '60', densityScope: 'parcel' });
        expect(r.farRatio).toBeCloseTo(0.6, 10);
    });

    it('passes height + storeys through, flooring a decimal etager', () => {
        const r = resolveDkPlanEnvelope({
            bebyggelsesprocent: 110,
            maxHeightM: 24,
            maxStoreys: 6.5,
            densityScope: 'parcel',
        });
        expect(r.maxHeightM).toBe(24);
        expect(r.maxStoreys).toBe(6); // floored, never over-stated
        expect(r.farRatio).toBeCloseTo(1.1, 10);
    });
});

// ── 2. A planningArea-scoped value is WITHHELD, not treated as a parcel-FAR. ──────────────────
describe('L-449 — density scope is HONOURED (the envelope-overstates caveat)', () => {
    it('planningArea scope → FAR WITHHELD (null), pct kept as a fact, height/storeys intact', () => {
        const r = resolveDkPlanEnvelope({
            bebyggelsesprocent: 40,
            maxHeightM: 18,
            maxStoreys: 5,
            densityScope: 'planningArea',
        });
        expect(r.farRatio).toBeNull(); // NOT 0.40 — the crucial assertion
        expect(r.farWithheld).toBe(true);
        expect(r.farWithheldReason).toBe('scope-planning-area');
        expect(r.bebyggelsesprocent).toBe(40); // still carried as a fact
        expect(r.maxHeightM).toBe(18); // scope-independent
        expect(r.maxStoreys).toBe(5);
        expect(r.caveats.join(' ')).toMatch(/withheld/i);
    });

    it('property scope → FAR WITHHELD', () => {
        const r = resolveDkPlanEnvelope({ bebyggelsesprocent: 40, densityScope: 'property' });
        expect(r.farRatio).toBeNull();
        expect(r.farWithheldReason).toBe('scope-property');
    });

    it('UNKNOWN scope (not ingested) → FAR WITHHELD (assuming parcel would mis-scale)', () => {
        const r = resolveDkPlanEnvelope({ bebyggelsesprocent: 40, densityScope: null });
        expect(r.farRatio).toBeNull();
        expect(r.farWithheldReason).toBe('scope-unknown');
    });

    it('no bebyggelsesprocent → no FAR, reason no-bebyggelsesprocent', () => {
        const r = resolveDkPlanEnvelope({ maxHeightM: 12, densityScope: 'parcel' });
        expect(r.farRatio).toBeNull();
        expect(r.farWithheldReason).toBe('no-bebyggelsesprocent');
        expect(r.maxHeightM).toBe(12);
    });
});

// ── 3. The scope PARSER (Danish beregningsgrundlag phrasing). ────────────────────────────────
describe('parseDkDensityScope', () => {
    it('maps the three Danish computation bases', () => {
        expect(parseDkDensityScope('Beregnes ud fra det enkelte matrikelnummer')).toBe('parcel');
        expect(parseDkDensityScope('grundens areal')).toBe('parcel');
        expect(parseDkDensityScope('Beregnes ud fra den enkelte ejendom')).toBe('property');
        expect(parseDkDensityScope('Beregnes ud fra området som helhed')).toBe('planningArea');
        expect(parseDkDensityScope('området under ét')).toBe('planningArea');
    });

    it('returns null (→ withheld) for absent/unrecognised, never a guessed parcel', () => {
        expect(parseDkDensityScope(null)).toBeNull();
        expect(parseDkDensityScope('')).toBeNull();
        expect(parseDkDensityScope('noget helt andet')).toBeNull();
    });
});

// ── 4. The pack parses at build + carries the withheld FAR through as a null plotRatioFAR. ────
describe('dkPlandataResolvedPack — schema-valid + scope-honouring', () => {
    it('parcel scope → plotRatioFAR = pct/100 on the zone', () => {
        const { pack, resolution } = dkPlandataResolvedPack({
            bebyggelsesprocent: 80,
            maxHeightM: 20,
            maxStoreys: 6,
            densityScope: 'parcel',
        });
        expect(pack.jurisdictionId).toBe(DK_PLANDATA_JURISDICTION_ID);
        expect(pack.jurisdictionId).toBe('dk');
        expect(pack.defaultConfidence).toBe('structured');
        expect(pack.zones).toHaveLength(1);
        expect(pack.zones[0]!.plotRatioFAR).toBeCloseTo(0.8, 10);
        expect(pack.zones[0]!.maxHeight_m).toBe(20);
        expect(pack.zones[0]!.maxFloors).toBe(6);
        expect(resolution.farWithheld).toBe(false);
    });

    it('planningArea scope → zone.plotRatioFAR is null (withheld), height/storeys still present', () => {
        const { pack } = dkPlandataResolvedPack({
            bebyggelsesprocent: 40,
            maxHeightM: 18,
            maxStoreys: 5,
            densityScope: 'planningArea',
        });
        expect(pack.zones[0]!.plotRatioFAR).toBeNull();
        expect(pack.zones[0]!.maxHeight_m).toBe(18);
        expect(pack.zones[0]!.maxFloors).toBe(5);
    });
});

// ── 5. END-TO-END through the real engine: a planningArea value does NOT inflate the volume. ──
//
// This is the load-bearing safety property. A 20×20 m parcel (400 m²) with a 40 % bebyggelsesprocent
// and a 30 m height cap: if the whole-area value were mis-treated as a parcel-FAR the FAR-limited
// height would bind BELOW 30 m; because it is WITHHELD, FAR does not bind and the solid == the shell.
describe('L-449 — engine end-to-end: planningArea scope does not mis-scale the envelope', () => {
    // A closed 20×20 m square ring, scene-XZ (Pt is { x, z }).
    const parcelRing: Pt[] = [
        { x: 0, z: 0 },
        { x: 20, z: 0 },
        { x: 20, z: 20 },
        { x: 0, z: 20 },
    ];
    const edges: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];

    function zoningRecord(): ZoningRecord {
        return {
            zoneCode: DK_PLANDATA_DEFAULT_ZONE_CODE,
            zoneLabel: 'test',
            jurisdictionId: 'dk',
            structuredFields: {},
            overlays: [],
            ordinanceRef: null,
            provenance: {
                source: 'plandata-dk',
                label: 'test',
                version: '2026-07-30',
                license: 'test',
                crs: 'EPSG:25832',
            },
        } as ZoningRecord;
    }

    it('parcel scope: FAR binds and lowers the FAR-limited height below the 30 m cap', () => {
        const { pack } = dkPlandataResolvedPack(
            { bebyggelsesprocent: 40, maxHeightM: 30, maxStoreys: 10, densityScope: 'parcel' },
            DK_PLANDATA_DEFAULT_ZONE_CODE,
        );
        const env = computeBuildableEnvelope({
            parcelRing,
            edgeClassifications: edges,
            zoning: zoningRecord(),
            rulePack: pack,
        });
        expect(env.maxFAR).toBeCloseTo(0.4, 10);
        // FAR 0.40 over 400 m² = 160 m² GFA over a 400 m² footprint ⇒ ~0.4 floors ⇒ well under 30 m.
        expect(env.farLimitedHeight_m).not.toBeNull();
        expect(env.farLimitedHeight_m!).toBeLessThan(30);
    });

    it('planningArea scope: FAR is null so it CANNOT bind — no whole-area mis-scaling', () => {
        const { pack } = dkPlandataResolvedPack(
            { bebyggelsesprocent: 40, maxHeightM: 30, maxStoreys: 10, densityScope: 'planningArea' },
            DK_PLANDATA_DEFAULT_ZONE_CODE,
        );
        const env = computeBuildableEnvelope({
            parcelRing,
            edgeClassifications: edges,
            zoning: zoningRecord(),
            rulePack: pack,
        });
        expect(env.maxFAR).toBeNull(); // withheld — the crucial end-to-end assertion
        expect(env.farLimitedHeight_m).toBeNull(); // FAR did not bind → solid == shell
        expect(env.maxHeight_m).toBe(30); // height still governs, scope-independent
    });
});

// ── 6. SEPARATION: the DK parcel provider is a DEFERRED STUB, and the envelope math does NOT
//      depend on it — the signed rules solve on any geometry (OSM footprint / a hand ring). ──
describe('L-449 — offline legislation is SEPARATE from deferred live data', () => {
    it('the DK parcel provider is a deferred stub: returns null → OSM fallback, never throws', async () => {
        expect(dkMatrikelParcelProvider.id).toBe('matrikel-dk');
        expect(dkMatrikelParcelProvider.proxyPath).toBe('/api/parcel/dk');
        // No live access attempted; null so the registry falls back to the OSM footprint.
        await expect(dkFetchParcelAtPoint(12.5683, 55.6761)).resolves.toBeNull();
        // Even with an injected fetch, the stub does NOT call it (deferred) and still returns null.
        let called = false;
        const spyFetch = async () => {
            called = true;
            return { ok: true, status: 200, json: async () => ({}) };
        };
        await expect(
            dkFetchParcelAtPoint(12.5683, 55.6761, { fetchImpl: spyFetch }),
        ).resolves.toBeNull();
        expect(called).toBe(false); // no live-data dependency
    });

    it('the signed envelope math runs with NO live parcel data (a stub/OSM-style ring)', () => {
        // A parcel ring the OSM-footprint fallback would supply — NOT from Datafordeler.
        const osmFallbackRing: Pt[] = [
            { x: 0, z: 0 },
            { x: 25, z: 0 },
            { x: 25, z: 16 },
            { x: 0, z: 16 },
        ];
        const { pack } = dkPlandataResolvedPack(
            { bebyggelsesprocent: 60, maxHeightM: 18, maxStoreys: 5, densityScope: 'parcel' },
            DK_PLANDATA_DEFAULT_ZONE_CODE,
        );
        const zoning: ZoningRecord = {
            zoneCode: DK_PLANDATA_DEFAULT_ZONE_CODE,
            zoneLabel: 'test',
            jurisdictionId: 'dk',
            structuredFields: {},
            overlays: [],
            ordinanceRef: null,
            provenance: {
                source: 'plandata-dk',
                label: 'test',
                version: '2026-07-30',
                license: 'test',
                crs: 'EPSG:25832',
            },
        } as ZoningRecord;
        const env = computeBuildableEnvelope({
            parcelRing: osmFallbackRing,
            edgeClassifications: ['front', 'side', 'rear', 'side'],
            zoning,
            rulePack: pack,
        });
        // The signed legislation produced a real envelope with zero live-data dependency.
        expect(env.status).toBe('ok');
        expect(env.maxFAR).toBeCloseTo(0.6, 10);
        expect(env.maxHeight_m).toBe(18);
    });
});
