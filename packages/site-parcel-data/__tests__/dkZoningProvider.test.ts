// L-399a — Dk Plandata.dk zoning provider: field mapping, use classification,
// jurisdiction selection, graceful fallback, and the structured end-to-end envelope.
//
// The mapping is the compliance-critical PURE core (C58 §1.1) — these mocked
// Plandata responses pin the Danish-field → ZoningRecord contract. No live calls.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import {
    computeBuildableEnvelope,
    mapPlandataToZoningRecord,
    classifyDanishUse,
    isInDenmark,
    DkZoningProvider,
    type PlandataZoningResponse,
} from '../src/index.js';

const FETCH_DATE = '2026-07-18';

// 40 m × 20 m rectangle (area 800 m²), edges unclassified.
const RECT: Pt[] = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 40, z: 20 },
    { x: 0, z: 20 },
];
const UNCLASSIFIED: ParcelEdgeClassification[] = [
    'unclassified',
    'unclassified',
    'unclassified',
    'unclassified',
];

// A representative Copenhagen local-plan feature (field names = Plandata WFS,
// verified via DescribeFeatureType 2026-07-17).
const CPH_LOKALPLAN: PlandataZoningResponse = {
    layer: 'lokalplan',
    properties: {
        planid: 3041234,
        plannr: '123',
        plannavn: 'Lokalplan 123 Indre By',
        anvendelsegenerel: 'Boligområde',
        anvgen: 'Boligområde',
        bebygpct: 110, // bebyggelsesprocent 110 % → FAR 1.10
        maxbygnhjd: 24, // 24 m
        maxetager: 6, // 6 storeys
        doklink: 'https://dokument.plandata.dk/20_3041234_APPROVED.pdf',
        zonestatus: 'Byzone',
    },
};

