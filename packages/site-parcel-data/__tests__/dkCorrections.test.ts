// LANE DK — THE DENMARK CORRECTIONS (E1 verdict §G DK-parallel · plan E6), tested against
// the FROZEN R-batch shapes. Four deliverables, each with executed positive AND refusal
// arms; fixtures are the VERBATIM live-probed 2026-09-01 features (transcripts:
// audit/europe-site-intel/2026-08-31/impl/lane-dk-transcripts/), never hand-simplified:
//
//   1. the KEYLESS re-pin — FetchOutcome classification (empty ≠ failure), axis hedge;
//   2. THE DENOMINATOR BRANCH — bebygpctaf rides R2 valueBasis on every bebygpct rule;
//      the consumer computes the RIGHT GFA (Noerrebro af=4) or REFUSES NAMING THE BASIS
//      (Aarhus af=1) — the wrong-number path is DEAD in BOTH the C58 mapper and the
//      rule consumer, executed below;
//   3. the 4-layer ladder as R1 rank {scheme:'dk-plan-ladder', level}, resolution
//      ENGINE-side (evaluateZoneParameter picks min level, names the outranked rule);
//   4. lifecycle ('V', datovedt/datoikraft) + kompleks flags mirrored VERBATIM.

import { describe, it, expect } from 'vitest';
import { DeclarativeRulePackDocumentSchema, SiteIntelRuleSchema } from '@pryzm/schemas';
import type { DeclarativeRulePackDocument } from '@pryzm/schemas';
import {
    mapPlandataToZoningRecord,
    evaluateZoneParameter,
    type DeclarativeInstrumentContext,
} from '../src/index.js';
import { dkDensityScopeFromBygberegnaf } from '../src/rulepacks/dkPlandataEnvelope.js';
import { DK_SOURCES } from '../src/sourceRegistry/dk.js';
import {
    DK_ADAPTER_SOURCES,
    DK_PLANDATA_LAYERS,
    DK_PLANDATA_WFS_ENDPOINT,
    DK_PLAN_LADDER_SCHEME,
    buildDkPlandataPointUrl,
    deriveDkGfaFromBebygpctRule,
    dkPlandataLayerAtPoint,
    dkYyyymmddToIso,
    mapDkFeatureToRules,
    resolveDkJordstykkeAtWgs84Point,
} from '../src/countryAdapters/dk/index.js';

const FETCHED_AT = '2026-09-01';

// ── VERBATIM live-probed features (2026-09-01, keyless geoserver.plandata.dk) ──────────

/** Chain DK-A — CPH Nørrebro (12.5530, 55.6940): ramme R24.B.3.40, bebygpct=150 af=4. */
const CPH_RAMME_LIVE = {
    plannavn: 'R24.B.3.40 - B4',
    plannr: 'R24.B.3.40',
    planid: 11363461,
    komplan_id: 11347088,
    plantype: 10.1,
    anvgen: 11,
    anvendelsegenerel: 'Boligområde',
    bebygpct: 150,
    bebygpctaf: 4,
    maxbygnhjd: 24,
    maxetager: null,
    m3_m2: null,
    datovedt: 20241212,
    datoikraft: 20241212,
    planstatus: 'V',
    doklink: 'https://dokument.plandata.dk/11_11347088_1737715824963.pdf',
    zonestatus: null,
    fremtidigzonestatus: 'Byzone',
} as const;

/** Chain DK-B — Aarhus Midtby (10.2107, 56.1572): ramme 010109CY, bebygpct=180 af=1 —
 *  "of the area as a whole — a naive per-parcel 180% GFA would be WRONG" (lane 2 §DK-2). */
const AARHUS_RAMME_LIVE = {
    plannavn: 'Kommuneplan 2025',
    plannr: '010109CY',
    planid: 11714778,
    komplan_id: 11714748,
    plantype: 10.1,
    anvgen: 41,
    anvendelsegenerel: 'Centerområde',
    bebygpct: 180,
    bebygpctaf: 1,
    maxbygnhjd: null,
    maxetager: 4,
    m3_m2: null,
    datovedt: 20251217,
    datoikraft: 20260119,
    planstatus: 'V',
    doklink: 'https://dokument.plandata.dk/11_11714748_1768833193079.pdf',
    zonestatus: null,
    fremtidigzonestatus: 'Byzone',
} as const;

