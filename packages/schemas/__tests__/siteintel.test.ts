// E1a (EUROPE-IMPLEMENTATION-PLAN §E1a · REPORT §I · BRIEF §11) — canonical-model
// round-trip proof.
//
// The load-bearing assertions:
//   1. The REPORT §I worked example (EE maxHeight 17.4 m, PLANK dp_hoonestus,
//      tier 1) parses VERBATIM — including the BRIEF's short `plan`/`object`
//      source keys — and round-trips parse → JSON → parse loss-free.
//   2. The BRIEF §11 example (maximum_height 18 m, DE) round-trips the same way.
//   3. The DK and LT worked chains (REPORT §R / lanes 2+4) round-trip, with
//      their state vocabularies (bebygpctaf codelist, ASGR field names) resolved
//      from the IMPORTED codelists, never re-typed.
//   4. All 17 entities round-trip an EE-flavoured mini-graph.
//   5. Falsification (permanent form): corrupting one REQUIRED provenance field
//      makes the parse FAIL NAMING THE FIELD; the honesty invariants
//      (UNKNOWN ≠ 0, delta-null-propagation, closed codelists) reject
//      violations by construction.
//   6. The R-batch (E1 gate decision §C · challenge verdict §E, landed as ONE
//      change-set then frozen per §H): R1 typed applicability value object ·
//      R2 value-basis qualifier · R3 validityBasis · R4 planning-object
//      evidence kinds · R5 normative force · tier-projection coherence — each
//      with a positive and a negative arm. NOTE: the worked-example fixtures
//      below carry the R-batch fields (validityBasis, valueBasis) IN ADDITION
//      to their verbatim REPORT/BRIEF content — every record emitted before the
//      R-batch must be re-emitted (gate decision §F Step 0), fixtures included.

import { describe, expect, it } from 'vitest';
import {
    // confidence
    SiteIntelConfidenceTierSchema,
    SITEINTEL_CONFIDENCE_TIER_NUMBER,
    confidenceTierName,
    // provenance
    RuleProvenanceSchema,
    RuleSourceRefSchema,
    // vocabularies
    DK_BYGBEREGNAF_CODELIST,
    DkBygberegnafCodeSchema,
    dkBygberegnafRow,
    NL_IMOW_VALUE_LISTS,
    NlNormwaardeKindSchema,
    nlNormwaardeValueLocation,
    LtAsgrValueFieldSchema,
    ltAsgrProvenanceColumns,
    // entities
    RuleApplicabilitySchema,
    RuleBasisKindSchema,
    EvidenceRefKindSchema,
    SiteIntelParcelSchema,
    SiteIntelBuildingSchema,
    SiteIntelTerrainSchema,
    SiteIntelRoadSchema,
    SiteIntelPlanSchema,
    SiteIntelZoneSchema,
    SiteIntelPrescriptionSchema,
    SiteIntelRestrictionSchema,
    SiteIntelRegulationSchema,
    SiteIntelRuleSchema,
    SiteIntelSourceSchema,
    SiteIntelEvidenceSchema,
    SiteIntelDocumentSchema,
    SiteIntelScenarioSchema,
    SiteIntelEnvelopeSchema,
    SiteIntelDevelopmentPotentialSchema,
    SiteIntelVersionSchema,
    SiteIntelConfidenceSchema,
} from '../src/siteintel/index.js';
import type { z } from 'zod';

/** parse → serialize → re-parse → the two parsed forms are identical. */
function roundTrip<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
    const first = schema.parse(raw);
    const second = schema.parse(JSON.parse(JSON.stringify(first)));
    expect(second).toEqual(first);
    return first;
}

/* ── 1 · REPORT §I worked example, VERBATIM (EE, maxHeight 17.4 m) ─────────── */

const EE_REPORT_I_EXAMPLE = {
    parameter: 'maxHeight',
    value: 17.4,
    unit: 'm',
    source: {
        country: 'EE',
        authority: 'PLANK/PLANIS',
        dataset: 'dp_hoonestus',
        plan: '…',
        object: 'hoonestusala Kopli tn 2',
        document: null,
        article: null,
        page: null,
    },
    derivation: 'DIRECT',
    valueLocation: 'attribute',
    confidence: { tier: 1, note: 'korgus=0/empty means UNKNOWN, never no-limit' },
    // R3 (gate §C): kehtestamine date = the LEGAL validity axis, machine-visible.
    validityBasis: 'legal',
    valid_from: '2018-05-02',
    valid_to: null,
} as const;

