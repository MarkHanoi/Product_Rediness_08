// València (INE 46250) — the cited-refusal jurisdiction, its routing gate, and the transcribed
// PGOU *Normas Urbanísticas* (Documento Definitivo, mayo 1991).
//
// ⚠ THESE TESTS LOCK HONESTY PROPERTIES, NOT PROSE. Each of the load-bearing assertions below
// fails the moment somebody "finishes" València by supplying a number the ordinance does not
// state:
//
//   • `ES_VALENCIA_PGOU_PACK.zones` must stay EMPTY while `VALENCIA_ENVELOPE_VERIFIED` is false —
//     the zones array is the RESULT of reading the plan, not a TODO list.
//   • the refusal must stay `no-rule-pack` / `legallyGrounded: false` — a claim about PRYZM's
//     coverage. The stronger `derived-plan` claim is about the LAW and may only be made per-parcel
//     from the live `origen` value.
//   • the refusal prose must contain NO NUMBER that could be read as a determination (the §DEC-1
//     leak test Barcelona adopted after a refusal card shipped a figure in its explanation).
//   • `Hc = intercept + 2,90·Np` must reproduce the ordinance's OWN eight-row table with
//     **Np = graphed floors MINUS ONE** — the reading that caught a 2,90 m per-band overstatement.
//   • ENS's intercept (4,80) and EDA's (5,30) must stay DIFFERENT. Two formulas identical in shape.
//
// Method note: the ordinance quotes these tests pin are transcribed in `esValenciaPgou.ts` from the
// municipal `(Transcripción)` PDF; provenance and the authority caveat live in
// `docs/04-reference/jurisdictions/es/es-vc/46250-valencia/sources/PRIMARY-SOURCE-VERIFICATION-2026-08-01.md`.

import { describe, expect, it } from 'vitest';
import {
    VALENCIA_BBOX,
    VALENCIA_INE_CODE,
    isInValencia,
} from '../src/providers/valenciaBbox.js';
import { composeIneCode } from '../src/providers/murciaBbox.js';
import {
    VALENCIA_ALTURA_FIELD_MEASURE,
    VALENCIA_ENVELOPE_VERIFIED,
    VALENCIA_JURISDICTION_ID,
    VALENCIA_ROADMAP_LINE,
    valenciaNoRulePackRefusal,
} from '../src/rulepacks/esValenciaEnvelope.js';
import {
    ES_VALENCIA_PGOU_PACK,
    VALENCIA_CALIFICACION_CLASSIFICATION,
    VALENCIA_CORNICE_FORMULAS,
    VALENCIA_DELEGATION_SHARE,
    VALENCIA_ENS_HEIGHT_TABLE,
    VALENCIA_LAND_SHARE_MEASURED_2026_08_01 as LAND,
    VALENCIA_PGOU_LATER_MODIFICATIONS,
    VALENCIA_PGOU_ZONE_CODES,
    VALENCIA_STATED_BOUNDS,
    resolveValenciaPgouZone,
    valenciaCalificacionClassification,
    valenciaCorniceHeightFromGraphedFloors,
} from '../src/rulepacks/esValenciaPgou.js';
import { buildRefusedEnvelope, isRefusedEnvelope, isTransientRefusal } from '../src/rulepacks/zoneRefusal.js';
import {
    listJurisdictionCoverage,
    registeredPackZoneCodes,
    resolveZoneDisposition,
} from '../src/rulepacks/registry.js';

/**
 * Gran Via Marqués del Túria / Almirante Cadarso — inside the Ensanche, and named in Art. 6.16.2
 * as a boundary street of the ENS-2 *Ensanche de Mora*. Catastro answered here live on 2026-08-01
 * with `<cp>46</cp><cm>250</cm>` and `6618617YJ2761H`.
 */
const ENSANCHE = { lat: 39.464, lon: -0.367 } as const;