/** Aarhus lokalplan 591 at the same point — ALL dimensional nulls + kompleks=false SERVED. */
const AARHUS_LOKALPLAN_LIVE = {
    plannavn:
        'Temaplan om strøggadernes anvendelse og bygningers ydre fremtræden og skiltning. ' +
        'Centrale dele af Århus Midtby',
    plannr: '591',
    planid: 1213157,
    plantype: 20.1,
    anvgen: null,
    anvendelsegenerel: null,
    bebygpct: null,
    bebygpctaf: null,
    maxbygnhjd: null,
    maxetager: null,
    m3_m2: null,
    datovedt: 20000202,
    datoikraft: 20000315,
    status: 'V',
    kompleks: false,
    doklink: 'https://dokument.plandata.dk/20_1213157_APPROVED_1249028734582.pdf',
    zonestatus: 'Byzone',
} as const;

/** Live DAWA areas (2026-09-01): matr. 4801 → 3776 m²; matr. 7000ad → 8293 m². */
const CPH_PARCEL_AREA_M2 = 3776;
const AARHUS_PARCEL_AREA_M2 = 8293;

/* ═══════════════ Deliverable 2a — the C58 mapper's denominator branch ═══════════════ */

describe('§DK-DENOMINATOR-BRANCH — mapPlandataToZoningRecord reads the SERVED bebygpctaf', () => {
    it('Noerrebro af=4 (parcel-scoped): FAR = 1.50 emitted — the valid multiply survives', () => {
        const rec = mapPlandataToZoningRecord(
            { layer: 'kommuneplanramme', properties: CPH_RAMME_LIVE },
            { fetchDateISO: FETCHED_AT },
        )!;
        expect(rec).not.toBeNull();
        expect(rec.structuredFields.plotRatioFAR).toBeCloseTo(1.5, 6);
        expect(rec.structuredFields.maxHeight_m).toBe(24);
        // No withhold overlay — the basis is parcel-scoped.
        expect(rec.overlays.join(' ')).not.toContain('withheld');
    });

    it('THE AARHUS af=1 CASE: the wrong-number path is DEAD — FAR withheld NAMING the basis', () => {
        const rec = mapPlandataToZoningRecord(
            { layer: 'kommuneplanramme', properties: AARHUS_RAMME_LIVE },
            { fetchDateISO: FETCHED_AT },
        )!;
        expect(rec).not.toBeNull();
        // The naive 180 % → FAR 1.80 must be unreachable: the record carries NO per-parcel FAR.
        expect(rec.structuredFields.plotRatioFAR).toBeNull();
        // The absolute caps are scope-independent and survive.
        expect(rec.structuredFields.maxFloors).toBe(4);
        // The pct + its basis stay VISIBLE as a fact — the refusal names the basis verbatim.
        const overlay = rec.overlays.find((o) => o.includes('Bebyggelsesprocent'));
        expect(overlay).toBeDefined();
        expect(overlay!).toContain('180');
        expect(overlay!).toContain('Omraadet som helhed');
        expect(overlay!).toContain('bebygpctaf=1');
        expect(overlay!).toContain('FAR withheld (scope-planning-area');
    });

    it('af=2 (ejendom): FAR withheld naming "Den enkelte ejendom"', () => {
        const rec = mapPlandataToZoningRecord(
            {
                layer: 'lokalplan',
                properties: { plannavn: 'X', planid: 1, bebygpct: 150, bebygpctaf: 2, maxetager: 5.5 },
            },
            { fetchDateISO: FETCHED_AT },
        )!;
        expect(rec.structuredFields.plotRatioFAR).toBeNull();
        expect(rec.overlays.join(' ')).toContain('Den enkelte ejendom');
        expect(rec.overlays.join(' ')).toContain('FAR withheld (scope-property');
    });

    it('af=3 (grund): parcel-scoped under the signed L-449 mapping — FAR emitted', () => {
        const rec = mapPlandataToZoningRecord(
            {
                layer: 'lokalplan',
                properties: { plannavn: 'X', planid: 2, bebygpct: 40, bebygpctaf: 3 },
            },
            { fetchDateISO: FETCHED_AT },
        )!;
        expect(rec.structuredFields.plotRatioFAR).toBeCloseTo(0.4, 6);
    });

    it('bebygpctaf NOT served: UNKNOWN is never read as parcel — FAR withheld naming the gap', () => {
        const rec = mapPlandataToZoningRecord(
            {
                layer: 'lokalplan',
                properties: { plannavn: 'X', planid: 3, bebygpct: 45, maxbygnhjd: 12 },
            },
            { fetchDateISO: FETCHED_AT },
        )!;
        expect(rec.structuredFields.plotRatioFAR).toBeNull();
        const overlay = rec.overlays.find((o) => o.includes('Bebyggelsesprocent'));
        expect(overlay).toBeDefined();
        expect(overlay!).toContain('NOT served');
        expect(overlay!).toContain('the denominator is UNKNOWN');
        // The reason token is the L-449 SIGNED `DkFarWithheldReason`, not a string this
        // mapper invented — the mapper delegates to `resolveDkPlanEnvelope`.
        expect(overlay!).toContain('FAR withheld (scope-unknown');
    });

    it('a code OUTSIDE the state codelist: withheld naming the alien code (never absorbed)', () => {
        const rec = mapPlandataToZoningRecord(
            {
                layer: 'lokalplan',
                properties: { plannavn: 'X', planid: 4, bebygpct: 60, bebygpctaf: 5, maxbygnhjd: 9 },
            },
            { fetchDateISO: FETCHED_AT },
        )!;
        expect(rec.structuredFields.plotRatioFAR).toBeNull();
        expect(rec.overlays.join(' ')).toContain('outside the state bygberegnaf codelist');
        expect(rec.overlays.join(' ')).toContain('FAR withheld (scope-unknown');
    });

    it('the adapter-side code→scope mapping matches the state codelist semantics', () => {
        expect(dkDensityScopeFromBygberegnaf(1)).toBe('planningArea');
        expect(dkDensityScopeFromBygberegnaf(2)).toBe('property');
        expect(dkDensityScopeFromBygberegnaf(3)).toBe('parcel');
        expect(dkDensityScopeFromBygberegnaf(4)).toBe('parcel');
        expect(dkDensityScopeFromBygberegnaf('4')).toBe('parcel'); // GeoServer string form
        expect(dkDensityScopeFromBygberegnaf(5)).toBeNull(); // fifth code → UNKNOWN, not parcel
        expect(dkDensityScopeFromBygberegnaf(null)).toBeNull();
    });
});