describe('mapPlandataToZoningRecord — field mapping (C58 §1.2 fidelity 1)', () => {
    it('maps a representative Copenhagen plan → structured ZoningRecord', () => {
        const rec = mapPlandataToZoningRecord(CPH_LOKALPLAN, { fetchDateISO: FETCH_DATE });
        expect(rec).not.toBeNull();
        expect(rec!.jurisdictionId).toBe('dk');
        expect(rec!.structuredFields.maxHeight_m).toBe(24);
        expect(rec!.structuredFields.maxFloors).toBe(6);
        expect(rec!.structuredFields.plotRatioFAR).toBeCloseTo(1.1, 6); // 110 % → 1.10 FAR
        // bebyggelsesprocent is FAR, NOT coverage → coverage stays null (no fabrication).
        expect(rec!.structuredFields.maxCoverage).toBeNull();
        // Per-edge setbacks are a separate byggelinjer dataset → honest null.
        expect(rec!.structuredFields.setbacks).toEqual({ front_m: null, side_m: null, rear_m: null });
        expect(rec!.structuredFields.permittedUse).toEqual(['residential']);
        // The plan document is the governing-document citation (C58 §1.3).
        expect(rec!.ordinanceRef).toBe('https://dokument.plandata.dk/20_3041234_APPROVED.pdf');
        expect(rec!.provenance.source).toBe('plandata-dk');
        expect(rec!.provenance.version).toBe(FETCH_DATE);
        expect(rec!.provenance.crs).toBe('EPSG:25832');
        expect(rec!.zoneLabel).toBe('Lokalplan 123 Indre By');
    });

    it('ABSENT dimensional fields → null record (caller falls back to estimated)', () => {
        const useOnly: PlandataZoningResponse = {
            layer: 'lokalplan',
            properties: { plannavn: 'Plan uden tal', anvendelsegenerel: 'Boligområde' },
        };
        expect(mapPlandataToZoningRecord(useOnly, { fetchDateISO: FETCH_DATE })).toBeNull();
        // Totally empty / null response → null.
        expect(mapPlandataToZoningRecord(null, { fetchDateISO: FETCH_DATE })).toBeNull();
    });

    it('a PARTIAL plan keeps present fields + honest nulls for the rest', () => {
        const partial: PlandataZoningResponse = {
            layer: 'kommuneplanramme',
            properties: { plannavn: 'Ramme 4.B.12', bebygpct: 45, anvendelsegenerel: 'Blandet bolig og erhverv' },
        };
        const rec = mapPlandataToZoningRecord(partial, { fetchDateISO: FETCH_DATE });
        expect(rec).not.toBeNull();
        expect(rec!.structuredFields.plotRatioFAR).toBeCloseTo(0.45, 6);
        expect(rec!.structuredFields.maxHeight_m).toBeNull();
        expect(rec!.structuredFields.maxFloors).toBeNull();
        expect(rec!.structuredFields.permittedUse).toEqual(['mixed']);
    });

    it('L-608 — a delområde (sub-area) feature maps like a plan + names the sub-area', () => {
        // The sub-area layer carries the plan identity under `lp_*` names + its own
        // `delnr`, and the SAME dimensional field names as the whole plan.
        const delomraade: PlandataZoningResponse = {
            layer: 'lokalplandelomraade',
            properties: {
                lp_plannavn: 'Lokalplan 410 Ørestad Syd',
                lp_plannr: '410',
                delnr: '3',
                anvendelsegenerel: 'Blandet bolig og erhverv',
                bebygpct: 185,
                maxbygnhjd: 42,
                maxetager: 12,
                doklink: 'https://dokument.plandata.dk/20_410_delomr3.pdf',
                zonestatus: 'Byzone',
            },
        };
        const rec = mapPlandataToZoningRecord(delomraade, { fetchDateISO: FETCH_DATE })!;
        expect(rec).not.toBeNull();
        expect(rec.structuredFields.maxHeight_m).toBe(42);
        expect(rec.structuredFields.maxFloors).toBe(12);
        expect(rec.structuredFields.plotRatioFAR).toBeCloseTo(1.85, 6);
        expect(rec.structuredFields.permittedUse).toEqual(['mixed']);
        // Identity resolved from the lp_* aliases; the sub-area is named.
        expect(rec.zoneLabel).toBe('Lokalplan 410 Ørestad Syd (delområde 3)');
        expect(rec.zoneCode).toBe('410'); // no anvgen → falls to lp_plannr
        expect(rec.ordinanceRef).toBe('https://dokument.plandata.dk/20_410_delomr3.pdf');
        expect(rec.provenance.label).toContain('delområde 3');
    });

    it('floors a fractional maxetager to an integer storey count', () => {
        const attic: PlandataZoningResponse = {
            layer: 'lokalplan',
            properties: { plannavn: 'P', maxetager: 3.5 },
        };
        const rec = mapPlandataToZoningRecord(attic, { fetchDateISO: FETCH_DATE });
        expect(rec!.structuredFields.maxFloors).toBe(3);
    });
});

describe('classifyDanishUse — Danish anvendelse → C58 permitted-use vocabulary', () => {
    it('classifies the common plan use strings deterministically', () => {
        expect(classifyDanishUse('Boligområde')).toBe('residential');
        expect(classifyDanishUse('Blandet bolig og erhverv')).toBe('mixed'); // mixed wins over bolig/erhverv
        expect(classifyDanishUse('Erhvervsområde')).toBe('commercial');
        expect(classifyDanishUse('Industriområde')).toBe('industrial');
        expect(classifyDanishUse('Offentlige formål')).toBe('civic');
        expect(classifyDanishUse('Rekreativt område')).toBe('green');
        expect(classifyDanishUse('Centerområde')).toBe('mixed');
        expect(classifyDanishUse('Noget ukendt')).toBe('other');
        expect(classifyDanishUse('')).toBeNull();
        expect(classifyDanishUse(null)).toBeNull();
    });
});