describe('REPORT §I worked example (EE) — verbatim round-trip', () => {
    it('parses and round-trips loss-free', () => {
        const parsed = roundTrip(RuleProvenanceSchema, EE_REPORT_I_EXAMPLE);
        expect(parsed.value).toBe(17.4);
        expect(parsed.unit).toBe('m');
        expect(parsed.confidence.tier).toBe(1);
        expect(parsed.valid_to).toBeNull();
    });

    it("maps the BRIEF's short `plan`/`object` keys onto canonical plan_id/object_id", () => {
        const parsed = RuleProvenanceSchema.parse(EE_REPORT_I_EXAMPLE);
        expect(parsed.source.plan_id).toBe('…');
        expect(parsed.source.object_id).toBe('hoonestusala Kopli tn 2');
        expect('plan' in parsed.source).toBe(false);
        expect('object' in parsed.source).toBe(false);
    });
});

/* ── 2 · BRIEF §11 example (DE, maximum_height 18 m) ──────────────────────── */

const DE_BRIEF_11_EXAMPLE = {
    parameter: 'maximum_height',
    value: 18,
    unit: 'm',
    source: {
        country: 'DE',
        authority: 'Stadt (B-Plan)', // fixture addressing — the BRIEF §11 "why is max height 18m" example
        dataset: 'xplan_bp_plan',
        plan_id: 'BP-Beispiel-01',
        object_id: null,
        document: 'bplan-textteil.pdf',
        article: '§ 4 (2)',
        page: 12,
    },
    derivation: 'AI_EXTRACTED',
    valueLocation: 'in-document-text',
    confidence: { tier: 4 },
    validityBasis: 'legal',
    valid_from: '2019-03-01',
    valid_to: null,
};

describe('BRIEF §11 example (DE, maximum_height 18 m) — round-trip', () => {
    it('parses and round-trips loss-free with document/article/page addressing', () => {
        const parsed = roundTrip(RuleProvenanceSchema, DE_BRIEF_11_EXAMPLE);
        expect(parsed.value).toBe(18);
        expect(parsed.source.article).toBe('§ 4 (2)');
        expect(parsed.source.page).toBe(12);
        expect(confidenceTierName(parsed.confidence.tier)).toBe('ai-interpretation');
    });
});

/* ── 3 · DK + LT worked chains (REPORT §R · lanes 2 + 4) ──────────────────── */

describe('DK worked chain — bebygpct 150 with CODED denominator (lane 2 §DK-2)', () => {
    const dkRule = {
        parameter: 'bebygpct',
        value: 150,
        unit: '%',
        source: {
            country: 'DK',
            authority: 'Plandata.dk',
            dataset: 'theme_pdk_kommuneplanramme',
            plan_id: 'R24.B.3.40',
            object_id: null,
            document: null,
            article: null,
            page: null,
        },
        derivation: 'DIRECT',
        valueLocation: 'attribute',
        // R2 (gate §C): the denominator code rides the TYPED seat, verbatim —
        // no longer the never-load-bearing confidence.note (architect §5.3:
        // the note apology was the demonstrated DK wrong-GFA path).
        valueBasis: { scheme: 'dk-bygberegnaf', code: '4' },
        confidence: { tier: 1 },
        validityBasis: 'legal',
        valid_from: '2024-12-12',
        valid_to: null,
    };

    it('round-trips the ramme rule with the denominator in the TYPED valueBasis seat', () => {
        const parsed = roundTrip(RuleProvenanceSchema, dkRule);
        expect(parsed.value).toBe(150);
        expect(parsed.valueBasis).toEqual({ scheme: 'dk-bygberegnaf', code: '4' });
        // The note no longer carries logic: a typed-fields-only consumer now
        // SEES the denominator (gate decision §B.1).
        expect(parsed.confidence.note).toBeUndefined();
    });

    it('resolves bebygpctaf=4 from the IMPORTED codelist: the individual cadastral parcel', () => {
        const code = DkBygberegnafCodeSchema.parse(4);
        expect(dkBygberegnafRow(code).en).toBe('the individual cadastral parcel');
        expect(DK_BYGBEREGNAF_CODELIST).toHaveLength(4);
        // The Aarhus trap: code 1 is the plan area as a WHOLE — never per-parcel.
        expect(dkBygberegnafRow(DkBygberegnafCodeSchema.parse(1)).da).toBe('Omraadet som helhed');
    });

    it('REJECTS a code outside the state codelist (a fifth value is a national schema change)', () => {
        expect(DkBygberegnafCodeSchema.safeParse(5).success).toBe(false);
        expect(DkBygberegnafCodeSchema.safeParse('4').success).toBe(false);
    });
});