describe('València S2 — the routing gate', () => {
    it('accepts a point in the Ensanche', () => {
        expect(isInValencia(ENSANCHE.lat, ENSANCHE.lon)).toBe(true);
    });

    it('rejects Madrid, Barcelona and Murcia', () => {
        expect(isInValencia(40.4168, -3.7038)).toBe(false); // Madrid
        expect(isInValencia(41.3874, 2.1686)).toBe(false); // Barcelona
        expect(isInValencia(37.9922, -1.1307)).toBe(false); // Murcia
    });

    it('⚠ rejects Valencia de Alcántara (Cáceres) — SAME LATITUDE BAND, different province', () => {
        // 39,41 °N sits inside València's own latitude band. A latitude-only or name-only test
        // would route a Cáceres parcel to the València PGOU. Longitude is what excludes it.
        const lat = 39.411;
        expect(lat).toBeGreaterThan(VALENCIA_BBOX.minLat);
        expect(lat).toBeLessThan(VALENCIA_BBOX.maxLat);
        expect(isInValencia(lat, -7.239)).toBe(false);
    });

    it('rejects Valencia, Venezuela — a name is not a jurisdiction', () => {
        expect(isInValencia(10.162, -68.008)).toBe(false);
    });

    it('never throws on non-finite input, and never says yes', () => {
        expect(isInValencia(Number.NaN, -0.37)).toBe(false);
        expect(isInValencia(39.46, Number.POSITIVE_INFINITY)).toBe(false);
    });

    it('composes 46250 from Catastro\'s own parts through the ONE national composer', () => {
        // ⚠ `<cm>` is already three digits for València (250) where Murcia's is two (30). The
        // shared composer PADS rather than concatenating, which is why there is only one of it.
        expect(composeIneCode('46', '250')).toBe(VALENCIA_INE_CODE);
        expect(composeIneCode('46', '250')).toBe('46250');
    });
});