describe('isInDenmark — jurisdiction selection predicate (C58 §1.5)', () => {
    it('DK point selects DK; non-DK does not', () => {
        expect(isInDenmark(55.6761, 12.5683)).toBe(true); // Copenhagen
        expect(isInDenmark(56.1629, 10.2039)).toBe(true); // Aarhus
        expect(isInDenmark(55.1, 15.1)).toBe(true); // Bornholm
        expect(isInDenmark(41.3874, 2.1686)).toBe(false); // Barcelona → estimated default
        expect(isInDenmark(59.3293, 18.0686)).toBe(false); // Stockholm
        expect(isInDenmark(NaN, NaN)).toBe(false);
    });
});

describe('DkZoningProvider.fetchZoningAtPoint — fetch + graceful fallback', () => {
    const okFetch = (zoning: PlandataZoningResponse | null): typeof fetch =>
        (async () => ({ ok: true, json: async () => ({ zoning }) })) as unknown as typeof fetch;

    it('Copenhagen point + a plan response → structured ZoningRecord', async () => {
        const rec = await DkZoningProvider.fetchZoningAtPoint(55.6761, 12.5683, {
            fetchImpl: okFetch(CPH_LOKALPLAN),
            nowISO: FETCH_DATE,
        });
        expect(rec).not.toBeNull();
        expect(rec!.structuredFields.maxHeight_m).toBe(24);
        expect(rec!.provenance.source).toBe('plandata-dk');
    });

    it('non-DK point → null WITHOUT any fetch (jurisdiction guard)', async () => {
        let calls = 0;
        const countingFetch = (async () => {
            calls++;
            return { ok: true, json: async () => ({ zoning: CPH_LOKALPLAN }) };
        }) as unknown as typeof fetch;
        const rec = await DkZoningProvider.fetchZoningAtPoint(41.3874, 2.1686, { fetchImpl: countingFetch });
        expect(rec).toBeNull();
        expect(calls).toBe(0);
    });

    it('proxy no-plan ({ zoning: null }) → null (falls back to estimated)', async () => {
        const rec = await DkZoningProvider.fetchZoningAtPoint(55.6761, 12.5683, { fetchImpl: okFetch(null) });
        expect(rec).toBeNull();
    });

    it('upstream error / throw → null, never throws', async () => {
        const badFetch = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        await expect(
            DkZoningProvider.fetchZoningAtPoint(55.6761, 12.5683, { fetchImpl: badFetch }),
        ).resolves.toBeNull();
        const throwFetch = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        await expect(
            DkZoningProvider.fetchZoningAtPoint(55.6761, 12.5683, { fetchImpl: throwFetch }),
        ).resolves.toBeNull();
    });
});

describe('DK structured envelope — the L-399a end-to-end wedge (C58 §6.1)', () => {
    it('DK plan → computeBuildableEnvelope → confidence "structured" + cited derivation', () => {
        const rec = mapPlandataToZoningRecord(CPH_LOKALPLAN, { fetchDateISO: FETCH_DATE })!;
        const env = computeBuildableEnvelope({
            parcelRing: RECT,
            edgeClassifications: UNCLASSIFIED,
            zoning: rec,
            rulePack: null,
        });
        expect(env.confidence).toBe('structured'); // NOT "estimated-ruleset"
        expect(env.status).toBe('ok');
        expect(env.maxHeight_m).toBe(24);
        expect(env.maxFAR).toBeCloseTo(1.1, 6);
        // Every constraint is published-structured and cites the plan document (C58 §1.3).
        expect(env.derivation.length).toBeGreaterThan(0);
        for (const d of env.derivation) {
            expect(d.fieldProvenance).toBe('published-structured');
            expect(d.source).toBe('plandata-dk');
            expect(d.ordinanceRef).toBe('https://dokument.plandata.dk/20_3041234_APPROVED.pdf');
        }
    });
});