describe('LT worked chain — ASGR MAX_AUK_M 8.5 with per-value provenance columns (lane 4 §LT-1)', () => {
    it('round-trips the ASGR height rule', () => {
        const parsed = roundTrip(RuleProvenanceSchema, {
            parameter: 'MAX_AUK_M',
            value: 8.5,
            unit: 'm',
            source: {
                country: 'LT',
                authority: 'VTPSI',
                dataset: 'ASGR',
                plan_id: null,
                object_id: null,
                document: null,
                article: null,
                page: null,
            },
            derivation: 'DIRECT',
            valueLocation: 'attribute',
            confidence: { tier: 1, note: 'PILN=P' },
            validityBasis: 'legal',
            valid_from: '2024-06-18',
            valid_to: null,
        });
        expect(parsed.value).toBe(8.5);
    });

    it('the ASGR field vocabulary is the spec set, and provenance columns derive from it', () => {
        expect(LtAsgrValueFieldSchema.options).toEqual([
            'MAX_AUK_M',
            'MAX_INTENS',
            'MAX_TANKIS',
            'MIN_APZELD',
        ]);
        expect(ltAsgrProvenanceColumns('MAX_AUK_M')).toEqual([
            'MAX_AUK_M_TP',
            'MAX_AUK_M_NR',
            'MAX_AUK_M_D',
            'MAX_AUK_M_TPR',
        ]);
    });
});

/* ── 4 · six-tier confidence + NL vocabulary ──────────────────────────────── */

describe('six-tier confidence vocabulary (BRIEF §3, verbatim)', () => {
    it('is exactly the six tiers, in numeric order', () => {
        expect(SiteIntelConfidenceTierSchema.options).toEqual([
            'authoritative-machine-readable',
            'authoritative-document-derived',
            'deterministic-inference',
            'ai-interpretation',
            'human-validated',
            'uncertain-missing',
        ]);
        expect(SITEINTEL_CONFIDENCE_TIER_NUMBER['authoritative-machine-readable']).toBe(1);
        expect(SITEINTEL_CONFIDENCE_TIER_NUMBER['uncertain-missing']).toBe(6);
        expect(confidenceTierName(3)).toBe('deterministic-inference');
    });

    it('rejects a seventh tier', () => {
        expect(SiteIntelConfidenceSchema.safeParse({ tier: 7 }).success).toBe(false);
        expect(SiteIntelConfidenceTierSchema.safeParse('probably-fine').success).toBe(false);
    });
});

describe('NL IMOW vocabulary (probed openapi v8.5.2, lane 4 §NL-A)', () => {
    it('carries the probed Eenheid URI and honest nulls for the unfetched lists', () => {
        const eenheid = NL_IMOW_VALUE_LISTS.find((l) => l.name === 'Eenheid')!;
        expect(eenheid.uri).toBe(
            'https://standaarden.omgevingswet.overheid.nl/id/waardelijst/Eenheid',
        );
        expect(NL_IMOW_VALUE_LISTS.find((l) => l.name === 'TypeNorm')!.uri).toBeNull();
        expect(NL_IMOW_VALUE_LISTS.find((l) => l.name === 'Normgroep')!.uri).toBeNull();
    });

    it('maps the three-way Normwaarde split onto valueLocation (waardeInRegeltekst → in-document-text)', () => {
        expect(NlNormwaardeKindSchema.options).toHaveLength(3);
        expect(nlNormwaardeValueLocation('waardeInRegeltekst')).toBe('in-document-text');
        expect(nlNormwaardeValueLocation('kwantitatieveWaarde')).toBe('attribute');
    });
});

/* ── 5 · all 17 entities round-trip an EE-flavoured mini-graph ────────────── */