describe('València S4 — the pack publishes nothing, by construction', () => {
    it('the gate is FALSE and an implementer may not flip it (L-449)', () => {
        expect(VALENCIA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('⚠ `zones` is EMPTY, and stays empty while the gate is closed', () => {
        expect(ES_VALENCIA_PGOU_PACK.zones).toHaveLength(0);
        expect(VALENCIA_PGOU_ZONE_CODES).toHaveLength(0);
    });

    it('the zone-code list is DERIVED from the pack, never re-typed', () => {
        expect(VALENCIA_PGOU_ZONE_CODES).toEqual(
            ES_VALENCIA_PGOU_PACK.zones.map((z) => z.code.toUpperCase()).sort(),
        );
    });

    it('carries the instrument, the CRS and the honest confidence floor', () => {
        expect(ES_VALENCIA_PGOU_PACK.jurisdictionId).toBe(VALENCIA_JURISDICTION_ID);
        expect(ES_VALENCIA_PGOU_PACK.crs).toBe('EPSG:25830');
        expect(ES_VALENCIA_PGOU_PACK.defaultConfidence).toBe('estimated-ruleset');
        expect(ES_VALENCIA_PGOU_PACK.displayName).toContain('1991');
    });

    it('⚠ `laterModifications` is `unverified`, NEVER `none`', () => {
        // A DOGV 07-02-1994 modification is bound into the same PDF, and ~140 `MP` instruments
        // appear in the live `origen` vocabulary. `none` would be a claim nobody has earned.
        expect(VALENCIA_PGOU_LATER_MODIFICATIONS).toBe('unverified');
        expect(VALENCIA_PGOU_LATER_MODIFICATIONS).not.toBe('none');
    });
});

describe('València — the classification table is a refusal ledger, not a rule set', () => {
    it('every classified calificación is `packed: false`', () => {
        for (const c of VALENCIA_CALIFICACION_CLASSIFICATION) {
            expect(c.packed, `${c.code} must not be packed`).toBe(false);
        }
    });

    it('every row names the article that makes its refusal correct rather than lazy', () => {
        for (const c of VALENCIA_CALIFICACION_CLASSIFICATION) {
            expect(c.article, `${c.code} needs an article`).toMatch(/Art/);
            expect(c.note.length, `${c.code} needs a note`).toBeGreaterThan(25);
            const nothingEstablished =
                c.height === 'unknown' &&
                c.depthOrSetback === 'unknown' &&
                c.far === 'unknown' &&
                c.coverage === 'unknown';
            if (nothingEstablished) {
                // A row that establishes NOTHING must say so in terms a later reader cannot
                // mistake for a finding — otherwise its silence reads as "unregulated".
                expect(c.note, `${c.code} must declare itself unread`).toMatch(/NOT READ/i);
            } else {
                // A row that establishes SOMETHING must carry the reasoning that earned it.
                expect(c.note.length, `${c.code} needs a reason`).toBeGreaterThan(40);
            }
        }
    });

    it('the six Art. 6.3.1 suelo-urbano zones are all represented', () => {
        const codes = VALENCIA_CALIFICACION_CLASSIFICATION.map((c) => c.code);
        for (const base of ['CHP', 'ENS', 'EDA', 'UFA', 'TER', 'IND']) {
            expect(codes.some((c) => c === base || c.startsWith(`${base}-`))).toBe(true);
        }
    });

    it('ENS/EDA declare FAR and coverage `not-the-rule-kind` — a FINDING, not a hole', () => {
        // The ENS chapter states no `edificabilidad` and no `ocupación` at all: the envelope is
        // alineación + profundidad edificable + altura de cornisa (ADR-0270 — a wrong KIND is a
        // wrong SHAPE). `unknown` here would understate what was established.
        for (const code of ['ENS-1', 'ENS-2', 'EDA']) {
            const c = VALENCIA_CALIFICACION_CLASSIFICATION.find((x) => x.code === code);
            expect(c?.far).toBe('not-the-rule-kind');
            expect(c?.coverage).toBe('not-the-rule-kind');
        }
    });

    it('the UNREAD chapters say `unknown`, which is a DIFFERENT and weaker claim', () => {
        for (const code of ['CHP', 'TER', 'IND']) {
            const c = VALENCIA_CALIFICACION_CLASSIFICATION.find((x) => x.code === code);
            expect(c?.ruleKind).toBe('not-read');
            expect(c?.height).toBe('unknown');
            expect(c?.far).toBe('unknown');
        }
    });

    it('resolves a live `califi` + `tipoca`, and NEVER returns an ok:true', () => {
        const r = resolveValenciaPgouZone('ENS', '2');
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('not-packed');
        expect(r.classification?.code).toBe('ENS-2');
    });

    it('falls back from an unclassified grade to the BASE row, never to a NEIGHBOURING zone', () => {
        // `ENS-9` is not a grade Art. 6.16 defines. The bare `ENS` row's refusal is the SAME
        // refusal for every grade, so falling back to it is correct and strictly more informative
        // than null. Falling back to `EDA` — the adjacent chapter, 0,50 m apart in its intercept —
        // would not be.
        expect(resolveValenciaPgouZone('ENS', '9').classification?.code).toBe('ENS');
        expect(resolveValenciaPgouZone('ENS', '2').classification?.code).toBe('ENS-2');
        expect(resolveValenciaPgouZone('ZZZ').classification).toBeNull();
    });

    it('⚠ treats junk `tipoca` as ABSENT, never as a grade', () => {
        // The live layer's `tipoca` carries `#`, `##`, `*`, `_`, `-`, `----`, whitespace. Each
        // must degrade to the base zone, never be concatenated into a code like `ENS-#`.
        for (const junk of ['#', '##', '*', '_', '-', '----', '   ']) {
            expect(resolveValenciaPgouZone('EDA', junk).classification?.code).toBe('EDA');
            expect(resolveValenciaPgouZone('ENS', junk).classification?.code).toBe('ENS');
        }
    });

    it('an empty calificación is `no-calificacion`, not `not-packed`', () => {
        expect(resolveValenciaPgouZone('').reason).toBe('no-calificacion');
        expect(resolveValenciaPgouZone(null).reason).toBe('no-calificacion');
        expect(valenciaCalificacionClassification(undefined)).toBeNull();
    });

    it('an unclassified code returns null — "not read", NOT "unregulated"', () => {
        // 110 base `califi` codes are live; 9 are classified. `null` is the COMMON case.
        expect(valenciaCalificacionClassification('BRL')).toBeNull();
        expect(valenciaCalificacionClassification('PQA')).toBeNull();
    });
});

describe('València — the cornice formula, pinned against the ordinance\'s OWN table', () => {
    it('⚠ Np is the graphed floor count MINUS ONE — all eight ENS rows', () => {
        // Art. 6.19.1: «Np el número de plantas a edificar sobre la baja (es decir el señalado en
        // los planos menos uno)». At 5 plantas the article says 16,40 m = 4,80 + 2,90·4. Reading
        // Np as the graphed count gives 19,30 m — a 2,90 m overstatement at EVERY band (L-616
        // mechanism-A). These eight rows discriminate the two readings decisively.
        for (const row of VALENCIA_ENS_HEIGHT_TABLE) {
            expect(
                valenciaCorniceHeightFromGraphedFloors('ENS', row.graphedFloors),
                `ENS at ${row.graphedFloors} plantas`,
            ).toBe(row.corniceHeight_m);
        }
    });

    it('the naive reading (Np = graphed floors) is REJECTED by the same table', () => {
        const five = VALENCIA_ENS_HEIGHT_TABLE.find((r) => r.graphedFloors === 5)!;
        expect(five.corniceHeight_m).toBe(16.4);
        expect(4.8 + 2.9 * 5).toBeCloseTo(19.3, 5); // what the wrong reading would publish
        expect(five.corniceHeight_m).not.toBeCloseTo(19.3, 5);
    });

    it('⚠ ENS and EDA have DIFFERENT intercepts — 4,80 vs 5,30', () => {
        const ens = VALENCIA_CORNICE_FORMULAS.find((f) => f.zone === 'ENS')!;
        const eda = VALENCIA_CORNICE_FORMULAS.find((f) => f.zone === 'EDA')!;
        expect(ens.intercept_m).toBe(4.8);
        expect(eda.intercept_m).toBe(5.3);
        expect(ens.intercept_m).not.toBe(eda.intercept_m);
        expect(ens.perStorey_m).toBe(eda.perStorey_m); // the shape IS identical — that is the trap
        // Copying ENS's constant into EDA would publish every EDA building 0,50 m short, silently.
        expect(valenciaCorniceHeightFromGraphedFloors('EDA', 5)).toBe(16.9);
        expect(valenciaCorniceHeightFromGraphedFloors('ENS', 5)).toBe(16.4);
    });

    it('every transcribed formula carries a verbatim quote naming Plano C', () => {
        for (const f of VALENCIA_CORNICE_FORMULAS) {
            expect(f.quote).toContain('Plano C');
            expect(f.quote).toContain('menos uno');
            expect(f.article).toMatch(/^Art\. 6\./);
        }
    });

    it('returns null rather than guessing for an unknown zone or an invalid floor count', () => {
        expect(valenciaCorniceHeightFromGraphedFloors('UFA', 3)).toBeNull(); // closed table, not this formula
        expect(valenciaCorniceHeightFromGraphedFloors('', 3)).toBeNull();
        expect(valenciaCorniceHeightFromGraphedFloors('ENS', 0)).toBeNull();
        expect(valenciaCorniceHeightFromGraphedFloors('ENS', 2.5)).toBeNull();
        expect(valenciaCorniceHeightFromGraphedFloors('ENS', Number.NaN)).toBeNull();
    });
});

describe('València — stated BOUNDS are recorded, never packed as scalars', () => {
    it('the three bounds each say why they are not packed, and quote the article', () => {
        expect(VALENCIA_STATED_BOUNDS.length).toBeGreaterThanOrEqual(3);
        for (const b of VALENCIA_STATED_BOUNDS) {
            expect(b.article).toMatch(/^Art\. 6\./);
            expect(b.whyNotPacked.length).toBeGreaterThan(60);
            expect(b.quote.length).toBeGreaterThan(40);
        }
    });

    it('⚠ the 20 m ENS depth fallback is recorded as CONDITIONAL', () => {
        // Art. 6.18.2 gates it on «Caso de no indicarse ésta» — where Plano C graphs no depth, a
        // fact PRYZM cannot observe. Packing 20 m would assert a claim about an unread document,
        // and it errs in BOTH directions.
        const depth = VALENCIA_STATED_BOUNDS.find((b) => b.article === 'Art. 6.18.2')!;
        expect(depth.quote).toContain('Caso de no indicarse ésta');
        expect(depth.quote).toContain('20 metros');
        expect(depth.whyNotPacked).toMatch(/CONDITIONAL/i);
    });

    it('the UFA ceiling is recorded as a BOUND, and is not on any envelope path', () => {
        const ufa = VALENCIA_STATED_BOUNDS.find((b) => b.code === 'UFA')!;
        expect(ufa.quote).toContain('Caso de no grafiarse');
        // A bound is not a determination: 10 m on a parcel graphed at 2 plantas overstates by 3 m.
        expect(ufa.whyNotPacked).toMatch(/not a per-parcel value/i);
    });
});

describe('València — the terminal refusal every parcel receives', () => {
    const refusal = valenciaNoRulePackRefusal('ENS', 'Ensanche', ['Referencia catastral: 6618617YJ2761H']);

    it('is a COVERAGE claim (`no-rule-pack`), not a claim about the law', () => {
        // The PGOU certainly DOES grant an envelope on this urban land. A legally-grounded "no"
        // would tell the owner of a buildable plot that the law forbids building — the opposite
        // error, and the worse one.
        expect(refusal.code).toBe('no-rule-pack');
        expect(refusal.legallyGrounded).toBe(false);
        expect(refusal.ordinanceRef).toBeNull();
    });

    it('is NOT transient — no number of retries digitises a 1991 drawing', () => {
        const env = buildRefusedEnvelope('ENS', refusal);
        expect(isRefusedEnvelope(env)).toBe(true);
        // ⚠ NOT `source-data-unavailable`. Nothing failed to fetch: Catastro answered, the
        // municipal service answered, and the ordinance was read. A transient code would offer a
        // RETRY affordance that could never succeed — no retry digitises a 1991 drawing.
        expect(isTransientRefusal(env)).toBe(false);
    });

    it('keeps every numeric envelope field null — unknown ≠ 0 (L-616)', () => {
        // ⚠ `insetAreaM2: 0` is deliberately EXCLUDED: it is the area of an empty polygon, a
        // structural fact rather than a buildable quantity. Every field that could be read as a
        // buildable determination must be `null`, never `0` and never a permissive default.
        const env = buildRefusedEnvelope('ENS', refusal);
        expect(env.maxHeight_m).toBeNull();
        expect(env.farLimitedHeight_m).toBeNull();
        expect(env.maxFloors).toBeNull();
        expect(env.maxFAR).toBeNull();
        expect(env.maxCoverage).toBeNull();
        expect(env.maxVolumeM3).toBeNull();
        expect(env.insetPolygon).toHaveLength(0);
    });

    it('⚠ leaks NO figure into the prose — the §DEC-1 leak test', () => {
        // Barcelona shipped a refusal card whose explanatory copy contained a figure a reader
        // could take for a determination. `4,80`, `2,90`, `20 m`, `10 m` must never appear here.
        const prose = `${refusal.headline} ${refusal.detail}`;
        expect(prose).not.toMatch(/\d+[.,]\d+\s*m\b/);
        expect(prose).not.toMatch(/\b\d+\s*(m|metros|metres|plantas|storeys)\b/i);
        expect(prose).not.toContain('4,80');
        expect(prose).not.toContain('2,90');
    });

    it('names Plano C, so the reader can tell a coverage gap from a crash', () => {
        expect(refusal.detail).toMatch(/PLANO C/i);
        expect(refusal.detail).toContain(VALENCIA_ROADMAP_LINE);
        expect(VALENCIA_ROADMAP_LINE).toMatch(/Plano C/);
    });

    it('preserves the caller\'s known facts — never a blank panel (L-553)', () => {
        expect(refusal.knownFacts).toContain('Referencia catastral: 6618617YJ2761H');
    });

    it('degrades to a land-identifying headline when no zone is held', () => {
        expect(valenciaNoRulePackRefusal().headline).toMatch(/València parcel/);
        expect(valenciaNoRulePackRefusal('EDA').headline).toMatch(/Zone EDA/);
    });
});

describe('València S5 — registry reachability', () => {
    it('is registered, and the coverage globe can see it', () => {
        const cov = listJurisdictionCoverage().find((c) => c.jurisdictionId === VALENCIA_JURISDICTION_ID);
        expect(cov, 'València must be registered — failure ≠ empty').toBeDefined();
        expect(cov?.countryCode).toBe('ES');
        expect(cov?.extent).toBe(VALENCIA_BBOX);
        expect(cov?.contains).toBe(isInValencia);
    });

    it('⚠ registers ZERO pack zone codes — PRESENT with nothing to say, not ABSENT', () => {
        expect(registeredPackZoneCodes(VALENCIA_JURISDICTION_ID)).toHaveLength(0);
    });

    it('the registry answers every zone code with the coverage refusal', () => {
        for (const code of ['ENS', 'EDA', 'UFA', 'CHP', 'TER', 'IND', 'ZZZ']) {
            const d = resolveZoneDisposition(VALENCIA_JURISDICTION_ID, code);
            expect(d.kind, `${code} must not resolve to a pack`).not.toBe('pack');
            expect(d.kind).not.toBe('unregistered');
        }
    });

    it('the answerSummary never promises an envelope', () => {
        const cov = listJurisdictionCoverage().find((c) => c.jurisdictionId === VALENCIA_JURISDICTION_ID)!;
        expect(cov.answerSummary).toMatch(/PLANO C/i);
        expect(cov.answerSummary).toMatch(/never an estimate/i);
    });
});

describe('València — the measured land shares (L-656 denominator)', () => {
    it('the delegation share is MEASURED, not assumed from Murcia', () => {
        expect(VALENCIA_DELEGATION_SHARE).toBe('measured');
    });

    it('PGOU-ordered + delegated account for the whole denominator', () => {
        expect(LAND.pgouOrderedPct + LAND.delegatedPct).toBeCloseTo(100, 1);
    });

    it('⚠ the denominator is PRIVATE BUILDABLE land, not all land (L-656)', () => {
        expect(LAND.privateBuildableHa).toBeLessThan(LAND.suelourbanoHa);
        expect(LAND.suelourbanoHa).toBeLessThan(LAND.layerTotalHa);
    });

    it('⚠ València delegates LESS than Murcia (67 %) — the prior was wrong, and it was measured', () => {
        expect(LAND.delegatedPct).toBeLessThan(67);
        expect(LAND.delegatedExcludingMpPct).toBeLessThan(LAND.delegatedPct);
    });

    it('the per-zone shares sum to the denominator', () => {
        const sum = Object.values(LAND.byZonePct).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(100, 0);
    });

    it('⚠ PGOU-ordered per-zone shares never exceed all-instrument shares', () => {
        for (const [zone, pct] of Object.entries(LAND.pgouOrderedByZonePct)) {
            const all = LAND.byZonePct[zone as keyof typeof LAND.byZonePct];
            expect(pct, `${zone} PGOU-ordered ≤ all-instrument`).toBeLessThanOrEqual(all);
        }
    });

    it('⚠ CHP is 92 % delegated — reading Título VI Cap. 2 would cover 0,81 %, not 10 %', () => {
        expect(LAND.byZonePct.CHP).toBeCloseTo(10.06, 2);
        expect(LAND.pgouOrderedByZonePct.CHP).toBeCloseTo(0.81, 2);
    });
});

describe('València — the layer-212 `altura` lead is fenced, not promoted', () => {
    it('⚠ the ZERO sentinel is the largest bucket, and it is NOT a storey count', () => {
        // 4 195 polygons carry the literal `0`. A parcel cannot be lawfully built to zero storeys:
        // `0` is a sentinel for "not set", i.e. UNKNOWN. C58 §1.7a / L-616 — `0` never means unknown.
        expect(VALENCIA_ALTURA_FIELD_MEASURE.zeroSentinelPctOfLayerArea).toBeGreaterThan(
            VALENCIA_ALTURA_FIELD_MEASURE.plausibleStoreyPctOfLayerArea,
        );
    });

    it('⚠ the honest lead is ~27 % of the layer\'s AREA, not the 65,5 % row count', () => {
        expect(VALENCIA_ALTURA_FIELD_MEASURE.plausibleStoreyPctOfLayerArea).toBeLessThan(30);
        expect(VALENCIA_ALTURA_FIELD_MEASURE.plausibleStoreyPctOfLayerArea).toBeGreaterThan(25);
    });

    it('has NOT been joined to the buildable denominator, and says so', () => {
        expect(VALENCIA_ALTURA_FIELD_MEASURE.joinedToBuildableDenominator).toBe(false);
    });

    it('the value classes account for the layer', () => {
        const m = VALENCIA_ALTURA_FIELD_MEASURE;
        const sum =
            m.plausibleStoreyPctOfLayerArea +
            m.zeroSentinelPctOfLayerArea +
            m.notAStoreyCountPctOfLayerArea +
            m.boundedStoreyPctOfLayerArea;
        expect(sum).toBeGreaterThan(98);
        expect(sum).toBeLessThanOrEqual(100.5);
    });
});