/* ═══════════════ Deliverable 2b + 3 + 4 — the DK rule mapper (frozen model) ═════════ */

describe('mapDkFeatureToRules — R2 valueBasis + R1 rank + mirrored lifecycle/kompleks', () => {
    it('Noerrebro ramme: bebygpct rule carries valueBasis {dk-bygberegnaf, "4"} VERBATIM', () => {
        const { plan, rules } = mapDkFeatureToRules('kommuneplanramme', CPH_RAMME_LIVE, FETCHED_AT);
        const bebygpct = rules.find((r) => r.provenance.parameter === 'bebygpct')!;
        expect(bebygpct.provenance.value).toBe(150);
        expect(bebygpct.provenance.unit).toBe('%');
        expect(bebygpct.provenance.valueBasis).toEqual({ scheme: 'dk-bygberegnaf', code: '4' });
        expect(bebygpct.provenance.confidence.tier).toBe(1);
        // R1: the basis resolves to the plan minted RIGHT HERE (no dangling strings).
        expect(bebygpct.applicability.basis).toEqual([{ kind: 'plan', ref: plan.id }]);
        // R3: the register served a machine validity axis → legal, datoikraft mirrored.
        expect(bebygpct.provenance.validityBasis).toBe('legal');
        expect(bebygpct.provenance.valid_from).toBe('2024-12-12');
        // The plan document citation travels verbatim.
        expect(bebygpct.provenance.source.document).toBe(CPH_RAMME_LIVE.doklink);
    });

    it('every rule of every layer carries R1 rank {dk-plan-ladder, <rung>} (deliverable 3)', () => {
        const ramme = mapDkFeatureToRules('kommuneplanramme', CPH_RAMME_LIVE, FETCHED_AT);
        for (const r of ramme.rules) {
            expect(r.applicability.rank).toEqual({ scheme: DK_PLAN_LADDER_SCHEME, level: 4 });
        }
        const lok = mapDkFeatureToRules('lokalplan', AARHUS_LOKALPLAN_LIVE, FETCHED_AT);
        for (const r of lok.rules) {
            expect(r.applicability.rank).toEqual({ scheme: DK_PLAN_LADDER_SCHEME, level: 3 });
        }
        // The ladder table is the measured precedence order, most-specific first.
        expect(DK_PLANDATA_LAYERS.map((l) => `${l.layer}:${l.rankLevel}`)).toEqual([
            'byggefelt:1',
            'lokalplandelomraade:2',
            'lokalplan:3',
            'kommuneplanramme:4',
        ]);
    });

    it('lifecycle mirrored VERBATIM (deliverable 4): status "V", datovedt/datoikraft typed', () => {
        const { plan } = mapDkFeatureToRules('kommuneplanramme', AARHUS_RAMME_LIVE, FETCHED_AT);
        expect(plan.status).toBe('V'); // the served planstatus token, never harmonised
        expect(plan.kind).toBe('kommuneplanramme');
        expect(plan.adoptedDate).toBe('2025-12-17');
        expect(plan.inForceFrom).toBe('2026-01-19');
        const lok = mapDkFeatureToRules('lokalplan', AARHUS_LOKALPLAN_LIVE, FETCHED_AT);
        expect(lok.plan.status).toBe('V'); // lokalplan serves `status`, ramme `planstatus`
        expect(lok.plan.kind).toBe('lokalplan');
    });

    it('kompleks mirrored VERBATIM where served — false is a served value, not an absence', () => {
        const { rules } = mapDkFeatureToRules('lokalplan', AARHUS_LOKALPLAN_LIVE, FETCHED_AT);
        const kompleks = rules.find((r) => r.provenance.parameter === 'kompleks')!;
        expect(kompleks).toBeDefined();
        expect(kompleks.provenance.value).toBe(false);
        expect(kompleks.provenance.confidence.tier).toBe(1);
        // A feature that does not serve the flag gets NO kompleks rule (absence ≠ false).
        const ramme = mapDkFeatureToRules('kommuneplanramme', CPH_RAMME_LIVE, FETCHED_AT);
        expect(ramme.rules.find((r) => r.provenance.parameter === 'kompleks')).toBeUndefined();
    });

    it('tier-6 UNKNOWN rows are VISIBLE, never dropped (fill is 30–61% by layer, not ~96%)', () => {
        // The live Aarhus lokalplan serves ALL dimensional nulls — three tier-6 rows.
        const lok = mapDkFeatureToRules('lokalplan', AARHUS_LOKALPLAN_LIVE, FETCHED_AT);
        const tier6 = lok.rules.filter((r) => r.provenance.confidence.tier === 6);
        expect(tier6.map((r) => r.provenance.parameter).sort()).toEqual([
            'bebygpct',
            'maxbygnhjd',
            'maxetager',
        ]);
        for (const r of tier6) expect(r.provenance.value).toBeNull(); // UNKNOWN ≠ 0 ≠ no-limit
        // The live CPH ramme serves maxetager=null — its tier-6 row is beside two tier-1 rows.
        const ramme = mapDkFeatureToRules('kommuneplanramme', CPH_RAMME_LIVE, FETCHED_AT);
        const etager = ramme.rules.find((r) => r.provenance.parameter === 'maxetager')!;
        expect(etager.provenance.confidence.tier).toBe(6);
        expect(etager.provenance.value).toBeNull();
    });

    it('byggefelt declares NO bebygpct: field absence ≠ value unknownness; bygvejledende → R5', () => {
        const bf = mapDkFeatureToRules(
            'byggefelt',
            {
                planid: 7,
                lokplan_id: 7,
                plannavn: 'Byggefelt-plan',
                maxbygnhjd: 8.5,
                maxetager: null,
                bygvejledende: true,
                bygkunifelt: false,
            },
            FETCHED_AT,
        );
        expect(bf.rules.find((r) => r.provenance.parameter === 'bebygpct')).toBeUndefined();
        const h = bf.rules.find((r) => r.provenance.parameter === 'maxbygnhjd')!;
        expect(h.provenance.value).toBe(8.5);
        // R5: the served indicative flag mirrors verbatim — never harmonised, never defaulted.
        expect(h.provenance.normativeForce).toBe('bygvejledende');
        expect(h.applicability.rank).toEqual({ scheme: DK_PLAN_LADDER_SCHEME, level: 1 });
    });

    it('maxetager decimals stay VERBATIM in the register mirror (5.5 is not floored here)', () => {
        const { rules } = mapDkFeatureToRules(
            'lokalplan',
            { planid: 8, plannavn: 'X', maxetager: 5.5, bebygpct: null },
            FETCHED_AT,
        );
        expect(rules.find((r) => r.provenance.parameter === 'maxetager')!.provenance.value).toBe(5.5);
    });

    it('a bebygpctaf OUTSIDE the closed state codelist FAILS the mapping BY NAME', () => {
        expect(() =>
            mapDkFeatureToRules(
                'lokalplan',
                { planid: 9, plannavn: 'X', bebygpct: 40, bebygpctaf: 5 },
                FETCHED_AT,
            ),
        ).toThrowError(/bebygpctaf=5.*outside the state.*codelist/s);
    });

    it('a SERVED denominator survives a tier-6 UNKNOWN percentage (E4 control 8: qualifiers ' +
        'survive normalization)', () => {
        // Measured 2026-09-01: 261 features nationally serve `bebygpctaf` with a NULL
        // `bebygpct` (21 lokalplan · 234 delområde · 6 ramme). The code is a served FACT about
        // the rule; dropping it because the value is UNKNOWN would lose a qualifier the
        // register published.
        const { rules } = mapDkFeatureToRules(
            'lokalplan',
            { planid: 21, plannavn: 'X', bebygpct: null, bebygpctaf: 1 },
            FETCHED_AT,
        );
        const r = rules.find((x) => x.provenance.parameter === 'bebygpct')!;
        expect(r.provenance.confidence.tier).toBe(6);
        expect(r.provenance.value).toBeNull();
        expect(r.provenance.valueBasis).toEqual({ scheme: 'dk-bygberegnaf', code: '1' });
        expect(r.provenance.confidence.note).toContain('UNKNOWN');
        expect(r.provenance.confidence.note).toContain('Omraadet som helhed');
        // The GFA consumer still refuses — naming the basis first, since a plan-area budget
        // is not a per-parcel number whether or not the percentage is known.
        const out = deriveDkGfaFromBebygpctRule(r, 1000);
        expect(out.kind).toBe('refused');
        if (out.kind === 'refused') expect(out.reason).toBe('basis-planning-area');
    });

    it('an ALIEN code fails the mapping even when the percentage is UNKNOWN (a national schema ' +
        'change is never absorbed by a null)', () => {
        expect(() =>
            mapDkFeatureToRules(
                'lokalplan',
                { planid: 22, plannavn: 'X', bebygpct: null, bebygpctaf: 9 },
                FETCHED_AT,
            ),
        ).toThrowError(/bebygpctaf=9.*outside the state.*codelist/s);
    });

    it('bebygpctaf NOT served → NO valueBasis; the note names the refusal obligation', () => {
        const { rules } = mapDkFeatureToRules(
            'lokalplan',
            { planid: 10, plannavn: 'X', bebygpct: 45 },
            FETCHED_AT,
        );
        const r = rules.find((x) => x.provenance.parameter === 'bebygpct')!;
        expect(r.provenance.valueBasis).toBeUndefined();
        expect(r.provenance.confidence.note).toContain('bebygpctaf NOT served');
    });

    it('a feature with NO mintable plan identity throws BY NAME (R1: nothing to apply to)', () => {
        expect(() =>
            mapDkFeatureToRules('lokalplan', { bebygpct: 40, bebygpctaf: 4 }, FETCHED_AT),
        ).toThrowError(/NO plan identity/);
    });

    it('dkYyyymmddToIso: deterministic format conversion, null on malformed — never guessed', () => {
        expect(dkYyyymmddToIso(20241212)).toBe('2024-12-12');
        expect(dkYyyymmddToIso('20000315')).toBe('2000-03-15');
        expect(dkYyyymmddToIso(20241301)).toBeNull(); // month 13
        expect(dkYyyymmddToIso(null)).toBeNull();
        expect(dkYyyymmddToIso('yesterday')).toBeNull();
    });
});