describe('the 17 entities — round-trip (EE Tallinn-flavoured mini-graph)', () => {
    const geom = (kind: 'Polygon' | 'LineString' | 'Point' = 'Polygon') => ({
        crs: 'EPSG:3301',
        kind,
        coordinates:
            kind === 'Point'
                ? [542000, 6589000]
                : kind === 'LineString'
                  ? [
                        [542000, 6589000],
                        [542050, 6589000],
                    ]
                  : [
                        [
                            [542000, 6589000],
                            [542050, 6589000],
                            [542050, 6589040],
                            [542000, 6589000],
                        ],
                    ],
    });

    it('Source / Parcel / Building / Terrain / Road', () => {
        roundTrip(SiteIntelSourceSchema, {
            id: 'src-ee-plank',
            country: 'EE',
            authority: 'PLANK/PLANIS',
            dataset: 'dp_hoonestus',
            endpoint: 'https://planeeringud.ee/plank/api',
            protocol: 'REST',
            licence: { id: 'EE-open', colour: 'GREEN', verifiedDate: '2026-08-31', textRef: null },
            accessOption: 1,
            gate: null,
            probes: [{ date: '2026-08-31', note: 'Tallinn plot served FAR 2.1 / height 17.4' }],
        });
        roundTrip(SiteIntelParcelSchema, {
            id: 'parcel-ee-1',
            nationalId: { country: 'EE', scheme: 'tunnus', value: '78408:801:0091' },
            geometry: geom(),
            area: 1667,
            adminUnit: 'Tallinn',
            source: 'src-ee-maaamet',
            version: null,
        });
        roundTrip(SiteIntelBuildingSchema, {
            id: 'bld-ee-1',
            gersId: null,
            nationalIds: [{ country: 'EE', scheme: 'ehr', value: '101012345' }],
            footprint: geom(),
            height: { value: 14.2, method: 'SURVEYED', source: 'src-ee-ehr' },
            floors: { above: 4, below: 1, source: 'src-ee-ehr' },
            use: 'residential',
            yearBuilt: 1938,
            lod: 'LoD2',
            source: 'src-ee-ehr',
            version: null,
        });
        roundTrip(SiteIntelTerrainSchema, {
            tileRef: 'pmtiles://ee/terrain/10/x/y',
            dtmRef: null,
            datum: 'ELLIPSOIDAL',
            source: 'src-ee-maaamet',
        });
        roundTrip(SiteIntelRoadSchema, {
            id: 'road-ee-1',
            geometry: geom('LineString'),
            kind: 'residential',
            name: 'Kopli tn',
            source: 'src-ee-maaamet',
            version: null,
        });
    });

    it('Plan / Zone / Prescription / Restriction / Regulation / Document', () => {
        roundTrip(SiteIntelPlanSchema, {
            id: 'plan-ee-dp-1',
            kind: 'dp',
            status: 'kehtestatud',
            adoptedDate: '2018-05-02',
            inForceFrom: '2018-05-02',
            inForceTo: null,
            documents: ['doc-ee-dp-1'],
            geometryRef: 'geom-plan-ee-dp-1',
            source: 'src-ee-plank',
            version: null,
        });
        roundTrip(SiteIntelZoneSchema, {
            id: 'zone-ee-1',
            planId: 'plan-ee-dp-1',
            typology: { national: 'hoonestusala', harmonised: null },
            geometry: geom(),
            source: 'src-ee-plank',
        });
        roundTrip(SiteIntelPrescriptionSchema, {
            id: 'presc-ee-1',
            kind: 'buildingField',
            geometry: geom(),
            typology: { scheme: 'PLANK', code: 'hoonestusala' },
            value: null,
            zoneOrPlanRef: 'zone-ee-1',
            source: 'src-ee-plank',
        });
        roundTrip(SiteIntelRestrictionSchema, {
            id: 'restr-ee-1',
            theme: 'heritage',
            typeCode: 'muinsuskaitse',
            lawStatus: 'inForce',
            geometry: geom(),
            areaShare: null,
            legalProvisions: ['doc-ee-law-1'],
            source: 'src-ee-kultuurimalestised',
        });
        roundTrip(SiteIntelRegulationSchema, {
            id: 'reg-ee-1',
            planId: 'plan-ee-dp-1',
            title: 'Detailplaneeringu seletuskiri',
            kind: 'seletuskiri',
            documents: ['doc-ee-dp-1'],
            source: 'src-ee-plank',
            version: null,
        });
        roundTrip(SiteIntelDocumentSchema, {
            id: 'doc-ee-dp-1',
            url: 'https://planeeringud.ee/plank/doc/1',
            kind: 'dp-PDF',
            identity: { scheme: 'plank-doc', value: 'DP-2018-091' },
            version: null,
            retrievedDate: '2026-08-31',
        });
    });

    it('Rule / Evidence / Scenario / Envelope / DevelopmentPotential / Version / Confidence', () => {
        roundTrip(SiteIntelRuleSchema, {
            id: 'rule-ee-maxheight',
            body: null,
            // R1 (gate §C): the typed applicability value object — the zone
            // basis ref MUST resolve to the minted zone-ee-1 entity above
            // (the R1 companion contract sentence).
            applicability: {
                basis: [{ kind: 'zone', ref: 'zone-ee-1' }],
                geometry: null,
                useScope: ['elamumaa'],
                rank: null,
                condition: null,
            },
            provenance: EE_REPORT_I_EXAMPLE,
        });
        roundTrip(SiteIntelEvidenceSchema, {
            id: 'ev-ee-1',
            claim: 'maxHeight 17.4 m read from dp_hoonestus attribute',
            from: { kind: 'source', ref: 'src-ee-plank' },
            method: 'live REST probe',
            checkedDate: '2026-08-31',
            hash: 'sha256:2f1a…',
        });
        roundTrip(SiteIntelScenarioSchema, {
            id: 'scen-ee-1',
            parcelId: 'parcel-ee-1',
            asOfDate: '2025-01-01',
            overrides: [{ parameter: 'maxHeight', value: 15 }],
            envelopeRef: null,
        });
        roundTrip(SiteIntelEnvelopeSchema, {
            id: 'env-ee-1',
            parcelId: 'parcel-ee-1',
            solids: [
                { label: 'hoonestusala prism', footprint: geom(), baseHeightM: 0, maxHeightM: 17.4 },
            ],
            footprint: geom(),
            maxVolumeM3: null,
            maxGfaM2: 3500,
            isUpperBound: true,
            derivationTrace: ['ev-ee-1'],
            confidenceTier: { tier: 1 },
            computedAt: '2026-08-31',
            ruleSetVersion: 'ee-plank-2026-08-31',
            determinationRef: null,
        });
        roundTrip(SiteIntelDevelopmentPotentialSchema, {
            parcelId: 'parcel-ee-1',
            permitted: { gfaM2: 3500 },
            existing: { gfaM2: 1210, source: 'src-ee-ehr' },
            deltaGfaM2: 2290,
            confidence: { tier: 1 },
            // Gate §C ride-along (verdict §G item 3 / supplement §6.2): the
            // time anchor + the envelope the permitted side was read from.
            computedAt: '2026-08-31',
            envelopeRef: 'env-ee-1',
        });
        roundTrip(SiteIntelVersionSchema, {
            entityRef: 'plan-ee-dp-1',
            validFrom: '2018-05-02',
            validTo: null,
            supersededBy: null,
        });
        roundTrip(SiteIntelConfidenceSchema, {
            tier: 6,
            note: 'MAX_INTENS unit semantics unresolved — do not compute GFA yet',
        });
    });
});

