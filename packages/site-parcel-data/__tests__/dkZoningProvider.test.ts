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

    it('L-609 — a BINDING byggefelt maps dims + identity, tags the cap, coverage stays null', () => {
        // A real building field (Birkerød Bymidte LP 92, probed live 2026-07-23): carries
        // maxbygnhjd/maxetager + the lp_* identity aliases + the bindingness flags, but NO
        // bebygpct. bygkunifelt=true & bygvejledende=false ⇒ a real footprint cap.
        const byggefelt: PlandataZoningResponse = {
            layer: 'byggefelt',
            properties: {
                lp_plannavn: 'Birkerød Bymidte',
                lp_plannr: 'LP 92',
                lokplan_id: 1218206,
                delnr: 'A',
                anvendelsegenerel: 'Boligområde',
                maxbygnhjd: 8,
                maxetager: 2,
                bygkunifelt: true,
                bygvejledende: false,
                doklink: 'https://dokument.plandata.dk/20_1218206.pdf',
                zonestatus: 'Byzone',
            },
        };
        const rec = mapPlandataToZoningRecord(byggefelt, { fetchDateISO: FETCH_DATE })!;
        expect(rec).not.toBeNull();
        expect(rec.structuredFields.maxHeight_m).toBe(8);
        expect(rec.structuredFields.maxFloors).toBe(2);
        // byggefelt carries NO bebygpct → no FAR (honest absence).
        expect(rec.structuredFields.plotRatioFAR).toBeNull();
        // The footprint is NOT turned into a coverage ratio (needs the parcel — ADR-gated).
        expect(rec.structuredFields.maxCoverage).toBeNull();
        // Identity resolves from the lp_* aliases; the sub-area is named.
        expect(rec.zoneLabel).toBe('Birkerød Bymidte (delområde A)');
        expect(rec.zoneCode).toBe('LP 92'); // no anvgen/plannr → falls to lp_plannr
        expect(rec.ordinanceRef).toBe('https://dokument.plandata.dk/20_1218206.pdf');
        // The binding cap is recorded as CONTEXT, never as a number.
        expect(rec.overlays).toContain('Bindende byggefelt');
        expect(rec.overlays).toContain('Byzone');
    });

    it('L-609 — a VEJLEDENDE (advisory) byggefelt maps its dim but earns NO binding tag', () => {
        const advisory: PlandataZoningResponse = {
            layer: 'byggefelt',
            properties: {
                lp_plannavn: 'Plan med vejledende felt',
                lp_plannr: 'LP 7',
                maxbygnhjd: 12,
                bygkunifelt: false,
                bygvejledende: true,
            },
        };
        const rec = mapPlandataToZoningRecord(advisory, { fetchDateISO: FETCH_DATE })!;
        expect(rec.structuredFields.maxHeight_m).toBe(12);
        expect(rec.overlays).not.toContain('Bindende byggefelt');
    });

    it('L-609 — a byggefelt with only a footprint (no dimension) → null record (defers to estimated)', () => {
        // Pure geometry, no number this path can express (coverage is ADR-gated) → null.
        const footprintOnly: PlandataZoningResponse = {
            layer: 'byggefelt',
            properties: { lp_plannavn: 'Felt uden tal', lp_plannr: 'LP 9', bygkunifelt: true, bygvejledende: false },
        };
        expect(mapPlandataToZoningRecord(footprintOnly, { fetchDateISO: FETCH_DATE })).toBeNull();
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

// ─────────────────────────────────────────────────────────────────────────────
// REAL live-probed Plandata features (probed 2026-07-24, geoserver.plandata.dk).
//
// These are the VERBATIM `properties` of two adopted plans returned by a live WFS
// GetFeature at real Copenhagen points — a lokalplan and a kommuneplanramme — kept
// as byte-faithful fixtures (integer `anvgen` code, the fractional `maxetager`, the
// many extra domain fields the mapper must IGNORE, and the honest absences: the
// lokalplan carries no `maxbygnhjd`, the ramme no `maxetager`). They pin the mapper
// against the real feed shape, not a hand-simplified stand-in. NEVER hits the network
// in tests — the probe captured them once; the assertions are deterministic.
//   • Østerbrogade kaserne (lokalplan 224, Østerbro 55.705,12.576): FAR 1.5, 5.5 storeys, mixed.
//   • R24.B.4.8 (kommuneplanramme, Vesterbro 55.668,12.548): FAR 1.5, 24 m, residential.

// Live-probed 2026-07-24 — pdk:theme_pdk_lokalplan_vedtaget at 55.705,12.576.
const REAL_CPH_LOKALPLAN: PlandataZoningResponse = {
    layer: 'lokalplan',
    properties: {
        id: 624359, planid: 1072569, komnr: 101, objektkode: 20, plantype: 20.1,
        plannr: '224', plannavn: 'Østerbrogade kaserne', anvgen: 21,
        datovedt: 19930610, datoikraft: 19930616,
        doklink: 'https://dokument.plandata.dk/20_1072569_1483707772194.pdf',
        bebygpct: 150, bebygpctaf: 2, maxetager: 5.5,
        anvendelsegenerel: 'Blandet bolig og erhverv', kommunenavn: 'København',
        status: 'V', versionsnr: 1, eareal: 70350, earealh: 1,
        ianvreg: false, izonereg: true, iomfangreg: false, iudstykreg: true,
        anvspec1: 1100, anvspec2: 3100, anvspec3: 3110, anvspec4: 4135,
        // Fields the mapper must not read (present + null on the real feature):
        maxbygnhjd: null, zonestatus: null, delnr: null,
    },
};

// Live-probed 2026-07-24 — pdk:theme_pdk_kommuneplanramme_vedtaget_v at 55.668,12.548.
const REAL_CPH_RAMME: PlandataZoningResponse = {
    layer: 'kommuneplanramme',
    properties: {
        oid: 2901540, id: 2901540, planid: 11363591, objektkode: 10,
        komplan_id: 11347088, plantype: 10.1, plannavn: 'R24.B.4.8 - B4',
        plannr: 'R24.B.4.8', distrikt: '4.1 Vesterbro/Kgs. Enghave', anvgen: 11,
        fzone: 1, datovedt: 20241212, planstatus: 'V', komnr: 101,
        doklink: 'https://dokument.plandata.dk/11_11347088_1737715824963.pdf',
        anvendelsegenerel: 'Boligområde',
        // NOTE: ramme features publish `fremtidigzonestatus`, NOT `zonestatus` — so the
        // Byzone overlay tag is an honest absence here (the mapper only reads `zonestatus`).
        fremtidigzonestatus: 'Byzone',
        bebygpct: 150, bebygpctaf: 4, maxbygnhjd: 24, iomfangreg: false,
        anvspec1: 1100,
        // Absences on the ramme: no storey cap.
        maxetager: null, zonestatus: null,
    },
};

describe('REAL live-probed Plandata features → structured (L-399a, probed 2026-07-24)', () => {
    it('a REAL lokalplan (Østerbrogade kaserne 224) maps to a structured record', () => {
        const rec = mapPlandataToZoningRecord(REAL_CPH_LOKALPLAN, { fetchDateISO: FETCH_DATE })!;
        expect(rec).not.toBeNull();
        expect(rec.jurisdictionId).toBe('dk');
        expect(rec.structuredFields.plotRatioFAR).toBeCloseTo(1.5, 6); // bebygpct 150 → FAR 1.50
        expect(rec.structuredFields.maxFloors).toBe(5); // maxetager 5.5 floored to 5
        expect(rec.structuredFields.maxHeight_m).toBeNull(); // no maxbygnhjd on this plan (honest)
        expect(rec.structuredFields.maxCoverage).toBeNull(); // FAR ≠ coverage
        expect(rec.structuredFields.permittedUse).toEqual(['mixed']); // "Blandet bolig og erhverv"
        expect(rec.zoneLabel).toBe('Østerbrogade kaserne');
        expect(rec.zoneCode).toBe('21'); // integer anvgen code coerced to string
        expect(rec.ordinanceRef).toBe('https://dokument.plandata.dk/20_1072569_1483707772194.pdf');
        expect(rec.provenance.source).toBe('plandata-dk');
        expect(rec.overlays).toEqual([]); // zonestatus null → no overlay (honest)
    });

    it('a REAL kommuneplanramme (R24.B.4.8) maps its height + FAR, honest null floors', () => {
        const rec = mapPlandataToZoningRecord(REAL_CPH_RAMME, { fetchDateISO: FETCH_DATE })!;
        expect(rec).not.toBeNull();
        expect(rec.structuredFields.maxHeight_m).toBe(24); // maxbygnhjd 24 m passthrough
        expect(rec.structuredFields.plotRatioFAR).toBeCloseTo(1.5, 6); // bebygpct 150 → FAR 1.50
        expect(rec.structuredFields.maxFloors).toBeNull(); // no maxetager on the ramme (honest)
        expect(rec.structuredFields.permittedUse).toEqual(['residential']); // "Boligområde"
        expect(rec.zoneLabel).toBe('R24.B.4.8 - B4');
        expect(rec.zoneCode).toBe('11'); // integer anvgen
        // ramme uses `fremtidigzonestatus`, so no Byzone overlay (mapper reads only `zonestatus`).
        expect(rec.overlays).toEqual([]);
    });

    it('the REAL lokalplan flows through the provider adapter (injected fetch) → structured', async () => {
        const okFetch = (async () => ({
            ok: true,
            json: async () => ({ zoning: REAL_CPH_LOKALPLAN }),
        })) as unknown as typeof fetch;
        const rec = await DkZoningProvider.fetchZoningAtPoint(55.705, 12.576, {
            fetchImpl: okFetch,
            nowISO: FETCH_DATE,
        });
        expect(rec).not.toBeNull();
        expect(rec!.structuredFields.plotRatioFAR).toBeCloseTo(1.5, 6);
        expect(rec!.structuredFields.maxFloors).toBe(5);
        expect(rec!.provenance.source).toBe('plandata-dk');
    });

    it('the REAL lokalplan → computeBuildableEnvelope → confidence "structured", status "ok"', () => {
        const rec = mapPlandataToZoningRecord(REAL_CPH_LOKALPLAN, { fetchDateISO: FETCH_DATE })!;
        const env = computeBuildableEnvelope({
            parcelRing: RECT,
            edgeClassifications: UNCLASSIFIED,
            zoning: rec,
            rulePack: null,
        });
        expect(env.confidence).toBe('structured'); // numbers came from the feed, not a pack
        expect(env.status).toBe('ok');
        expect(env.maxFAR).toBeCloseTo(1.5, 6);
        expect(env.maxHeight_m).toBeNull(); // honest absence, not a fabricated height
        for (const d of env.derivation) {
            expect(d.fieldProvenance).toBe('published-structured');
            expect(d.source).toBe('plandata-dk');
        }
    });

    it('the REAL kommuneplanramme → computeBuildableEnvelope → structured with a real 24 m height', () => {
        const rec = mapPlandataToZoningRecord(REAL_CPH_RAMME, { fetchDateISO: FETCH_DATE })!;
        const env = computeBuildableEnvelope({
            parcelRing: RECT,
            edgeClassifications: UNCLASSIFIED,
            zoning: rec,
            rulePack: null,
        });
        expect(env.confidence).toBe('structured');
        expect(env.status).toBe('ok');
        expect(env.maxHeight_m).toBe(24);
        expect(env.maxFAR).toBeCloseTo(1.5, 6);
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