/* ═══════════════ Deliverable 2c — the evaluator-side GFA consumer branch ════════════ */

describe('deriveDkGfaFromBebygpctRule — the RIGHT GFA or a refusal NAMING THE BASIS', () => {
    const cphRule = () =>
        mapDkFeatureToRules('kommuneplanramme', CPH_RAMME_LIVE, FETCHED_AT).rules.find(
            (r) => r.provenance.parameter === 'bebygpct',
        )!;
    const aarhusRule = () =>
        mapDkFeatureToRules('kommuneplanramme', AARHUS_RAMME_LIVE, FETCHED_AT).rules.find(
            (r) => r.provenance.parameter === 'bebygpct',
        )!;

    it('Noerrebro (af=4, live parcel 3776 m²): GFA = 150% × 3776 = 5664 m² — the RIGHT number', () => {
        const out = deriveDkGfaFromBebygpctRule(cphRule(), CPH_PARCEL_AREA_M2);
        expect(out.kind).toBe('computed');
        if (out.kind === 'computed') {
            expect(out.gfaM2).toBeCloseTo(5664, 6);
            expect(out.basisCode).toBe('4');
            expect(out.basisDa).toBe('Det enkelte jordstykke');
        }
    });

    it('THE AARHUS af=1 CASE (live parcel 8293 m²): REFUSED naming the basis — no number exists', () => {
        const out = deriveDkGfaFromBebygpctRule(aarhusRule(), AARHUS_PARCEL_AREA_M2);
        expect(out.kind).toBe('refused');
        if (out.kind === 'refused') {
            expect(out.reason).toBe('basis-planning-area');
            expect(out.basisCode).toBe('1');
            expect(out.basisDa).toBe('Omraadet som helhed');
            expect(out.detail).toContain('180');
            expect(out.detail).toContain('wrong GFA');
        }
        // The wrong-number path is DEAD: no gfa field exists on a refusal, and the naive
        // 180% × 8293 = 14927.4 m² appears NOWHERE in the outcome.
        expect((out as Record<string, unknown>)['gfaM2']).toBeUndefined();
        expect(JSON.stringify(out)).not.toContain('14927');
    });

    it('af=2 (ejendom) → refused basis-property; the parcel is not the denominator', () => {
        const { rules } = mapDkFeatureToRules(
            'lokalplan',
            { planid: 11, plannavn: 'X', bebygpct: 150, bebygpctaf: 2 },
            FETCHED_AT,
        );
        const out = deriveDkGfaFromBebygpctRule(
            rules.find((r) => r.provenance.parameter === 'bebygpct')!,
            1000,
        );
        expect(out.kind).toBe('refused');
        if (out.kind === 'refused') {
            expect(out.reason).toBe('basis-property');
            expect(out.basisDa).toBe('Den enkelte ejendom');
        }
    });

    it('valueBasis absent → refused basis-not-served (UNKNOWN is never read as parcel)', () => {
        const { rules } = mapDkFeatureToRules(
            'lokalplan',
            { planid: 12, plannavn: 'X', bebygpct: 45 },
            FETCHED_AT,
        );
        const out = deriveDkGfaFromBebygpctRule(
            rules.find((r) => r.provenance.parameter === 'bebygpct')!,
            1000,
        );
        expect(out.kind).toBe('refused');
        if (out.kind === 'refused') expect(out.reason).toBe('basis-not-served');
    });

    it('a foreign valueBasis scheme is refused, never guessed', () => {
        const rule = SiteIntelRuleSchema.parse({
            id: 'fx-foreign',
            body: null,
            applicability: { basis: [], geometry: null, useScope: [], rank: null, condition: { var: 'parcelAreaM2' } },
            provenance: {
                parameter: 'bebygpct',
                value: 100,
                unit: '%',
                source: { country: 'DK', authority: 'X', dataset: 'x', plan_id: null, object_id: null, document: null, article: null, page: null },
                derivation: 'DIRECT',
                valueLocation: 'attribute',
                valueBasis: { scheme: 'ee-vertical-datum', code: 'EH2000' },
                confidence: { tier: 1 },
                normativeForce: null,
                validityBasis: 'ingestion',
                valid_from: FETCHED_AT,
                valid_to: null,
            },
        });
        const out = deriveDkGfaFromBebygpctRule(rule, 1000);
        expect(out.kind).toBe('refused');
        if (out.kind === 'refused') expect(out.reason).toBe('basis-foreign-scheme');
    });

    it('invalid parcel area → refused parcel-area-invalid (never NaN arithmetic)', () => {
        const out = deriveDkGfaFromBebygpctRule(cphRule(), Number.NaN);
        expect(out.kind).toBe('refused');
        if (out.kind === 'refused') expect(out.reason).toBe('parcel-area-invalid');
    });
});