/* ── 6 · falsification: corruption fails NAMING the field ─────────────────── */

describe('falsification — a corrupted required provenance field fails naming the field', () => {
    it('deleting source.authority → parse error whose path names source.authority', () => {
        const corrupted = JSON.parse(JSON.stringify(EE_REPORT_I_EXAMPLE)) as Record<string, any>;
        delete corrupted['source']['authority'];
        const res = RuleProvenanceSchema.safeParse(corrupted);
        expect(res.success).toBe(false);
        if (!res.success) {
            const paths = res.error.issues.map((i) => i.path.join('.'));
            expect(paths).toContain('source.authority');
        }
    });

    it('value=null at confidence tier 1 is rejected — UNKNOWN ≠ 0 ≠ no-limit', () => {
        const corrupted = JSON.parse(JSON.stringify(EE_REPORT_I_EXAMPLE)) as Record<string, any>;
        corrupted['value'] = null; // korgus empty — but the tier still claims authoritative
        const res = RuleProvenanceSchema.safeParse(corrupted);
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.issues.some((i) => i.path.join('.') === 'value')).toBe(true);
        }
    });

    it('value=null IS representable at tier 6 (uncertain-missing) — absence is an answer', () => {
        const unknownHeight = JSON.parse(JSON.stringify(EE_REPORT_I_EXAMPLE)) as Record<string, any>;
        unknownHeight['value'] = null;
        unknownHeight['unit'] = null;
        unknownHeight['confidence'] = { tier: 6, note: 'korgus empty — UNKNOWN, never no-limit' };
        expect(RuleProvenanceSchema.safeParse(unknownHeight).success).toBe(true);
    });

    it('a known delta over an unknown existing GFA is rejected (UNKNOWN ≠ 0)', () => {
        const res = SiteIntelDevelopmentPotentialSchema.safeParse({
            parcelId: 'parcel-ee-1',
            permitted: { gfaM2: 3500 },
            existing: { gfaM2: null, source: 'src-ee-ehr' },
            deltaGfaM2: 3500, // fabricated: treats unknown existing as 0
            confidence: { tier: 3 },
            computedAt: '2026-08-31',
            envelopeRef: null,
        });
        expect(res.success).toBe(false);
        if (!res.success) {
            // Failing on the DELTA guard, not on a missing R-batch field.
            expect(res.error.issues.some((i) => i.path.join('.') === 'deltaGfaM2')).toBe(true);
        }
    });

    it('a lower-cased country code is rejected (the source ref is a legal address, not a hint)', () => {
        expect(
            RuleSourceRefSchema.safeParse({
                country: 'ee',
                authority: 'PLANK/PLANIS',
                dataset: 'dp_hoonestus',
            }).success,
        ).toBe(false);
    });
});

/* ── 7 · the R-batch (E1 gate decision §C) — per-item positive + negative ── */

describe('R1 — typed Applicability value object (verdict §E R1)', () => {
    const eeGeom = {
        crs: 'EPSG:3301',
        kind: 'Polygon',
        coordinates: [
            [
                [542000, 6589000],
                [542050, 6589000],
                [542050, 6589040],
                [542000, 6589000],
            ],
        ],
    };

    it('POSITIVE: a basis-only applicability parses, with useScope + rank riding along', () => {
        const parsed = roundTrip(RuleApplicabilitySchema, {
            basis: [{ kind: 'prescription', ref: 'presc-ee-1' }],
            geometry: null,
            useScope: ['korterelamumaa', 'ärimaa'],
            rank: { scheme: 'dk-plandata', level: 3 },
            condition: null,
        });
        expect(parsed.basis[0]!.kind).toBe('prescription');
        expect(parsed.useScope).toEqual(['korterelamumaa', 'ärimaa']);
        expect(parsed.rank).toEqual({ scheme: 'dk-plandata', level: 3 });
    });

    it('POSITIVE: an inline-geometry-only leg parses (the residual bare-geometry case)', () => {
        const parsed = RuleApplicabilitySchema.parse({ geometry: eeGeom });
        expect(parsed.geometry!.crs).toBe('EPSG:3301');
        expect(parsed.basis).toEqual([]); // defaults materialise
        expect(parsed.rank).toBeNull();
    });

    it('POSITIVE: a condition-only leg parses (JSON-Logic predicate, carrier not ontology)', () => {
        const parsed = RuleApplicabilitySchema.parse({
            condition: { '>=': [{ var: 'parcel.areaM2' }, 600] },
        });
        expect(parsed.condition).toEqual({ '>=': [{ var: 'parcel.areaM2' }, 600] });
    });

    it('NEGATIVE: no leg at all is rejected — a rule that applies nowhere is not a rule', () => {
        const res = RuleApplicabilitySchema.safeParse({});
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.issues[0]!.message).toMatch(/at least one leg/);
        }
    });

    it('NEGATIVE: useScope/rank alone cannot found an applicability (qualifiers, not legs)', () => {
        const res = RuleApplicabilitySchema.safeParse({
            useScope: ['elamumaa'],
            rank: { scheme: 'dk-plandata', level: 1 },
        });
        expect(res.success).toBe(false);
    });

    it('NEGATIVE (sever proof): the OLD three-leg shape (geometryRef/zoneRef/predicate) no longer parses', () => {
        const res = RuleApplicabilitySchema.safeParse({
            geometryRef: null,
            zoneRef: 'zone-ee-1',
            predicate: null,
        });
        expect(res.success).toBe(false); // unknown keys stripped → no leg → refine rejects
    });

    it('NEGATIVE: a basis kind outside the six planning kinds is rejected', () => {
        expect(RuleBasisKindSchema.options).toEqual([
            'zone',
            'prescription',
            'plan',
            'restriction',
            'regulation',
            'parcel',
        ]);
        const res = RuleApplicabilitySchema.safeParse({
            basis: [{ kind: 'envelope', ref: 'env-ee-1' }],
        });
        expect(res.success).toBe(false);
    });

    it('NEGATIVE: a rank missing its level fails naming rank.level', () => {
        const res = RuleApplicabilitySchema.safeParse({
            basis: [{ kind: 'zone', ref: 'zone-ee-1' }],
            rank: { scheme: 'dk-plandata' },
        });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.issues.map((i) => i.path.join('.'))).toContain('rank.level');
        }
    });
});

describe('R2 — typed value-basis qualifier on provenance (verdict §E R2)', () => {
    it('POSITIVE: the LIVE Aarhus row (bebygpct=180, af=1) parses with the denominator TYPED — the wrong-GFA path is machine-visible', () => {
        const parsed = roundTrip(RuleProvenanceSchema, {
            parameter: 'bebygpct',
            value: 180,
            unit: '%',
            source: {
                country: 'DK',
                authority: 'Plandata.dk',
                dataset: 'theme_pdk_kommuneplanramme',
                plan_id: null,
                object_id: null,
                document: null,
                article: null,
                page: null,
            },
            derivation: 'DIRECT',
            valueLocation: 'attribute',
            valueBasis: { scheme: 'dk-bygberegnaf', code: '1' }, // the AREA-AS-A-WHOLE code
            confidence: { tier: 1 },
            validityBasis: 'legal',
            valid_from: '2021-12-16',
            valid_to: null,
        });
        // A typed-fields-only consumer now cannot miss it (gate decision §B.1).
        expect(parsed.valueBasis).toEqual({ scheme: 'dk-bygberegnaf', code: '1' });
    });

    it('POSITIVE: valueBasis is OPTIONAL — the EE worked example carries none and still parses', () => {
        const parsed = RuleProvenanceSchema.parse(EE_REPORT_I_EXAMPLE);
        expect(parsed.valueBasis).toBeUndefined();
    });

    it('NEGATIVE: a valueBasis missing its code fails naming valueBasis.code', () => {
        const corrupted = JSON.parse(JSON.stringify(EE_REPORT_I_EXAMPLE)) as Record<string, any>;
        corrupted['valueBasis'] = { scheme: 'ee-vertical-datum' };
        const res = RuleProvenanceSchema.safeParse(corrupted);
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.issues.map((i) => i.path.join('.'))).toContain('valueBasis.code');
        }
    });
});