/* ═══════════════ Deliverable 3 — rank RESOLUTION stays engine-side ══════════════════ */

describe('R1 rank dk-plan-ladder — evaluateZoneParameter resolves mapper-emitted rungs', () => {
    const CTX: DeclarativeInstrumentContext = {
        instrument: { id: 'Lokalplan 9999001', kind: 'binding-plan' },
        legalStatus: 'binding',
        legalStatusSource: 'metadata',
        citation: 'lane DK rank fixture (mapper-emitted rules, one plan, two ladder rungs)',
    };

    it('a delområde rule (level 2) OUTRANKS its whole-plan rule (level 3); the loser is NAMED', () => {
        // One instrument, two ladder rungs — exactly the DK shape (sub-area numbers govern
        // over whole-plan numbers). Both features resolve the SAME plan identity, so the
        // pack document's single minted plan seats both rules' basis refs (R1 contract).
        const lok = mapDkFeatureToRules(
            'lokalplan',
            { planid: 9999001, plannr: '901', plannavn: 'Lokalplan 901', bebygpct: 110, bebygpctaf: 4, datoikraft: 20200101, status: 'V' },
            FETCHED_AT,
        );
        const del = mapDkFeatureToRules(
            'lokalplandelomraade',
            { lokplan_id: 9999001, lp_plannr: '901', lp_plannavn: 'Lokalplan 901', delnr: '3', bebygpct: 185, bebygpctaf: 4, datoikraft: 20200101 },
            FETCHED_AT,
        );
        expect(del.plan.id).toBe(lok.plan.id); // one instrument, one minted identity
        const bebygLok = lok.rules.find((r) => r.provenance.parameter === 'bebygpct')!;
        const bebygDel = del.rules.find((r) => r.provenance.parameter === 'bebygpct')!;
        expect(bebygLok.applicability.rank!.level).toBe(3);
        expect(bebygDel.applicability.rank!.level).toBe(2);

        const doc: DeclarativeRulePackDocument = DeclarativeRulePackDocumentSchema.parse({
            formatVersion: 1,
            plan: lok.plan,
            packs: [
                {
                    meta: {
                        jurisdictionId: 'dk-lane-fixture',
                        displayName: 'LANE DK rank fixture',
                        source: 'plandata-dk',
                        crs: 'EPSG:25832',
                        lastReviewed: FETCHED_AT,
                        defaultConfidence: 'structured',
                    },
                    zones: [
                        {
                            code: 'DK-FX-901',
                            label: 'Lokalplan 901 (fixture zone)',
                            permittedUse: [],
                            fieldProvenance: {},
                            ordinanceRef: null,
                            inheritsFromZoneCode: null,
                            rules: [bebygLok, bebygDel],
                        },
                    ],
                },
            ],
            constructions: [],
            notes: [],
        });

        const ev = evaluateZoneParameter(
            doc,
            'DK-FX-901',
            'bebygpct',
            { basis: 'current-set', date: '2026-09-01' },
            CTX,
        );
        // Engine-side resolution: min level wins on the one dk-plan-ladder scheme.
        expect(ev.outcome.kind).toBe('resolved-unattributed');
        if (ev.outcome.kind === 'resolved-unattributed') {
            expect(ev.outcome.value).toBe(185); // the delområde number governs
            expect(ev.outcome.winningRuleId).toBe(bebygDel.id);
            expect(ev.outcome.rankRejected).toHaveLength(1);
            expect(ev.outcome.rankRejected[0]!.ruleId).toBe(bebygLok.id);
            expect(ev.outcome.rankRejected[0]!.detail).toContain('level 3 loses to level 2');
            expect(ev.outcome.rankRejected[0]!.detail).toContain(DK_PLAN_LADDER_SCHEME);
        }
    });
});