describe('R3 — validityBasis: legal | ingestion (verdict §E R3)', () => {
    it('POSITIVE: ingestion is machine-visible — the E1d fetch-date window no longer needs a note apology', () => {
        const ingested = JSON.parse(JSON.stringify(EE_REPORT_I_EXAMPLE)) as Record<string, any>;
        ingested['validityBasis'] = 'ingestion';
        ingested['valid_from'] = '2026-08-31'; // the FETCH date, honestly labelled
        const parsed = RuleProvenanceSchema.parse(ingested);
        expect(parsed.validityBasis).toBe('ingestion');
    });

    it('NEGATIVE: a record WITHOUT validityBasis fails naming the field — legal vs ingestion must never be indistinguishable again', () => {
        const corrupted = JSON.parse(JSON.stringify(EE_REPORT_I_EXAMPLE)) as Record<string, any>;
        delete corrupted['validityBasis'];
        const res = RuleProvenanceSchema.safeParse(corrupted);
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.issues.map((i) => i.path.join('.'))).toContain('validityBasis');
        }
    });

    it('NEGATIVE: a third basis (guessed) is rejected — the enum is closed', () => {
        const corrupted = JSON.parse(JSON.stringify(EE_REPORT_I_EXAMPLE)) as Record<string, any>;
        corrupted['validityBasis'] = 'guessed';
        expect(RuleProvenanceSchema.safeParse(corrupted).success).toBe(false);
    });
});

describe('R4 — EvidenceRefKind gains the planning-object kinds (verdict §E R4)', () => {
    it('POSITIVE: an evidence hop can cite a prescription and a parcel directly', () => {
        expect(EvidenceRefKindSchema.options).toEqual([
            'source',
            'document',
            'rule',
            'derivation',
            'zone',
            'prescription',
            'restriction',
            'plan',
            'parcel',
        ]);
        const parsed = roundTrip(SiteIntelEvidenceSchema, {
            id: 'ev-ee-2',
            claim: 'the hoonestusala cited by rule-ee-maxheight is the minted presc-ee-1',
            from: { kind: 'prescription', ref: 'presc-ee-1' },
            method: 'adapter minting audit',
            checkedDate: '2026-08-31',
            hash: 'sha256:9c2b…',
        });
        expect(parsed.from.kind).toBe('prescription');
    });

    it('NEGATIVE: a kind outside the enum (envelope) is rejected', () => {
        const res = SiteIntelEvidenceSchema.safeParse({
            id: 'ev-ee-3',
            claim: 'x',
            from: { kind: 'envelope', ref: 'env-ee-1' },
            method: 'x',
            checkedDate: '2026-08-31',
            hash: 'sha256:00…',
        });
        expect(res.success).toBe(false);
    });
});

describe('R5 — mirrored normative-force field (verdict §E R5)', () => {
    it('POSITIVE: LT ASGR rekomendacinio pobūdžio travels VERBATIM — authoritative-but-ambiguous honestly encoded without touching the tiers', () => {
        const parsed = roundTrip(RuleProvenanceSchema, {
            parameter: 'MAX_AUK_M',
            value: 8.5,
            unit: 'm',
            source: {
                country: 'LT',
                authority: 'VTPSI',
                dataset: 'ASGR',
                plan_id: null,
                object_id: null,
                document: null,
                article: null,
                page: null,
            },
            derivation: 'DIRECT',
            valueLocation: 'attribute',
            normativeForce: 'rekomendacinio pobūdžio',
            confidence: { tier: 1 },
            validityBasis: 'legal',
            valid_from: '2024-06-18',
            valid_to: null,
        });
        expect(parsed.normativeForce).toBe('rekomendacinio pobūdžio');
        expect(parsed.confidence.tier).toBe(1); // the tier is NOT bent to carry force
    });

    it('POSITIVE: absent normativeForce defaults to null = the register serves no force flag (not an assertion of bindingness)', () => {
        const parsed = RuleProvenanceSchema.parse(EE_REPORT_I_EXAMPLE);
        expect(parsed.normativeForce).toBeNull();
    });

    it('NEGATIVE: an empty-string force is rejected — mirror something or mirror null', () => {
        const corrupted = JSON.parse(JSON.stringify(EE_REPORT_I_EXAMPLE)) as Record<string, any>;
        corrupted['normativeForce'] = '';
        expect(RuleProvenanceSchema.safeParse(corrupted).success).toBe(false);
    });
});

describe('tier projection — incoherent pairs are parse errors (gate §C non-schema · architect §5.1.2)', () => {
    it('CONTROL: tier 2 + AI_EXTRACTED stays parseable — conflated-but-both-true is NOT incoherent', () => {
        const doc = JSON.parse(JSON.stringify(DE_BRIEF_11_EXAMPLE)) as Record<string, any>;
        doc['confidence'] = { tier: 2 };
        expect(RuleProvenanceSchema.safeParse(doc).success).toBe(true);
    });

    it('NEGATIVE: tier 1 + AI_EXTRACTED is rejected (the named pair)', () => {
        const corrupted = JSON.parse(JSON.stringify(DE_BRIEF_11_EXAMPLE)) as Record<string, any>;
        corrupted['confidence'] = { tier: 1 };
        const res = RuleProvenanceSchema.safeParse(corrupted);
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.issues.some((i) => /AI_EXTRACTED/.test(i.message))).toBe(true);
        }
    });

    it('NEGATIVE: tier 1 + in-document-text is rejected (tier 1 is the machine-attribute tier)', () => {
        const corrupted = JSON.parse(JSON.stringify(EE_REPORT_I_EXAMPLE)) as Record<string, any>;
        corrupted['valueLocation'] = 'in-document-text';
        expect(RuleProvenanceSchema.safeParse(corrupted).success).toBe(false);
    });

    it('NEGATIVE: tier 5 without a HUMAN_VALIDATED derivation is rejected (validation is a RECORDED event)', () => {
        const corrupted = JSON.parse(JSON.stringify(EE_REPORT_I_EXAMPLE)) as Record<string, any>;
        corrupted['confidence'] = { tier: 5 };
        // derivation stays DIRECT — the record claims validation with no recorded event
        const res = RuleProvenanceSchema.safeParse(corrupted);
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.issues.some((i) => /HUMAN_VALIDATED/.test(i.message))).toBe(true);
        }
    });

    it('POSITIVE: tier 5 + HUMAN_VALIDATED parses', () => {
        const validated = JSON.parse(JSON.stringify(EE_REPORT_I_EXAMPLE)) as Record<string, any>;
        validated['confidence'] = { tier: 5 };
        validated['derivation'] = 'HUMAN_VALIDATED';
        expect(RuleProvenanceSchema.safeParse(validated).success).toBe(true);
    });
});

describe('DevelopmentPotential time anchor (gate §C ride-along, verdict §G item 3)', () => {
    it('NEGATIVE: a record without computedAt fails naming the field — an unplaceable potential is not reproducible', () => {
        const res = SiteIntelDevelopmentPotentialSchema.safeParse({
            parcelId: 'parcel-ee-1',
            permitted: { gfaM2: 3500 },
            existing: { gfaM2: 1210, source: 'src-ee-ehr' },
            deltaGfaM2: 2290,
            confidence: { tier: 1 },
            envelopeRef: null,
        });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.issues.map((i) => i.path.join('.'))).toContain('computedAt');
        }
    });
});

/* ── Source-Registry NOW-thin columns (gate decision §F item 5 · supplement §7) ── */

describe('Source registry NOW-thin — 4 nullable columns (verdict §E "Source-registry columns")', () => {
    const baseSourceRow = {
        id: 'src-ee-plank',
        country: 'EE',
        authority: 'PLANK/PLANIS',
        dataset: 'dp_hoonestus',
        endpoint: 'https://planeeringud.ee/plank/api',
        protocol: 'REST',
        licence: { id: 'EE-open', colour: 'GREEN', verifiedDate: '2026-08-31', textRef: null },
        accessOption: 1,
        gate: null,
        probes: [{ date: '2026-08-31', note: 'Tallinn plot served FAR 2.1 / height 17.4' }],
    } as const;

    it('POSITIVE: a row carrying theme/coverage/updateFrequency/adapterStatus parses with them typed', () => {
        const parsed = SiteIntelSourceSchema.parse({
            ...baseSourceRow,
            theme: 'planning',
            coverage: 'full',
            updateFrequency: 'daily FGDB mirror',
            adapterStatus: 'live',
        });
        expect(parsed.theme).toBe('planning');
        expect(parsed.coverage).toBe('full');
        expect(parsed.updateFrequency).toBe('daily FGDB mirror');
        expect(parsed.adapterStatus).toBe('live');
    });

    it('POSITIVE: a pre-registry row WITHOUT the four columns still parses — additive, zero migration (supplement §7), defaults are honest nulls', () => {
        const parsed = SiteIntelSourceSchema.parse(baseSourceRow);
        expect(parsed.theme).toBeNull();
        expect(parsed.coverage).toBeNull();
        expect(parsed.updateFrequency).toBeNull();
        expect(parsed.adapterStatus).toBeNull();
    });

    it('NEGATIVE: an empty-string adapterStatus is rejected — a blank is not a status, null is the honest absence', () => {
        const res = SiteIntelSourceSchema.safeParse({ ...baseSourceRow, adapterStatus: '' });
        expect(res.success).toBe(false);
        if (!res.success) {
            expect(res.error.issues.map((i) => i.path.join('.'))).toContain('adapterStatus');
        }
    });
});