/* ═══════════════ Deliverable 1 — the keyless re-pin, FetchOutcome-classified ════════ */

describe('the keyless Plandata re-pin — FetchOutcome on failure, empty ≠ failure', () => {
    const jsonRes = (body: unknown) =>
        ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as unknown as Response;

    it('the adapter mints NO source rows — it RESOLVES the registry rows (non-rivalry, C84 EI-9)', () => {
        // An earlier draft of this lane minted a SECOND `dk-plandata-wfs` row inside
        // countryAdapters/dk/, divergent from sourceRegistry/dk.ts and unreachable through
        // SOURCE_REGISTRY. These are now the SAME OBJECTS — identity, not deep equality, so a
        // future copy cannot pass this test by looking alike.
        for (const row of DK_ADAPTER_SOURCES) {
            expect(DK_SOURCES.includes(row), `${row.id} must BE the registry row`).toBe(true);
        }
        expect(DK_ADAPTER_SOURCES.map((r) => r.id)).toEqual([
            'dk-dawa-jordstykker',
            'dk-plandata-wfs',
        ]);
        // Both halves of the DK critical path are keyless; only Datafordeler carries a gate.
        for (const row of DK_ADAPTER_SOURCES) expect(row.gate).toBeNull();
        const datafordeler = DK_SOURCES.filter((r) => r.id.includes('datafordeler'));
        expect(datafordeler.length).toBeGreaterThan(0);
        for (const row of datafordeler) expect(row.gate).not.toBeNull();
        // The module-load drift guard is what keeps the registry endpoint and the client pin
        // from diverging; assert the state it enforces.
        expect(DK_ADAPTER_SOURCES.find((r) => r.id === 'dk-plandata-wfs')!.endpoint).toBe(
            DK_PLANDATA_WFS_ENDPOINT,
        );
    });

    it('the pinned endpoints are the measured KEYLESS ones — no token parameter exists', () => {
        expect(DK_PLANDATA_WFS_ENDPOINT).toBe('https://geoserver.plandata.dk/geoserver/wfs');
        const url = buildDkPlandataPointUrl('pdk:theme_pdk_kommuneplanramme_vedtaget_v', 12.553, 55.694, 'lonlat');
        expect(url.startsWith('https://geoserver.plandata.dk/geoserver/wfs?')).toBe(true);
        expect(url).not.toMatch(/apikey|token|username|password/i);
        // The typed source rows record the keyless gate + the dated live probes.
        const plandataRow = DK_ADAPTER_SOURCES.find((s) => s.id === 'dk-plandata-wfs')!;
        expect(plandataRow.gate).toBeNull();
        expect(plandataRow.probes.some((p) => p.date === '2026-09-01')).toBe(true);
    });

    it('AXIS HEDGE (measured): zero on lon,lat retries lat,lon before concluding absent', async () => {
        const seen: string[] = [];
        const fetchImpl = (async (url: string) => {
            seen.push(url);
            // First order answers a clean zero; the swapped order carries the feature —
            // the measured silent-axis trap must not read as "no plan here".
            return seen.length === 1
                ? jsonRes({ features: [] })
                : jsonRes({ features: [{ properties: { planid: 1, plannavn: 'X', bebygpct: 40, bebygpctaf: 4 } }] });
        }) as unknown as typeof fetch;
        const out = await dkPlandataLayerAtPoint('pdk:theme_pdk_lokalplan_vedtaget', 55.694, 12.553, { fetchImpl });
        expect(out.status).toBe('found');
        expect(seen).toHaveLength(2);
    });

    it('EMPTY ≠ FAILURE: both orders empty → absent (durable); HTTP 500 → transient (named)', async () => {
        const emptyFetch = (async () => jsonRes({ features: [] })) as unknown as typeof fetch;
        const empty = await dkPlandataLayerAtPoint('pdk:theme_pdk_lokalplan_vedtaget', 55.7, 12.55, { fetchImpl: emptyFetch });
        expect(empty.status).toBe('absent');
        if (empty.status === 'absent') expect(empty.reason).toContain('both bbox axis orders');

        const failFetch = (async () =>
            ({ ok: false, status: 500, text: async () => 'boom' }) as unknown as Response) as unknown as typeof fetch;
        const fail = await dkPlandataLayerAtPoint('pdk:theme_pdk_lokalplan_vedtaget', 55.7, 12.55, { fetchImpl: failFetch });
        expect(fail.status).toBe('transient');
        if (fail.status === 'transient') expect(fail.reason).toContain('HTTP 500');
    });

    it('an ows:ExceptionReport (wrong layer) is a SELF-NAMING transient, never "no data"', async () => {
        const excFetch = (async () =>
            ({
                ok: true,
                status: 200,
                text: async () =>
                    '<ows:ExceptionReport><ows:Exception><ows:ExceptionText>Feature type pdk:wrongname unknown</ows:ExceptionText></ows:Exception></ows:ExceptionReport>',
            }) as unknown as Response) as unknown as typeof fetch;
        const out = await dkPlandataLayerAtPoint('pdk:wrongname', 55.7, 12.55, { fetchImpl: excFetch });
        expect(out.status).toBe('transient');
        if (out.status === 'transient') expect(out.reason).toContain('pdk:wrongname unknown');
    });

    it('DAWA parcel leg: found maps the measured fields; [] → absent; throw → transient', async () => {
        const found = await resolveDkJordstykkeAtWgs84Point(55.694, 12.553, {
            fetchImpl: (async () =>
                jsonRes([
                    {
                        matrikelnr: '4801',
                        ejerlav: { kode: 2000173, navn: 'Udenbys Klædebo Kvarter, København' },
                        kommune: { kode: '0101', navn: 'København' },
                        bfenummer: 6021259,
                        registreretareal: 3776,
                        vejareal: 0,
                    },
                ])) as unknown as typeof fetch,
        });
        expect(found.status).toBe('found');
        if (found.status === 'found') {
            expect(found.value.matrikelnr).toBe('4801');
            expect(found.value.bfe).toBe(6021259);
            expect(found.value.registreretArealM2).toBe(3776);
        }
        const none = await resolveDkJordstykkeAtWgs84Point(57.0, 10.0, {
            fetchImpl: (async () => jsonRes([])) as unknown as typeof fetch,
        });
        expect(none.status).toBe('absent');
        const down = await resolveDkJordstykkeAtWgs84Point(55.694, 12.553, {
            fetchImpl: (async () => {
                throw new Error('network down');
            }) as unknown as typeof fetch,
        });
        expect(down.status).toBe('transient');
        if (down.status === 'transient') expect(down.reason).toContain('endpoint-unreachable');
    });
});
